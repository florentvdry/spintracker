//! Lifecycle of the C# backend process (ASP.NET Core, port 5050).

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;

use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

pub const BACKEND_PORT: u16 = 5050;
const APP_DATA_FOLDER: &str = "SpinTracker";
const LEGACY_DATA_FOLDER: &str = "poker-tracker-pro";
const DB_FILE_NAME: &str = "poker_tracker.db";
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Default)]
pub struct BackendState {
    pid: Mutex<Option<u32>>,
}

/// Same folder as the former Electron `userData`, so existing databases and
/// settings are picked up without any migration.
pub fn data_dir(app: &AppHandle) -> PathBuf {
    let base = app
        .path()
        .config_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    base.join(APP_DATA_FOLDER)
}

pub fn logs_dir(app: &AppHandle) -> PathBuf {
    data_dir(app).join("logs")
}

fn db_path(app: &AppHandle) -> PathBuf {
    let user_data = data_dir(app);
    let db_path = user_data.join(DB_FILE_NAME);

    if !db_path.exists() {
        let legacy_dir = user_data
            .parent()
            .map(|p| p.join(LEGACY_DATA_FOLDER))
            .unwrap_or_default();
        let legacy_db = legacy_dir.join(DB_FILE_NAME);
        if legacy_db.exists() {
            log::info!("Migrating database from {}", legacy_db.display());
            let result = fs::create_dir_all(&user_data)
                .and_then(|_| fs::copy(&legacy_db, &db_path).map(|_| ()));
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

fn backend_command(app: &AppHandle) -> Result<Command, String> {
    let db_arg = format!("--db-path={}", db_path(app).display());
    let port = BACKEND_PORT.to_string();

    let mut cmd = if cfg!(debug_assertions) {
        let backend_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("backend");
        let mut cmd = Command::new("dotnet");
        cmd.args(["run", "--", &port, &db_arg]).current_dir(backend_dir);
        cmd
    } else {
        let backend_dir = app
            .path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join("backend");
        let exe = backend_dir.join("SpinTrackerBackend.exe");
        if !exe.exists() {
            return Err(format!("Backend executable not found: {}", exe.display()));
        }
        let mut cmd = Command::new(exe);
        cmd.args([&port, &db_arg]).current_dir(backend_dir);
        cmd
    };

    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(false);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    Ok(cmd)
}

pub fn start(app: &AppHandle) {
    let state = app.state::<BackendState>();
    let mut guard = state.pid.lock().unwrap();
    if guard.is_some() {
        return;
    }

    let app_handle = app.clone();
    // Reserve the slot immediately so concurrent calls do not spawn twice.
    *guard = Some(0);
    drop(guard);

    tauri::async_runtime::spawn(async move {
        let mut child = match backend_command(&app_handle).and_then(|mut c| c.spawn().map_err(|e| e.to_string())) {
            Ok(child) => child,
            Err(err) => {
                log::error!("Failed to start backend: {err}");
                *app_handle.state::<BackendState>().pid.lock().unwrap() = None;
                return;
            }
        };

        let pid = child.id().unwrap_or(0);
        *app_handle.state::<BackendState>().pid.lock().unwrap() = Some(pid);

        if let Some(stdout) = child.stdout.take() {
            tauri::async_runtime::spawn(async move {
                let mut lines = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let line = line.trim();
                    // Routine ASP.NET request logs are noise.
                    if line.is_empty()
                        || line.contains("info: Microsoft.AspNetCore.Hosting.Diagnostics")
                        || line.contains("info: Microsoft.AspNetCore.Routing.EndpointMiddleware")
                    {
                        continue;
                    }
                    log::info!("[Backend] {line}");
                }
            });
        }

        if let Some(stderr) = child.stderr.take() {
            tauri::async_runtime::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let line = line.trim();
                    if line.is_empty() || (line.contains("127.0.0.1") && line.contains("HTTP/1.1")) {
                        continue;
                    }
                    log::error!("[Backend-Err] {line}");
                }
            });
        }

        match child.wait().await {
            Ok(status) if !status.success() => log::error!("Backend exited with {status}"),
            Err(err) => log::error!("Failed to wait for backend: {err}"),
            _ => {}
        }

        let state = app_handle.state::<BackendState>();
        let mut guard = state.pid.lock().unwrap();
        if *guard == Some(pid) {
            *guard = None;
        }
    });
}

/// Kills the whole process tree: `dotnet run` would otherwise leave orphans.
pub fn stop(app: &AppHandle) {
    let pid = app.state::<BackendState>().pid.lock().unwrap().take();
    let Some(pid) = pid.filter(|p| *p != 0) else {
        return;
    };

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let result = std::process::Command::new("taskkill")
            .args(["/pid", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
        if let Err(err) = result {
            log::error!("Failed to kill backend process tree: {err}");
        }
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("kill").arg(pid.to_string()).status();
    }
}
