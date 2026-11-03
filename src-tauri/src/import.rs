//! Hand history import: file picking, zip expansion and SSE progress relay.

use std::fs;
use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tauri_plugin_dialog::DialogExt;

use crate::api;

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
        let ext = path
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
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
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

pub async fn run(app: AppHandle) -> Value {
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

    let outcome = import_files(&app, &selected, &temp_dir).await;

    if temp_dir.exists() {
        if let Err(err) = fs::remove_dir_all(&temp_dir) {
            log::error!("Failed to clean up temp dir: {err}");
        }
    }
    outcome
}

async fn import_files(app: &AppHandle, selected: &[PathBuf], temp_dir: &Path) -> Value {
    let mut files: Vec<PathBuf> = Vec::new();
    for path in selected {
        let is_zip = path
            .extension()
            .map(|e| e.eq_ignore_ascii_case("zip"))
            .unwrap_or(false);
        if !is_zip {
            files.push(path.clone());
            continue;
        }
        let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        match extract_zip(path, &temp_dir.join(stem)) {
            Ok(extracted) => files.extend(extracted),
            Err(err) => log::error!("Failed to extract {}: {err}", path.display()),
        }
    }

    if files.is_empty() {
        return json!({ "success": false, "message": "No valid hand history files found to import." });
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

        let response = api::client()
            .post(api::url("/import/count-hands"))
            .json(&json!({ "filePath": path.to_string_lossy() }))
            .send()
            .await;
        // A failed count is not fatal: the total is simply unknown.
        if let Ok(response) = response {
            if response.status().is_success() {
                if let Ok(body) = response.json::<Value>().await {
                    if body["success"].as_bool().unwrap_or(false) {
                        total_hands_expected += body["count"].as_u64().unwrap_or(0);
                    }
                }
            }
        }
    }

    // Phase 2: import each file and relay the backend's SSE progress.
    let mut total_imported: u64 = 0;
    let mut total_skipped: u64 = 0;
    let mut errors: Vec<Value> = Vec::new();
    let file_share = IMPORT_SHARE / total_files as f64;

    for (files_processed, path) in files.iter().enumerate() {
        let name = file_name(path);
        let response = api::client()
            .post(api::url("/import/file"))
            .json(&json!({ "filePath": path.to_string_lossy() }))
            .send()
            .await;

        let response = match response {
            Ok(r) if r.status().is_success() => r,
            Ok(r) => {
                errors.push(json!({ "file": name, "error": format!("Backend returned {}", r.status().as_u16()) }));
                continue;
            }
            Err(err) => {
                log::error!("[Import] Error processing {}: {err}", path.display());
                errors.push(json!({ "file": name, "error": err.to_string() }));
                continue;
            }
        };

        let mut buffer: Vec<u8> = Vec::new();
        let mut stream = response.bytes_stream();
        let mut file_imported: u64 = 0;
        let mut file_skipped: u64 = 0;
        let mut file_succeeded = false;
        let mut stream_error: Option<String> = None;

        while let Some(chunk) = stream.next().await {
            let chunk = match chunk {
                Ok(c) => c,
                Err(err) => {
                    stream_error = Some(err.to_string());
                    break;
                }
            };
            buffer.extend_from_slice(&chunk);

            // SSE events are separated by a blank line.
            while let Some(pos) = buffer.windows(2).position(|w| w == b"\n\n") {
                let raw: Vec<u8> = buffer.drain(..pos + 2).collect();
                let text = String::from_utf8_lossy(&raw);
                for line in text.lines() {
                    let Some(json_text) = line.strip_prefix("data:") else { continue };
                    let Ok(progress) = serde_json::from_str::<Value>(json_text.trim()) else {
                        log::error!("[Import] Failed to parse progress event");
                        continue;
                    };

                    if let Some(err) = progress.get("error").filter(|e| !e.is_null()) {
                        errors.push(json!({ "file": name, "error": err }));
                    }

                    let file_percent = progress["Percent"].as_f64().unwrap_or(0.0);
                    let current = (file_percent * file_share / 100.0).round();
                    let global = (COUNTING_SHARE + (files_processed as f64 * file_share).round() + current).round();

                    file_imported = progress["HandsImported"].as_u64().unwrap_or(0);
                    file_skipped = progress["HandsSkipped"].as_u64().unwrap_or(0);
                    file_succeeded = progress["Success"].as_bool().unwrap_or(false);

                    let _ = app.emit(
                        PROGRESS_EVENT,
                        json!({
                            "stage": "importing",
                            "filesProcessed": files_processed,
                            "totalFiles": total_files,
                            "percent": global.min(100.0),
                            "handsImported": total_imported + file_imported,
                            "handsSkipped": total_skipped + file_skipped,
                            "totalHands": if total_hands_expected > 0 { json!(total_hands_expected) } else { Value::Null },
                        }),
                    );
                }
            }
        }

        if let Some(err) = stream_error {
            errors.push(json!({ "file": name, "error": err }));
        }
        if file_succeeded {
            total_imported += file_imported;
            total_skipped += file_skipped;
        }
    }

    json!({
        "success": true,
        "handsImported": total_imported,
        "handsSkipped": total_skipped,
        "filesProcessed": total_files,
        "errors": errors,
    })
}
