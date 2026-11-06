/// Every command the webviews may call. With this list each one needs its own permission in a
/// capability (`allow-<name>`), so a window can be given only what it uses: the HUD windows are laid
/// over a poker client and get a handful.
const COMMANDS: &[&str] = &[
    "backend_request",
    "check_server_status",
    "import_hand_history",
    "export_data",
    "delete_all_hands",
    "set_active_database",
    "auto_import_get",
    "auto_import_set",
    "auto_import_pick_folder",
    "hud_settings_get",
    "hud_settings_set",
    "hud_get_state",
    "hud_tables",
    "hud_set_heroes",
    "hud_associate",
    "hud_set_hidden",
    "hud_set_panel_rects",
    "hud_debug_attach",
    "hud_debug_detach",
    "open_logs_folder",
    "get_app_version",
    "frontend_log",
    "app_ready",
    "open_replayer",
    "replayer_get_data",
    "check_for_updates",
    "download_update",
    "quit_and_install",
];

fn main() {
    let manifest = tauri_build::AppManifest::new().commands(COMMANDS);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest)).expect("failed to run the Tauri build script");
}
