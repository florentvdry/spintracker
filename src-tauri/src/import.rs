//! Hand history import: file picking, zip expansion and progress events.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use serde_json::{json, Value};
use spintracker_core::api::Backend;
use spintracker_core::models::ImportProgress;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::backend::BackendState;

const PROGRESS_EVENT: &str = "import-progress";
// The counting phase fills the first 10% of the global progress bar.
const COUNTING_SHARE: f64 = 10.0;
const IMPORT_SHARE: f64 = 90.0;

fn collect_hand_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_hand_files(&path, out);
            continue;
        }
        // Only accept text/xml files from archives to avoid garbage.
        let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        if ext == "txt" || ext == "xml" {
            out.push(path);
        }
    }
}

fn extract_zip(zip_path: &Path, dest: &Path) -> Result<Vec<PathBuf>, String> {
    let file = fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    // `extract` rejects entries that would escape the destination (zip slip).
    archive.extract(dest).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    collect_hand_files(dest, &mut files);
    Ok(files)
}

fn file_name(path: &Path) -> String {
    path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

pub async fn run(app: AppHandle) -> Value {
    let Some(backend) = app.state::<BackendState>().ready() else {
        return json!({ "success": false, "message": "The backend is not ready yet." });
    };

    let picker_app = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        picker_app
            .dialog()
            .file()
            .add_filter("Hand History Files", &["txt", "xml", "zip"])
            .add_filter("All Files", &["*"])
            .blocking_pick_files()
    })
    .await
    .ok()
    .flatten();

    let Some(selected) = picked else {
        return json!({ "success": false, "message": "Import cancelled" });
    };
    let selected: Vec<PathBuf> = selected.into_iter().filter_map(|p| p.into_path().ok()).collect();

    let millis = chrono::Utc::now().timestamp_millis();
    let temp_dir = std::env::temp_dir().join(format!("SpinTracker_Import_{millis}"));

    // Parsing and writing are blocking work.
    let work_dir = temp_dir.clone();
    let outcome = tauri::async_runtime::spawn_blocking(move || import_files(&app, &backend, &selected, &work_dir))
        .await
        .unwrap_or_else(|err| json!({ "success": false, "message": err.to_string() }));

    if temp_dir.exists() {
        if let Err(err) = fs::remove_dir_all(&temp_dir) {
            log::error!("Failed to clean up temp dir: {err}");
        }
    }
    outcome
}

fn import_files(app: &AppHandle, backend: &Arc<Backend>, selected: &[PathBuf], temp_dir: &Path) -> Value {
    let mut files: Vec<PathBuf> = Vec::new();
    let mut errors: Vec<Value> = Vec::new();
    for path in selected {
        let is_zip = path.extension().map(|e| e.eq_ignore_ascii_case("zip")).unwrap_or(false);
        if !is_zip {
            files.push(path.clone());
            continue;
        }
        let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        match extract_zip(path, &temp_dir.join(stem)) {
            Ok(extracted) => files.extend(extracted),
            Err(err) => {
                log::error!("Failed to extract {}: {err}", path.display());
                errors.push(json!({ "file": file_name(path), "error": err }));
            }
        }
    }

    if files.is_empty() {
        return json!({ "success": false, "message": "No valid hand history files found to import.", "errors": errors });
    }

    let total_files = files.len();

    // Phase 1: count hands so the progress bar has a known total.
    let mut total_hands_expected: u64 = 0;
    for (index, path) in files.iter().enumerate() {
        let _ = app.emit(
            PROGRESS_EVENT,
            json!({
                "stage": "counting",
                "filesProcessed": index,
                "totalFiles": total_files,
                "percent": ((index as f64 / total_files as f64) * COUNTING_SHARE).round(),
                "handsImported": 0,
                "totalHands": Value::Null,
            }),
        );
        // A failed count is not fatal: the total is simply unknown.
        if let Ok(count) = backend.importer().count_hands(path) {
            total_hands_expected += count as u64;
        }
    }

    // Phase 2: import each file and relay its progress.
    let mut total_imported: u64 = 0;
    let mut total_skipped: u64 = 0;
    let file_share = IMPORT_SHARE / total_files as f64;
    let cancel = AtomicBool::new(false);

    for (files_processed, path) in files.iter().enumerate() {
        let name = file_name(path);
        let mut last = ImportProgress::default();
        let outcome = backend.importer().import_file(path, &cancel, |progress| {
            let current = (f64::from(progress.percent) * file_share / 100.0).round();
            let global = (COUNTING_SHARE + (files_processed as f64 * file_share).round() + current).round();
            let _ = app.emit(
                PROGRESS_EVENT,
                json!({
                    "stage": "importing",
                    "filesProcessed": files_processed,
                    "totalFiles": total_files,
                    "percent": global.min(100.0),
                    "handsImported": total_imported + progress.hands_imported as u64,
                    "handsSkipped": total_skipped + progress.hands_skipped as u64,
                    "totalHands": if total_hands_expected > 0 { json!(total_hands_expected) } else { Value::Null },
                }),
            );
            last = progress;
        });

        match outcome {
            Ok(summary) => {
                if last.success {
                    total_imported += summary.imported as u64;
                    total_skipped += summary.skipped as u64;
                }
            }
            Err(err) => {
                log::error!("[Import] Error processing {}: {err}", path.display());
                errors.push(json!({ "file": name, "error": err.to_string() }));
            }
        }
    }

    // Statistics are read from per-hand flags written during the import; nothing else to refresh.
    json!({
        "success": true,
        "handsImported": total_imported,
        "handsSkipped": total_skipped,
        "filesProcessed": total_files,
        "errors": errors,
    })
}
