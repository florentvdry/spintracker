//! Hand history import: file picking, zip expansion and progress events.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use regex::Regex;
use serde_json::{json, Value};
use spintracker_core::api::Backend;
use spintracker_core::models::ImportProgress;
use spintracker_core::parsers::get_parser;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::backend::BackendState;

const PROGRESS_EVENT: &str = "import-progress";
// The counting phase fills the first 10% of the global progress bar.
const COUNTING_SHARE: f64 = 10.0;
const IMPORT_SHARE: f64 = 90.0;
/// Minimum delay between two progress events sent to the webview.
const EMIT_INTERVAL: Duration = Duration::from_millis(100);
/// Characters of a file read to recognise its room.
const SNIPPET_CHARS: usize = 4096;

/// Progress for one detected room, emitted while that room is imported.
const IMPORT_ROOM_PROGRESS_EVENT: &str = "import-room-progress";
/// The list of rooms detected before importing starts, so the UI can draw empty bars.
const IMPORT_ROOMS_DETECTED_EVENT: &str = "import-rooms-detected";
/// Display order of rooms when several are detected.
const ROOM_ORDER: &[&str] = &["Winamax", "Unibet", "Betclic"];

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
    let _ = app.emit(
        PROGRESS_EVENT,
        json!({
            "stage": "counting",
            "filesProcessed": 0,
            "totalFiles": total_files,
            "percent": 0,
            "handsImported": 0,
            "totalHands": Value::Null,
        }),
    );
    // Counting reads every file, so it runs on all cores. A file that cannot be counted only
    // leaves the total a little short.
    let total_hands_expected = backend.importer().count_hands_in(&files);

    // Phase 2: import the files and relay their progress.
    let file_share = IMPORT_SHARE / total_files as f64;
    let cancel = AtomicBool::new(false);
    // Totals of the files already finished, and progress of the one being imported.
    let mut done_imported: u64 = 0;
    let mut done_skipped: u64 = 0;
    let mut current_file = 0usize;
    let mut current = ImportProgress::default();
    let mut last_emit: Option<Instant> = None;

    let outcomes = backend.importer().import_files(&files, &cancel, |index, progress| {
        if index != current_file {
            // The previous file is finished: fold its counts into the totals.
            if current.success {
                done_imported += current.hands_imported as u64;
                done_skipped += current.hands_skipped as u64;
            }
            current_file = index;
        }
        let finished = progress.success;
        current = progress;
        // Thousands of small files would flood the webview with events.
        if !finished && last_emit.is_some_and(|t| t.elapsed() < EMIT_INTERVAL) {
            return;
        }
        last_emit = Some(Instant::now());
        let handled = done_imported + done_skipped + current.hands_imported as u64 + current.hands_skipped as u64;
        // Weighting by hands keeps the bar honest when files differ a lot in size; the per-file
        // share is only a fallback when the total could not be counted.
        let global = if total_hands_expected > 0 {
            (COUNTING_SHARE + IMPORT_SHARE * handled as f64 / total_hands_expected as f64).round()
        } else {
            let step = (f64::from(current.percent) * file_share / 100.0).round();
            (COUNTING_SHARE + (index as f64 * file_share).round() + step).round()
        };
        let _ = app.emit(
            PROGRESS_EVENT,
            json!({
                "stage": "importing",
                "filesProcessed": index,
                "totalFiles": total_files,
                "percent": global.min(100.0),
                "handsImported": done_imported + current.hands_imported as u64,
                "handsSkipped": done_skipped + current.hands_skipped as u64,
                "totalHands": if total_hands_expected > 0 { json!(total_hands_expected) } else { Value::Null },
            }),
        );
    });

    let outcomes = match outcomes {
        Ok(outcomes) => outcomes,
        Err(err) => {
            log::error!("[Import] failed: {err}");
            return json!({ "success": false, "message": err.to_string(), "errors": errors });
        }
    };
    let mut total_imported: u64 = 0;
    let mut total_skipped: u64 = 0;
    for (path, outcome) in files.iter().zip(outcomes) {
        match outcome {
            Ok(summary) => {
                total_imported += summary.imported as u64;
                total_skipped += summary.skipped as u64;
            }
            Err(err) => {
                log::error!("[Import] Error processing {}: {err}", path.display());
                errors.push(json!({ "file": file_name(path), "error": err.to_string() }));
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

/// One room detected among the selected files, with the files to import and the totals
/// counted before importing starts (used to size the per-room progress bar).
#[derive(Default, Clone)]
struct RoomPlan {
    room: String,
    files: Vec<PathBuf>,
    total_hands: u64,
    total_tournaments: u64,
}

/// Compiled tournament-id regex per room. The id is what repeats on every hand of the same
/// tournament, so counting distinct ids counts tournaments rather than hands.
fn tournament_regex(room: &str) -> Option<&'static Regex> {
    static WINAMAX: OnceLock<Regex> = OnceLock::new();
    static UNIBET: OnceLock<Regex> = OnceLock::new();
    static BETCLIC: OnceLock<Regex> = OnceLock::new();
    match room {
        "Winamax" => Some(WINAMAX.get_or_init(|| Regex::new(r#"HandId:\s*#([0-9]+)-"#).unwrap())),
        "Unibet" => Some(UNIBET.get_or_init(|| Regex::new(r#"Unibet Tournament #([0-9]+)"#).unwrap())),
        "Betclic" => Some(BETCLIC.get_or_init(|| Regex::new(r#"Game ID:\s*([A-Z0-9]+)"#).unwrap())),
        _ => None,
    }
}

/// Number of distinct tournaments found in `text` for `room`. Best-effort: rooms without a
/// stable tournament id in their export contribute 0.
fn count_tournaments(text: &str, room: &str) -> u64 {
    let Some(re) = tournament_regex(room) else { return 0 };
    let mut ids = HashSet::new();
    for cap in re.captures_iter(text) {
        if let Some(m) = cap.get(1) {
            ids.insert(m.as_str().to_string());
        }
    }
    ids.len() as u64
}

/// Reads every selected file once to detect its room and count hands and tournaments. Files
/// whose room cannot be detected are skipped. Returns the plans in a stable display order.
fn detect_rooms(backend: &Arc<Backend>, files: &[PathBuf]) -> (Vec<RoomPlan>, Vec<Value>) {
    let mut errors: Vec<Value> = Vec::new();
    let mut plans: HashMap<String, RoomPlan> = HashMap::new();
    for path in files {
        let text = match fs::read(path) {
            Ok(bytes) => String::from_utf8_lossy(&bytes).into_owned(),
            Err(err) => {
                errors.push(json!({ "file": file_name(path), "error": err.to_string() }));
                continue;
            }
        };
        let snippet: String = text.chars().take(SNIPPET_CHARS).collect();
        let Some(parser) = get_parser(&snippet) else { continue };
        let room = parser.room_name().to_string();
        let tournaments = count_tournaments(&text, &room);
        let hands = backend.importer().count_hands(path).unwrap_or(0) as u64;
        let plan = plans.entry(room.clone()).or_insert_with(|| RoomPlan {
            room: room.clone(),
            ..Default::default()
        });
        plan.files.push(path.clone());
        plan.total_hands += hands;
        plan.total_tournaments += tournaments;
    }
    let mut vec: Vec<RoomPlan> = plans.into_values().collect();
    vec.sort_by(|a, b| {
        let pa = ROOM_ORDER.iter().position(|r| *r == a.room.as_str()).unwrap_or(ROOM_ORDER.len());
        let pb = ROOM_ORDER.iter().position(|r| *r == b.room.as_str()).unwrap_or(ROOM_ORDER.len());
        pa.cmp(&pb)
    });
    (vec, errors)
}

/// Public entry point for the `import_history_rooms` command: pick files, detect rooms, then
/// import room by room while emitting per-room progress events.
pub async fn run_rooms(app: AppHandle) -> Value {
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

    let work_dir = temp_dir.clone();
    let outcome = tauri::async_runtime::spawn_blocking(move || import_rooms(&app, &backend, &selected, &work_dir))
        .await
        .unwrap_or_else(|err| json!({ "success": false, "message": err.to_string() }));

    if temp_dir.exists() {
        if let Err(err) = fs::remove_dir_all(&temp_dir) {
            log::error!("Failed to clean up temp dir: {err}");
        }
    }
    outcome
}

/// Expands zips, detects rooms, imports each room separately and reports per-room progress.
fn import_rooms(app: &AppHandle, backend: &Arc<Backend>, selected: &[PathBuf], temp_dir: &Path) -> Value {
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

    // Phase 1: detect the room of every file and count hands/tournaments per room.
    let (plans, detect_errors) = detect_rooms(backend, &files);
    errors.extend(detect_errors);
    let plans: Vec<RoomPlan> = plans.into_iter().filter(|p| !p.files.is_empty()).collect();
    if plans.is_empty() {
        return json!({ "success": false, "message": "No recognized hand history files found.", "errors": errors });
    }

    // Let the frontend draw one empty bar per detected room before importing starts.
    let _ = app.emit(
        IMPORT_ROOMS_DETECTED_EVENT,
        json!({
            "rooms": plans
                .iter()
                .map(|p| {
                    json!({
                        "room": p.room,
                        "totalHands": p.total_hands,
                        "totalTournaments": p.total_tournaments,
                    })
                })
                .collect::<Vec<_>>(),
        }),
    );

    // Phase 2: import room by room, forwarding progress split by room.
    let cancel = AtomicBool::new(false);
    let mut rooms_result: Vec<Value> = Vec::new();
    let mut total_imported: u64 = 0;
    let mut total_tournaments: u64 = 0;
    let mut files_processed: usize = 0;

    for plan in &plans {
        let total_hands = plan.total_hands;
        let mut done_imported: u64 = 0;
        let mut current_file_index: Option<usize> = None;
        let mut current_imported: u64 = 0;
        let mut files_done: usize = 0;
        let mut last_emit: Option<Instant> = None;

        let outcomes = backend.importer().import_files(&plan.files, &cancel, |index, progress| {
            if current_file_index != Some(index) {
                // The previous file is finished: fold its imported count into the room total.
                done_imported += current_imported;
                current_file_index = Some(index);
                files_done = index;
            }
            let finished = progress.success;
            current_imported = progress.hands_imported as u64;
            // Thousands of small files would flood the webview with events.
            if !finished && last_emit.is_some_and(|t| t.elapsed() < EMIT_INTERVAL) {
                return;
            }
            last_emit = Some(Instant::now());
            let room_imported = done_imported + current_imported;
            let percent = if total_hands > 0 {
                (room_imported as f64 / total_hands as f64 * 100.0).round()
            } else {
                0.0
            };
            let _ = app.emit(
                IMPORT_ROOM_PROGRESS_EVENT,
                json!({
                    "room": plan.room,
                    "handsImported": room_imported,
                    "totalHands": total_hands,
                    "percent": percent.min(100.0),
                    "filesProcessed": files_done,
                }),
            );
        });

        let outcomes = match outcomes {
            Ok(outcomes) => outcomes,
            Err(err) => {
                log::error!("[Import rooms] failed: {err}");
                return json!({ "success": false, "message": err.to_string(), "errors": errors });
            }
        };

        let mut room_imported: u64 = 0;
        for (path, outcome) in plan.files.iter().zip(outcomes) {
            match outcome {
                Ok(summary) => room_imported += summary.imported as u64,
                Err(err) => {
                    log::error!("[Import rooms] Error processing {}: {err}", path.display());
                    errors.push(json!({ "file": file_name(path), "error": err.to_string() }));
                }
            }
        }
        files_processed += plan.files.len();
        total_imported += room_imported;
        total_tournaments += plan.total_tournaments;
        rooms_result.push(json!({
            "room": plan.room,
            "handsImported": room_imported,
            "totalHands": total_hands,
            "percent": if total_hands > 0 { 100 } else { 0 },
        }));
    }

    json!({
        "success": true,
        "rooms": rooms_result,
        "totalHandsImported": total_imported,
        "totalTournaments": total_tournaments,
        "filesProcessed": files_processed,
        "errors": errors,
    })
}
