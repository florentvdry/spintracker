//! The table HUD: panels laid over poker tables.
//!
//! The overlay is Windows-only. Everything that does not touch Win32 (seat arithmetic) builds and
//! is tested everywhere.

// Not used until tables are matched to hands, which needs measurements from a real client.
#[allow(dead_code)]
pub mod seats;
#[cfg(windows)]
mod overlay;
#[cfg(windows)]
mod win32;

use serde_json::{json, Value};
use tauri::AppHandle;

#[cfg(windows)]
pub use overlay::OverlayState;

/// State kept for the overlay windows; empty where there are none.
#[cfg(not(windows))]
#[derive(Default)]
pub struct OverlayState;

/// What the HUD page of window `label` shows, or `null`.
pub fn state_of(app: &AppHandle, label: &str) -> Value {
    #[cfg(windows)]
    {
        overlay::payload_of(app, label).unwrap_or(Value::Null)
    }
    #[cfg(not(windows))]
    {
        let _ = (app, label);
        Value::Null
    }
}

/// Records where the panels are in the HUD window, so clicks elsewhere go through to the table.
pub fn set_panel_rects(app: &AppHandle, label: &str, rects: &Value) -> Value {
    #[cfg(windows)]
    {
        match serde_json::from_value::<Vec<overlay::PanelRect>>(rects.clone()) {
            Ok(rects) => {
                overlay::set_panel_rects(app, label, rects);
                json!({ "success": true })
            }
            Err(err) => json!({ "success": false, "message": err.to_string() }),
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (app, label, rects);
        json!({ "success": false, "message": "The HUD is only available on Windows." })
    }
}

/// Development aid: lays a HUD window with example panels over the first visible window whose
/// title contains `title_contains`, to check the window behaviour without a poker table.
pub fn debug_attach(app: &AppHandle, title_contains: &str, format: Option<&str>) -> Value {
    #[cfg(all(windows, debug_assertions))]
    {
        let needle = title_contains.to_lowercase();
        let found = win32::visible_windows().into_iter().find(|(_, title)| title.to_lowercase().contains(&needle) && title != "SpinTracker HUD");
        match found {
            None => json!({ "success": false, "message": "No window with this title." }),
            Some((table, title)) => match overlay::attach(app, table, json!({ "demo": true, "format": format.unwrap_or("threeMax") })) {
                Ok(label) => json!({ "success": true, "label": label, "table": table, "title": title }),
                Err(message) => json!({ "success": false, "message": message }),
            },
        }
    }
    #[cfg(not(all(windows, debug_assertions)))]
    {
        let _ = (app, title_contains, format);
        json!({ "success": false, "message": "Only available in debug builds on Windows." })
    }
}

/// Development aid: closes every HUD window.
pub fn debug_detach(app: &AppHandle) -> Value {
    #[cfg(all(windows, debug_assertions))]
    {
        overlay::detach_all(app);
        json!({ "success": true })
    }
    #[cfg(not(all(windows, debug_assertions)))]
    {
        let _ = app;
        json!({ "success": false, "message": "Only available in debug builds on Windows." })
    }
}
