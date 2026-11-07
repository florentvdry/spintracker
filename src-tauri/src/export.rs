//! Hand history export: one text file per day, zipped.

use std::collections::BTreeMap;
use std::fs::File;
use std::io::Write;

use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use zip::write::SimpleFileOptions;

use crate::api;

// Large enough to fetch every stored hand in one request.
const EXPORT_HAND_LIMIT: u64 = 1_000_000;

/// "2026-05-25 14:30:00" -> "2026-5-25" (unpadded, like the Betclic exports).
fn day_key(date_time: &str) -> Option<String> {
    let mut parts = date_time.get(..10)?.split('-');
    let year: u32 = parts.next()?.parse().ok()?;
    let month: u32 = parts.next()?.parse().ok()?;
    let day: u32 = parts.next()?.parse().ok()?;
    Some(format!("{year}-{month}-{day}"))
}

pub async fn run(app: AppHandle, dialog_title: String) -> Value {
    let hands_result = api::call(&app, "POST", "/db/hands", Some(json!({ "limit": EXPORT_HAND_LIMIT }))).await;
    if !hands_result["success"].as_bool().unwrap_or(false) {
        return json!({ "success": false, "message": "Failed to fetch hands" });
    }

    let hands = hands_result["data"]["hands"].as_array().cloned().unwrap_or_default();
    if hands.is_empty() {
        return json!({ "success": false, "message": "No hands to export" });
    }

    // Betclic files separate their hands with a line of dashes, which an import needs to find them.
    const BETCLIC_SEPARATOR: &str = "\n------------\n";
    let mut hands_by_day: BTreeMap<String, Vec<(bool, String)>> = BTreeMap::new();
    for hand in &hands {
        // Hands without raw content cannot be exported.
        let Some(raw) = hand["result"].as_str().filter(|r| !r.is_empty()) else { continue };
        let Some(key) = hand["date_time"].as_str().and_then(day_key) else { continue };
        let betclic = hand["room"].as_str().is_some_and(|room| room.trim().eq_ignore_ascii_case("betclic"));
        hands_by_day.entry(key).or_default().push((betclic, raw.to_string()));
    }

    if hands_by_day.is_empty() {
        return json!({ "success": false, "message": "No hands to export" });
    }

    let default_name = format!("SpinTracker_Export_{}.zip", chrono::Local::now().format("%Y-%m-%d"));
    let picker_app = app.clone();
    let target = tauri::async_runtime::spawn_blocking(move || {
        picker_app
            .dialog()
            .file()
            .set_title(dialog_title)
            .set_file_name(default_name)
            .add_filter("Zip Files", &["zip"])
            .blocking_save_file()
    })
    .await
    .ok()
    .flatten()
    .and_then(|p| p.into_path().ok());

    let Some(target) = target else {
        return json!({ "success": false, "message": "Export cancelled" });
    };

    let write_zip = || -> Result<(), String> {
        let file = File::create(&target).map_err(|e| e.to_string())?;
        let mut writer = zip::ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        for (day, contents) in &hands_by_day {
            writer
                .start_file(format!("ExportHH_{day}.txt"), options)
                .map_err(|e| e.to_string())?;
            let mut text = String::new();
            for (n, (betclic, raw)) in contents.iter().enumerate() {
                if n > 0 {
                    text.push_str(if *betclic { BETCLIC_SEPARATOR } else { "\n\n" });
                }
                text.push_str(raw);
            }
            writer.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        }
        writer.finish().map_err(|e| e.to_string())?;
        Ok(())
    };

    match write_zip() {
        Ok(()) => json!({ "success": true, "fileCount": hands_by_day.len() }),
        Err(err) => {
            log::error!("Export error: {err}");
            json!({ "success": false, "message": err })
        }
    }
}
