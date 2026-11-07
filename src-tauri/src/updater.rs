//! Auto-update flow on top of tauri-plugin-updater.
//!
//! Emits `update-status` events with the same shape the UI already consumed
//! under Electron: checking | available | not-available | downloading |
//! downloaded | error.

use std::sync::Mutex;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

const STATUS_EVENT: &str = "update-status";

#[derive(Default)]
pub struct UpdateState {
    pending: Mutex<Option<Update>>,
    downloaded: Mutex<Option<Vec<u8>>>,
}

fn emit(app: &AppHandle, payload: Value) {
    let _ = app.emit(STATUS_EVENT, payload);
}

pub async fn check(app: AppHandle) {
    emit(&app, json!({ "status": "checking" }));

    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(err) => return emit(&app, json!({ "status": "error", "error": err.to_string() })),
    };

    match updater.check().await {
        Ok(Some(update)) => {
            emit(
                &app,
                json!({
                    "status": "available",
                    "version": update.version,
                    "releaseNotes": update.body.clone().unwrap_or_default(),
                }),
            );
            *app.state::<UpdateState>().pending.lock().unwrap_or_else(std::sync::PoisonError::into_inner) = Some(update);
        }
        Ok(None) => emit(&app, json!({ "status": "not-available" })),
        Err(err) => {
            log::error!("[Updater] {err}");
            emit(&app, json!({ "status": "error", "error": err.to_string() }));
        }
    }
}

pub async fn download(app: AppHandle) {
    let update = app.state::<UpdateState>().pending.lock().unwrap_or_else(std::sync::PoisonError::into_inner).clone();
    let Some(update) = update else {
        return emit(&app, json!({ "status": "error", "error": "No update available" }));
    };

    let mut received: u64 = 0;
    let mut last_percent: i64 = -1;
    let progress_app = app.clone();

    let result = update
        .download(
            move |chunk, total| {
                received += chunk as u64;
                let percent = total.map(|t| (received as f64 / t as f64) * 100.0).unwrap_or(0.0);
                // Only emit when the integer percentage changes.
                if percent as i64 != last_percent {
                    last_percent = percent as i64;
                    emit(&progress_app, json!({ "status": "downloading", "progress": { "percent": percent } }));
                }
            },
            || {},
        )
        .await;

    match result {
        Ok(bytes) => {
            *app.state::<UpdateState>().downloaded.lock().unwrap_or_else(std::sync::PoisonError::into_inner) = Some(bytes);
            emit(&app, json!({ "status": "downloaded", "version": update.version }));
        }
        Err(err) => {
            log::error!("[Updater] download failed: {err}");
            emit(&app, json!({ "status": "error", "error": err.to_string() }));
        }
    }
}

pub fn install(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<UpdateState>();
    let update = state.pending.lock().unwrap_or_else(std::sync::PoisonError::into_inner).clone().ok_or("No update available")?;
    let bytes = state.downloaded.lock().unwrap_or_else(std::sync::PoisonError::into_inner).take().ok_or("Update not downloaded")?;
    update.install(bytes).map_err(|e| e.to_string())?;
    app.restart();
}
