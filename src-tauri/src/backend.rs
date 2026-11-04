//! Lifecycle of the in-process backend (`spintracker-core`).

use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde_json::json;
use spintracker_core::api::Backend;
use tauri::{AppHandle, Emitter, Manager};

const APP_DATA_FOLDER: &str = "SpinTracker";
const LEGACY_DATA_FOLDER: &str = "poker-tracker-pro";
const DB_FILE_NAME: &str = "poker_tracker.db";
pub const BACKFILL_EVENT: &str = "backfill-progress";

/// The backend once it is ready to answer; an error message when it could not start.
#[derive(Default)]
pub struct BackendState {
    inner: Mutex<Status>,
}

#[derive(Default)]
enum Status {
    #[default]
    Starting,
    Ready(Arc<Backend>),
    Failed(String),
}

impl BackendState {
    pub fn ready(&self) -> Option<Arc<Backend>> {
        match &*self.inner.lock().unwrap_or_else(std::sync::PoisonError::into_inner) {
            Status::Ready(backend) => Some(backend.clone()),
            _ => None,
        }
    }

    /// `Err` with the reason when the backend failed to start.
    pub fn failure(&self) -> Option<String> {
        match &*self.inner.lock().unwrap_or_else(std::sync::PoisonError::into_inner) {
            Status::Failed(reason) => Some(reason.clone()),
            _ => None,
        }
    }

    fn set(&self, status: Status) {
        *self.inner.lock().unwrap_or_else(std::sync::PoisonError::into_inner) = status;
    }
}

/// Same folder as the former Electron `userData`, so existing databases and
/// settings are picked up without any migration.
pub fn data_dir(app: &AppHandle) -> PathBuf {
    let base = app.path().config_dir().unwrap_or_else(|_| std::env::temp_dir());
    base.join(APP_DATA_FOLDER)
}

pub fn logs_dir(app: &AppHandle) -> PathBuf {
    data_dir(app).join("logs")
}

/// The database a first run starts with, copied from the Electron-era folder when it exists.
fn default_db_path(app: &AppHandle) -> PathBuf {
    let user_data = data_dir(app);
    let db_path = user_data.join(DB_FILE_NAME);

    if !db_path.exists() {
        let legacy_dir = user_data.parent().map(|p| p.join(LEGACY_DATA_FOLDER)).unwrap_or_default();
        let legacy_db = legacy_dir.join(DB_FILE_NAME);
        if legacy_db.exists() {
            log::info!("Migrating database from {}", legacy_db.display());
            let result = fs::create_dir_all(&user_data).and_then(|_| fs::copy(&legacy_db, &db_path).map(|_| ()));
            match result {
                Ok(()) => {
                    let legacy_config = legacy_dir.join("config.json");
                    if legacy_config.exists() {
                        let _ = fs::copy(&legacy_config, user_data.join("config.json"));
                    }
                }
                Err(err) => log::error!("Failed to migrate database: {err}"),
            }
        }
    }

    if let Err(err) = fs::create_dir_all(&user_data) {
        log::error!("Failed to create data directory: {err}");
    }
    db_path
}

/// Opens the database, brings its stored statistics up to date, then marks the backend ready.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<BackendState>();
        let backend = match Backend::open(data_dir(&app), Some(&default_db_path(&app))) {
            Ok(backend) => Arc::new(backend),
            Err(err) => {
                log::error!("Failed to start backend: {err}");
                state.set(Status::Failed(err.to_string()));
                return;
            }
        };
        backfill(&app, &backend);
        state.set(Status::Ready(backend));
        log::info!("Backend ready");
    });
}

/// Computes the stat flags that are missing (databases created by the former backend, or after an
/// update changed them), reporting progress to the UI.
pub fn backfill(app: &AppHandle, backend: &Backend) {
    let result = backend.backfill_flags(|done, total| {
        log::info!("Updating statistics: {done}/{total} hands");
        let _ = app.emit(BACKFILL_EVENT, json!({ "done": done, "total": total }));
    });
    if let Err(err) = result {
        log::error!("Failed to update statistics: {err}");
    }
}
