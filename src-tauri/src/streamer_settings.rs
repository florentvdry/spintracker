//! Streamer overlay settings: which stats the OBS overlay shows and over which range.
//! Kept in `streamer_settings.json` next to the databases, so the settings survive
//! restarts and the overlay window can read them.

use std::fs;
use std::path::PathBuf;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::backend;

const SETTINGS_FILE: &str = "streamer_settings.json";
/// One JSON object with a version, a few dozen fields at most.
const MAX_SETTINGS_BYTES: usize = 16 * 1024 * 1024;
/// Sent to every window after a save, so an open overlay refreshes its display.
const CHANGED_EVENT: &str = "streamer-settings-changed";

fn settings_path(app: &AppHandle) -> PathBuf {
    backend::data_dir(app).join(SETTINGS_FILE)
}

/// The stored settings, or `null` before the first save or when the file is unreadable
/// (the UI then starts from its defaults).
pub fn get(app: &AppHandle) -> Value {
    let settings = match fs::read_to_string(settings_path(app)) {
        Ok(text) => serde_json::from_str::<Value>(&text).unwrap_or_else(|err| {
            log::warn!("[streamer] unreadable settings, using the defaults: {err}");
            Value::Null
        }),
        Err(_) => Value::Null,
    };
    json!({ "success": true, "settings": settings })
}

fn validate(settings: &Value) -> Result<String, String> {
    if !settings.is_object() {
        return Err("The streamer settings must be a JSON object.".into());
    }
    if !settings.get("version").is_some_and(Value::is_u64) {
        return Err("The streamer settings need a numeric version.".into());
    }
    let text = serde_json::to_string(settings).map_err(|e| e.to_string())?;
    if text.len() > MAX_SETTINGS_BYTES {
        return Err("The streamer settings are too large.".into());
    }
    Ok(text)
}

/// Saves the settings atomically (write beside, then rename), so a crash never leaves a
/// half-written file, and announces the change to open windows.
pub fn set(app: &AppHandle, settings: &Value) -> Value {
    let text = match validate(settings) {
        Ok(text) => text,
        Err(message) => return json!({ "success": false, "message": message }),
    };
    let path = settings_path(app);
    let temporary = path.with_extension("json.tmp");
    let result = fs::write(&temporary, text).and_then(|_| fs::rename(&temporary, &path));
    match result {
        Ok(()) => {
            if let Err(err) = app.emit(CHANGED_EVENT, ()) {
                log::warn!("[streamer] cannot announce the new settings: {err}");
            }
            json!({ "success": true })
        }
        Err(err) => {
            log::error!("[streamer] cannot save the settings: {err}");
            json!({ "success": false, "message": err.to_string() })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_versioned_objects_of_reasonable_size_are_accepted() {
        assert!(validate(&json!({ "version": 1, "range": "month" })).is_ok());
        assert!(validate(&json!([1, 2])).is_err());
        assert!(validate(&json!({ "range": "month" })).is_err());
        assert!(validate(&json!({ "version": "1" })).is_err());
        let huge = "x".repeat(MAX_SETTINGS_BYTES);
        assert!(validate(&json!({ "version": 1, "blob": huge })).is_err());
    }
}
