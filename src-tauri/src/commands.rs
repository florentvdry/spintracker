//! Tauri commands exposed to the React frontend.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::backend::BackendState;
use crate::autoimport::{self, WatchedFolder};
use crate::{api, backend, export, hud, hud_settings, import, updater};

const REPLAYER_BACKGROUND: tauri::window::Color = tauri::window::Color(14, 16, 20, 255);

/// Hand data handed to each replayer window, keyed by its label.
#[derive(Default)]
pub struct ReplayerState {
    data: Mutex<HashMap<String, Value>>,
    counter: AtomicU32,
}

/// Commands that change or export the user's data answer the main window only: the HUD and
/// replayer windows show hand data and have no reason to call them.
fn main_window_only(window: &WebviewWindow) -> Option<Value> {
    (window.label() != "main").then(|| json!({ "success": false, "message": "Only the main window can do this." }))
}

#[tauri::command]
pub async fn backend_request(app: AppHandle, method: String, endpoint: String, body: Option<Value>) -> Value {
    api::call(&app, &method, &endpoint, body).await
}

#[tauri::command]
pub fn check_server_status(app: AppHandle) -> Value {
    let state = app.state::<BackendState>();
    if state.ready().is_some() {
        json!({ "success": true, "status": "running" })
    } else if let Some(reason) = state.failure() {
        json!({ "success": false, "status": "error", "message": reason })
    } else {
        json!({ "success": false, "status": "stopped", "message": "The backend is starting" })
    }
}

#[tauri::command]
pub async fn import_hand_history(app: AppHandle, window: WebviewWindow) -> Value {
    if let Some(denied) = main_window_only(&window) {
        return denied;
    }
    import::run(app).await
}

#[tauri::command]
pub async fn export_data(app: AppHandle, window: WebviewWindow, dialog_title: String, filter: export::ExportFilter) -> Value {
    if let Some(denied) = main_window_only(&window) {
        return denied;
    }
    export::run(app, dialog_title, filter).await
}

/// The caller is responsible for asking the user to confirm first.
#[tauri::command]
pub async fn delete_all_hands(app: AppHandle, window: WebviewWindow) -> Value {
    if let Some(denied) = main_window_only(&window) {
        return denied;
    }
    api::call(&app, "POST", "/db/delete-all", Some(json!({}))).await
}

#[tauri::command]
pub async fn set_active_database(app: AppHandle, window: WebviewWindow, id: Value) -> Value {
    if let Some(denied) = main_window_only(&window) {
        return denied;
    }
    let id = match &id {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    };
    let endpoint = format!("/api/databases/{}/set-active", encode_segment(&id));
    // The watcher must not write into a database that is being swapped out.
    autoimport::pause(&app);
    let result = api::call(&app, "POST", &endpoint, Some(json!({}))).await;

    if result["success"].as_bool().unwrap_or(false) {
        // The database was swapped in place: bring the new one's statistics up to date.
        if let Some(backend) = app.state::<BackendState>().ready() {
            let handle = app.clone();
            let _ = tauri::async_runtime::spawn_blocking(move || backend::backfill(&handle, &backend)).await;
        }
    }
    autoimport::reload(&app);
    result
}

#[tauri::command]
pub fn auto_import_get(app: AppHandle) -> Value {
    autoimport::get(&app)
}

#[tauri::command]
pub fn auto_import_set(app: AppHandle, window: WebviewWindow, enabled: bool, folders: Vec<WatchedFolder>) -> Value {
    if let Some(denied) = main_window_only(&window) {
        return denied;
    }
    autoimport::set(&app, enabled, folders)
}

#[tauri::command]
pub fn hud_settings_get(app: AppHandle) -> Value {
    hud_settings::get(&app)
}

#[tauri::command]
pub fn hud_settings_set(app: AppHandle, settings: Value) -> Value {
    hud_settings::set(&app, &settings)
}

/// What the HUD window that asks should show. Only HUD windows may ask.
#[tauri::command]
pub async fn hud_get_state(app: AppHandle, window: WebviewWindow) -> Value {
    if !window.label().starts_with("hud-") {
        return Value::Null;
    }
    hud::state_of(&app, window.label())
}

/// The HUD page reports where its panels are, so the rest of the window lets clicks through.
#[tauri::command]
pub async fn hud_set_panel_rects(app: AppHandle, window: WebviewWindow, rects: Value) -> Value {
    if !window.label().starts_with("hud-") {
        return json!({ "success": false, "message": "Only HUD windows can do this." });
    }
    hud::set_panel_rects(&app, window.label(), &rects)
}

