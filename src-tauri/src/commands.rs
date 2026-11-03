//! Tauri commands exposed to the React frontend.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

use crate::{api, backend, export, import, updater};

const REPLAYER_BACKGROUND: tauri::window::Color = tauri::window::Color(14, 16, 20, 255);
const BACKEND_RESTART_DELAY: Duration = Duration::from_secs(1);

/// Hand data handed to each replayer window, keyed by its label.
#[derive(Default)]
pub struct ReplayerState {
    data: Mutex<HashMap<String, Value>>,
    counter: AtomicU32,
}

#[tauri::command]
pub async fn backend_request(method: String, endpoint: String, body: Option<Value>) -> Value {
    api::call(&method, &endpoint, body).await
}

#[tauri::command]
pub async fn check_server_status() -> Value {
    match api::client().get(api::url("/health")).send().await {
        Ok(response) if response.status().is_success() => json!({ "success": true, "status": "running" }),
        Ok(response) => json!({ "success": false, "status": "error", "message": response.status().to_string() }),
        Err(err) => json!({ "success": false, "status": "stopped", "message": err.to_string() }),
    }
}

#[tauri::command]
pub async fn import_hand_history(app: AppHandle) -> Value {
    import::run(app).await
}

#[tauri::command]
pub async fn export_data(app: AppHandle, dialog_title: String) -> Value {
    export::run(app, dialog_title).await
}

/// The caller is responsible for asking the user to confirm first.
#[tauri::command]
pub async fn delete_all_hands() -> Value {
    let result = api::call("POST", "/db/delete-all", Some(json!({}))).await;
    if result["success"].as_bool().unwrap_or(false) {
        // Resetting data also resets default stats and profiles.
        api::call("POST", "/reset-default-stats", Some(json!({}))).await;
    }
    result
}

#[tauri::command]
pub async fn set_active_database(app: AppHandle, id: Value) -> Value {
    let id = match &id {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    };
    let endpoint = format!("/api/databases/{}/set-active", urlencoding::encode(&id));
    let result = api::call("POST", &endpoint, Some(json!({}))).await;

    if result["success"].as_bool().unwrap_or(false) {
        // The backend opens its database at startup, so restart it.
        log::info!("[Database] Switching active database, restarting backend");
        backend::stop(&app);
        tokio::time::sleep(BACKEND_RESTART_DELAY).await;
        backend::start(&app);
    }
    result
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

#[tauri::command]
pub fn open_replayer(app: AppHandle, state: tauri::State<ReplayerState>, data: Value) -> Result<(), String> {
    let label = format!("replayer-{}", state.counter.fetch_add(1, Ordering::Relaxed));
    state.data.lock().unwrap().insert(label.clone(), data);

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("replayer.html".into()))
        .title("SpinTracker Replayer")
        .inner_size(1000.0, 700.0)
        .background_color(REPLAYER_BACKGROUND)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn replayer_get_data(window: WebviewWindow, state: tauri::State<ReplayerState>) -> Option<Value> {
    state.data.lock().unwrap().get(window.label()).cloned()
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
