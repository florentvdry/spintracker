mod api;
mod autoimport;
mod backend;
mod commands;
mod export;
mod hud;
mod hud_settings;
mod import;
mod updater;

use std::time::Duration;

use tauri::{Manager, WindowEvent};
use tauri_plugin_log::{Target, TargetKind};

const STARTUP_UPDATE_CHECK_DELAY: Duration = Duration::from_secs(3);
// The UI normally signals readiness once the backend answers (up to ~60s). If it never does,
// show the main window anyway so the splash screen cannot stay on top forever.
const SPLASH_FAILSAFE_DELAY: Duration = Duration::from_secs(90);

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(backend::BackendState::default())
        .manage(autoimport::AutoImportState::default())
        .manage(hud::OverlayState::default())
        .manage(commands::ReplayerState::default())
        .manage(updater::UpdateState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            app.handle().plugin(
                tauri_plugin_log::Builder::new()
                    .level(log::LevelFilter::Info)
                    .targets([
                        Target::new(TargetKind::Stdout),
                        Target::new(TargetKind::Folder {
                            path: backend::logs_dir(&handle),
                            file_name: Some("main".into()),
                        }),
                    ])
                    .build(),
            )?;

            log::info!("--- App Starting ---");
            log::info!("Version: {}", handle.package_info().version);
            log::info!("UserData: {}", backend::data_dir(&handle).display());

            backend::start(&handle);
            autoimport::start(&handle);

            let failsafe_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(SPLASH_FAILSAFE_DELAY).await;
                if failsafe_handle.get_webview_window("splash").is_some() {
                    commands::app_ready(failsafe_handle);
                }
            });

            // Update checks need the signing public key, which dev builds lack.
            if !cfg!(debug_assertions) {
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(STARTUP_UPDATE_CHECK_DELAY).await;
                    updater::check(handle).await;
                });
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, WindowEvent::Destroyed) {
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::backend_request,
            commands::check_server_status,
            commands::import_hand_history,
            commands::export_data,
            commands::delete_all_hands,
            commands::set_active_database,
            commands::auto_import_get,
            commands::auto_import_set,
            commands::auto_import_pick_folder,
            commands::hud_settings_get,
            commands::hud_settings_set,
            commands::hud_get_state,
            commands::hud_set_panel_rects,
            commands::hud_debug_attach,
            commands::hud_debug_detach,
            commands::open_logs_folder,
            commands::get_app_version,
            commands::frontend_log,
            commands::app_ready,
            commands::open_replayer,
            commands::replayer_get_data,
            commands::check_for_updates,
            commands::download_update,
            commands::quit_and_install,
        ])
        .build(tauri::generate_context!())
        .expect("error while building SpinTracker");

    app.run(|_handle, _event| {});
}