/// The tables the HUD found, and the tournaments they can be paired with.
#[tauri::command]
pub async fn hud_tables(app: AppHandle) -> Value {
    hud::tables(&app)
}

/// Pairs a table window with a tournament (the user's choice when the HUD could not tell).
#[tauri::command]
pub async fn hud_associate(app: AppHandle, table: i64, game_id: String) -> Value {
    hud::associate(&app, table, game_id)
}

#[tauri::command]
pub async fn hud_set_hidden(app: AppHandle, table: i64, hidden: bool) -> Value {
    hud::set_hidden(&app, table, hidden)
}

/// Development aid, debug builds only: see `hud::debug_attach`.
#[tauri::command]
pub async fn hud_debug_attach(app: AppHandle, title_contains: String, format: Option<String>) -> Value {
    hud::debug_attach(&app, &title_contains, format.as_deref())
}

#[tauri::command]
pub async fn hud_debug_detach(app: AppHandle) -> Value {
    hud::debug_detach(&app)
}

/// Lets the user choose a history folder; `null` when the dialog is cancelled.
#[tauri::command]
pub async fn auto_import_pick_folder(app: AppHandle) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || app.dialog().file().blocking_pick_folder())
        .await
        .ok()
        .flatten()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn open_logs_folder(app: AppHandle) -> Value {
    let dir = backend::logs_dir(&app);
    if !dir.exists() {
        return json!({ "success": false, "error": "Logs directory does not exist" });
    }
    match app.opener().open_path(dir.to_string_lossy(), None::<&str>) {
        Ok(()) => json!({ "success": true }),
        Err(err) => json!({ "success": false, "error": err.to_string() }),
    }
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn frontend_log(level: String, message: String) {
    let line = format!("[Frontend] {message}");
    match level.as_str() {
        "error" => log::error!("{line}"),
        "warn" => log::warn!("{line}"),
        "debug" => log::debug!("{line}"),
        _ => log::info!("{line}"),
    }
}

/// Called by the UI once initialization is done: swaps the splash for the app.
#[tauri::command]
pub fn app_ready(app: AppHandle) -> Value {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.maximize();
        let _ = main.show();
        let _ = main.set_focus();
    }
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }
    json!({ "success": true })
}

// Async on purpose: building a window from a synchronous command deadlocks the webview on Windows,
// which leaves the new window black.
#[tauri::command]
pub async fn open_replayer(app: AppHandle, state: tauri::State<'_, ReplayerState>, data: Value) -> Result<(), String> {
    let label = format!("replayer-{}", state.counter.fetch_add(1, Ordering::Relaxed));
    state.data.lock().unwrap_or_else(std::sync::PoisonError::into_inner).insert(label.clone(), data);

    let built = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("replayer.html".into()))
        .title("SpinTracker Replayer")
        .inner_size(1000.0, 700.0)
        .background_color(REPLAYER_BACKGROUND)
        .build();
    match built {
        Ok(window) => {
            // The hand is only needed while its window lives.
            let handle = app.clone();
            window.on_window_event(move |event| {
                if matches!(event, tauri::WindowEvent::Destroyed) {
                    handle.state::<ReplayerState>().data.lock().unwrap_or_else(std::sync::PoisonError::into_inner).remove(&label);
                }
            });
            Ok(())
        }
        Err(err) => {
            state.data.lock().unwrap_or_else(std::sync::PoisonError::into_inner).remove(&label);
            Err(err.to_string())
        }
    }
}

#[tauri::command]
pub fn replayer_get_data(window: WebviewWindow, state: tauri::State<ReplayerState>) -> Option<Value> {
    state.data.lock().unwrap_or_else(std::sync::PoisonError::into_inner).get(window.label()).cloned()
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) {
    updater::check(app).await;
}

#[tauri::command]
pub async fn download_update(app: AppHandle) {
    updater::download(app).await;
}

#[tauri::command]
pub fn quit_and_install(app: AppHandle) -> Result<(), String> {
    updater::install(&app)
}

/// Percent-encodes a value used as a URL path segment.
fn encode_segment(raw: &str) -> String {
    raw.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            other => format!("%{other:02X}"),
        })
        .collect()
}

/// The names the user plays under (hero and aliases), so the HUD can tell the hero from the opponents.
#[tauri::command]
pub async fn hud_set_heroes(app: AppHandle, names: Vec<String>) -> Value {
    hud::set_heroes(&app, names)
}
