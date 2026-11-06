//! HUD profiles and panel positions, kept in one JSON file next to the databases.
//!
//! The file does not depend on the active database: a profile is a way of looking at players,
//! not data about them. It never holds player names, notes or figures.

use std::fs;
use std::path::PathBuf;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::backend;

const SETTINGS_FILE: &str = "hud_settings.json";
/// A profile holds two layouts of a few hundred cells each, and there are up to twenty profiles:
/// a few megabytes at most. This only stops a runaway payload from the webview.
const MAX_SETTINGS_BYTES: usize = 16 * 1024 * 1024;
/// Sent to every window after a save, so that an open HUD window reads the new settings.
const CHANGED_EVENT: &str = "hud-settings-changed";

fn settings_path(app: &AppHandle) -> PathBuf {
    backend::data_dir(app).join(SETTINGS_FILE)
}

/// The stored settings, or `null` before the first save or when the file is unreadable (the UI
/// then starts from its defaults).
pub fn get(app: &AppHandle) -> Value {
    let settings = match fs::read_to_string(settings_path(app)) {
        Ok(text) => serde_json::from_str::<Value>(&text).unwrap_or_else(|err| {
            log::warn!("[hud] unreadable settings, using the defaults: {err}");
            Value::Null
        }),
        Err(_) => Value::Null,
    };
    json!({ "success": true, "settings": settings })
}

fn validate(settings: &Value) -> Result<String, String> {
    if !settings.is_object() {
        return Err("The HUD settings must be a JSON object.".into());
    }
    if !settings.get("version").is_some_and(Value::is_u64) {
        return Err("The HUD settings need a numeric version.".into());
    }
    let text = serde_json::to_string(settings).map_err(|e| e.to_string())?;
    if text.len() > MAX_SETTINGS_BYTES {
        return Err("The HUD settings are too large.".into());
    }
    Ok(text)
}

pub fn set(app: &AppHandle, settings: &Value) -> Value {
    let text = match validate(settings) {
        Ok(text) => text,
        Err(message) => return json!({ "success": false, "message": message }),
    };
    let path = settings_path(app);
    // Written beside the target then renamed, so a crash never leaves a half-written file.
    let temporary = path.with_extension("json.tmp");
    let result = fs::write(&temporary, text).and_then(|_| fs::rename(&temporary, &path));
    match result {
        Ok(()) => {
            if let Err(err) = app.emit(CHANGED_EVENT, ()) {
                log::warn!("[hud] cannot announce the new settings: {err}");
            }
            json!({ "success": true })
        }
        Err(err) => {
            log::error!("[hud] cannot save the settings: {err}");
            json!({ "success": false, "message": err.to_string() })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_versioned_objects_of_reasonable_size_are_accepted() {
        assert!(validate(&json!({ "version": 1, "profiles": [] })).is_ok());
        assert!(validate(&json!([1, 2])).is_err());
        assert!(validate(&json!({ "profiles": [] })).is_err());
        assert!(validate(&json!({ "version": "1" })).is_err());
        let huge = "x".repeat(MAX_SETTINGS_BYTES);
        assert!(validate(&json!({ "version": 1, "blob": huge })).is_err());
    }
}
