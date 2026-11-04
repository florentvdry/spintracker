//! Automatic import: watches the hand-history folders and imports new hands as they are written.
//!
//! A single worker thread owns the watcher. File events are debounced, and a periodic sweep
//! catches whatever the watcher missed (and what changed while the app was closed). The worker is
//! paused while the active database is being swapped, then restarted on the new one.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use spintracker_core::api::Backend;
use spintracker_core::services::{is_history_file, list_history_files};
use tauri::{AppHandle, Emitter, Manager};

use crate::backend::{self, BackendState};

const CONFIG_FILE: &str = "auto_import.json";
const HANDS_IMPORTED_EVENT: &str = "hands-imported";
const STATUS_EVENT: &str = "auto-import-status";
/// A file is handled once it has been quiet this long: a room writes a hand in several bursts.
const DEBOUNCE: Duration = Duration::from_millis(800);
/// Safety net for missed file events.
const SWEEP_INTERVAL: Duration = Duration::from_secs(30);
/// How often the worker wakes up to check its timers.
const TICK: Duration = Duration::from_millis(250);

/// Rooms whose files can be watched. Betclic only offers manual exports.
const WATCHABLE_ROOMS: [&str; 2] = ["Winamax", "Unibet"];

/// Where Unibet writes its automatic exports, relative to the Documents folder.
const UNIBET_EXPORT_FOLDER: [&str; 4] = ["Unibet Poker", "History", "Exports", "Automatic"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WatchedFolder {
    pub room: String,
    pub path: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct DatabaseSettings {
    enabled: bool,
    folders: Vec<WatchedFolder>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Config {
    /// Settings per database id: each database has its own folders.
    databases: HashMap<String, DatabaseSettings>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum State {
    Off,
    Watching,
    Importing,
    Paused,
    Error,
}

#[derive(Debug, Clone, Serialize)]
struct Status {
    state: State,
    message: Option<String>,
}

enum Msg {
    /// A path the watcher reported.
    Changed(PathBuf),
    /// Re-read the settings of the active database and restart the watcher.
    Reload,
    /// Stop watching (the database is about to change).
    Pause,
}

/// Handle to the worker, kept in the Tauri state.
pub struct AutoImportState {
    sender: Mutex<Option<Sender<Msg>>>,
    status: Arc<Mutex<Status>>,
}

impl Default for AutoImportState {
    fn default() -> Self {
        Self { sender: Mutex::new(None), status: Arc::new(Mutex::new(Status { state: State::Off, message: None })) }
    }
}

impl AutoImportState {
    fn send(&self, msg: Msg) {
        if let Some(sender) = self.sender.lock().unwrap().as_ref() {
            let _ = sender.send(msg);
        }
    }
}

/// Starts the worker. Safe to call once, at launch.
pub fn start(app: &AppHandle) {
    let state = app.state::<AutoImportState>();
    let (tx, rx) = channel();
    *state.sender.lock().unwrap() = Some(tx.clone());
    let status = state.status.clone();
    let app = app.clone();
    std::thread::Builder::new()
        .name("auto-import".into())
        .spawn(move || Worker::new(app, tx, rx, status).run())
        .map_err(|err| log::error!("[auto-import] cannot start the worker: {err}"))
        .ok();
}

/// Stops watching until [`reload`] is called.
pub fn pause(app: &AppHandle) {
    app.state::<AutoImportState>().send(Msg::Pause);
}

/// Applies the settings of the active database.
pub fn reload(app: &AppHandle) {
    app.state::<AutoImportState>().send(Msg::Reload);
}

fn config_path(app: &AppHandle) -> PathBuf {
    backend::data_dir(app).join(CONFIG_FILE)
}

fn load_config(app: &AppHandle) -> Config {
    match fs::read_to_string(config_path(app)) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_else(|err| {
            log::warn!("[auto-import] unreadable settings, using the defaults: {err}");
            Config::default()
        }),
        Err(_) => Config::default(),
    }
}

fn save_config(app: &AppHandle, config: &Config) -> Result<(), String> {
    let text = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(config_path(app), text).map_err(|e| e.to_string())
}

fn active_database_id(backend: &Backend) -> Option<String> {
    backend.registry().get_active().map(|d| d.id)
}

/// Settings of the active database.
fn active_settings(app: &AppHandle) -> Option<(String, DatabaseSettings)> {
    let backend = app.state::<BackendState>().ready()?;
    let id = active_database_id(&backend)?;
    let settings = load_config(app).databases.remove(&id).unwrap_or_default();
    Some((id, settings))
}

/// Only existing absolute folders of a watchable room are accepted: the paths come from the UI.
fn validate(folders: Vec<WatchedFolder>) -> Result<Vec<WatchedFolder>, String> {
    let mut accepted: Vec<WatchedFolder> = Vec::new();
    for folder in folders {
        if !WATCHABLE_ROOMS.contains(&folder.room.as_str()) {
            return Err(format!("Automatic import is not available for {}", folder.room));
        }
        let path = Path::new(&folder.path);
        if !path.is_absolute() || !path.is_dir() {
            return Err(format!("Not an existing folder: {}", folder.path));
        }
        if !accepted.contains(&folder) {
            accepted.push(folder);
        }
    }
    Ok(accepted)
}

/// Unibet's default export folder, when it exists.
fn unibet_folder(documents: &Path) -> Option<WatchedFolder> {
    let dir = UNIBET_EXPORT_FOLDER.iter().fold(documents.to_path_buf(), |path, part| path.join(part));
    dir.is_dir().then(|| WatchedFolder { room: "Unibet".into(), path: dir.to_string_lossy().into_owned() })
}

/// Where the rooms keep their history on a default install. Only folders that exist are returned.
fn detect_folders(app: &AppHandle) -> Vec<WatchedFolder> {
    let mut found = Vec::new();
    let mut roots: Vec<(PathBuf, &str)> = Vec::new();
    if let Ok(documents) = app.path().document_dir() {
        found.extend(unibet_folder(&documents));
        roots.push((documents.join("Winamax Poker").join("accounts"), "history"));
    }
    if let Ok(roaming) = app.path().config_dir() {
        roots.push((roaming.join("winamax").join("documents").join("accounts"), "History"));
    }
    for (accounts, history) in roots {
        let Ok(entries) = fs::read_dir(&accounts) else { continue };
        for account in entries.flatten().map(|e| e.path()).filter(|p| p.is_dir()) {
            let dir = account.join(history);
            if dir.is_dir() {
                found.push(WatchedFolder { room: "Winamax".into(), path: dir.to_string_lossy().into_owned() });
            }
        }
    }
    found
}

pub fn get(app: &AppHandle) -> Value {
    let state = app.state::<AutoImportState>();
    let status = state.status.lock().unwrap().clone();
    let (enabled, folders) = active_settings(app).map_or((false, Vec::new()), |(_, s)| (s.enabled, s.folders));
    json!({
        "success": true,
        "enabled": enabled,
        "folders": folders,
        "detected": detect_folders(app),
        "status": status,
    })
}

pub fn set(app: &AppHandle, enabled: bool, folders: Vec<WatchedFolder>) -> Value {
    let folders = match validate(folders) {
        Ok(folders) => folders,
        Err(message) => return json!({ "success": false, "message": message }),
    };
    let Some(backend) = app.state::<BackendState>().ready() else {
        return json!({ "success": false, "message": "The backend is not ready yet." });
    };
    let Some(id) = active_database_id(&backend) else {
        return json!({ "success": false, "message": "No active database." });
    };
    let mut config = load_config(app);
    config.databases.insert(id, DatabaseSettings { enabled, folders });
    if let Err(message) = save_config(app, &config) {
        return json!({ "success": false, "message": message });
    }
    reload(app);
    json!({ "success": true })
}

/// The history files a file-system event is about (creations and writes only).
fn changed_history_files(event: Event) -> Vec<PathBuf> {
    if !matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
        return Vec::new();
    }
    event.paths.into_iter().filter(|p| is_history_file(p)).collect()
}

struct Worker {
    app: AppHandle,
    tx: Sender<Msg>,
    rx: Receiver<Msg>,
    status: Arc<Mutex<Status>>,
    watcher: Option<RecommendedWatcher>,
    folders: Vec<PathBuf>,
    paused: bool,
    /// Settings still have to be applied (the backend was not ready yet, or a reload was asked).
    reload_due: bool,
    /// Files waiting for their writer to go quiet, with the time of the last event.
    pending: HashMap<PathBuf, Instant>,
    last_sweep: Instant,
}

impl Worker {
    fn new(app: AppHandle, tx: Sender<Msg>, rx: Receiver<Msg>, status: Arc<Mutex<Status>>) -> Self {
        Self {
            app,
            tx,
            rx,
            status,
            watcher: None,
            folders: Vec::new(),
            paused: false,
            reload_due: true,
            pending: HashMap::new(),
            last_sweep: Instant::now(),
        }
    }

    fn run(mut self) {
        loop {
            match self.rx.recv_timeout(TICK) {
                Ok(Msg::Changed(path)) => {
                    if !self.paused {
                        self.pending.insert(path, Instant::now());
                    }
                }
                Ok(Msg::Reload) => {
                    self.paused = false;
                    self.reload_due = true;
                }
                Ok(Msg::Pause) => self.pause(),
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => return,
            }
            if self.paused {
                continue;
            }
            if self.reload_due {
                self.apply_settings();
            }
            self.flush_quiet_files();
            if self.watcher.is_some() && self.last_sweep.elapsed() >= SWEEP_INTERVAL {
                self.sweep();
            }
        }
    }

    fn set_status(&self, state: State, message: Option<String>) {
        let status = Status { state, message };
        *self.status.lock().unwrap() = status.clone();
        let _ = self.app.emit(STATUS_EVENT, status);
    }

    fn pause(&mut self) {
        self.paused = true;
        self.watcher = None;
        self.pending.clear();
        self.set_status(State::Paused, None);
    }

    /// Reads the settings of the active database and (re)starts the watcher on its folders.
    fn apply_settings(&mut self) {
        // Settings come from the active database, known once the backend is ready.
        let Some((_, settings)) = active_settings(&self.app) else { return };
        self.reload_due = false;
        self.watcher = None;
        self.pending.clear();
        self.folders = settings.folders.iter().map(|f| PathBuf::from(&f.path)).filter(|p| p.is_dir()).collect();

        if !settings.enabled || self.folders.is_empty() {
            self.set_status(State::Off, None);
            return;
        }
        match self.watch_folders() {
            Ok(watcher) => {
                self.watcher = Some(watcher);
                self.set_status(State::Watching, None);
                // Catches up with what changed while the app was closed.
                self.sweep();
            }
            Err(err) => {
                log::error!("[auto-import] cannot watch the folders: {err}");
                self.set_status(State::Error, Some(err.to_string()));
            }
        }
    }

    fn watch_folders(&self) -> notify::Result<RecommendedWatcher> {
        let tx = self.tx.clone();
        let mut watcher = notify::recommended_watcher(move |event: notify::Result<Event>| match event {
            Ok(event) => {
                for path in changed_history_files(event) {
                    let _ = tx.send(Msg::Changed(path));
                }
            }
            Err(err) => log::warn!("[auto-import] watcher error: {err}"),
        })?;
        for folder in &self.folders {
            watcher.watch(folder, RecursiveMode::Recursive)?;
        }
        Ok(watcher)
    }

    /// Queues every history file whose size or modification time differs from the last import.
    fn sweep(&mut self) {
        self.last_sweep = Instant::now();
        let Some(backend) = self.app.state::<BackendState>().ready() else { return };
        let mut changed = Vec::new();
        for folder in &self.folders {
            for path in list_history_files(folder) {
                match backend.importer().needs_live_import(&path) {
                    Ok(true) => changed.push(path),
                    Ok(false) => {}
                    Err(err) => log::debug!("[auto-import] cannot check {}: {err}", path.display()),
                }
            }
        }
        // Old events are already pending; the sweep adds its files as if they had just changed.
        let now = Instant::now().checked_sub(DEBOUNCE).unwrap_or_else(Instant::now);
        for path in changed {
            self.pending.entry(path).or_insert(now);
        }
    }

    fn flush_quiet_files(&mut self) {
        let due: Vec<PathBuf> =
            self.pending.iter().filter(|(_, last)| last.elapsed() >= DEBOUNCE).map(|(path, _)| path.clone()).collect();
        if due.is_empty() {
            return;
        }
        let Some(backend) = self.app.state::<BackendState>().ready() else { return };
        for path in &due {
            self.pending.remove(path);
        }

        self.set_status(State::Importing, None);
        let (mut hands, mut files) = (0usize, 0usize);
        let mut failure = None;
        for path in due {
            if !path.is_file() {
                continue;
            }
            match backend.importer().import_path(&path) {
                Ok(Some(result)) if result.imported > 0 => {
                    hands += result.imported;
                    files += 1;
                }
                Ok(_) => {}
                Err(err) => {
                    log::error!("[auto-import] {}: {err}", path.display());
                    failure = Some(err.to_string());
                }
            }
        }
        match failure {
            Some(message) => self.set_status(State::Error, Some(message)),
            None => self.set_status(State::Watching, None),
        }
        if hands > 0 {
            log::info!("[auto-import] {hands} hands imported from {files} files");
            let _ = self.app.emit(HANDS_IMPORTED_EVENT, json!({ "imported": hands, "files": files }));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_existing_absolute_folders_of_watchable_rooms_are_accepted() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_string_lossy().into_owned();
        let ok = WatchedFolder { room: "Winamax".into(), path: path.clone() };
        assert_eq!(validate(vec![ok.clone(), ok.clone()]).unwrap(), vec![ok]);

        assert!(validate(vec![WatchedFolder { room: "Betclic".into(), path: path.clone() }]).is_err());
        let unibet = WatchedFolder { room: "Unibet".into(), path: path.clone() };
        assert_eq!(validate(vec![unibet.clone()]).unwrap(), vec![unibet]);
        assert!(validate(vec![WatchedFolder { room: "Winamax".into(), path: "relative/dir".into() }]).is_err());
        assert!(validate(vec![WatchedFolder { room: "Winamax".into(), path: format!("{path}/missing") }]).is_err());
    }

    #[test]
    fn the_real_watcher_reports_created_and_appended_history_files_only() {
        let dir = tempfile::tempdir().unwrap();
        let (tx, rx) = channel();
        let mut watcher = notify::recommended_watcher(move |event: notify::Result<Event>| {
            if let Ok(event) = event {
                for path in changed_history_files(event) {
                    let _ = tx.send(path);
                }
            }
        })
        .unwrap();
        watcher.watch(dir.path(), RecursiveMode::Recursive).unwrap();

        let history = dir.path().join("hands.txt");
        fs::write(dir.path().join("notes.log"), "ignored").unwrap();
        fs::write(&history, "first hand
").unwrap();
        let mut file = fs::OpenOptions::new().append(true).open(&history).unwrap();
        std::io::Write::write_all(&mut file, b"second hand
").unwrap();
        drop(file);

        let first = rx.recv_timeout(Duration::from_secs(5)).expect("an event for the history file");
        assert_eq!(first.file_name(), history.file_name());
        // Whatever follows concerns the same file: the .log file never shows up.
        while let Ok(path) = rx.recv_timeout(Duration::from_millis(500)) {
            assert_eq!(path.file_name(), history.file_name());
        }
    }

    #[test]
    fn unibet_default_folder_is_detected_only_when_it_exists() {
        let documents = tempfile::tempdir().unwrap();
        assert_eq!(unibet_folder(documents.path()), None);

        let export = documents.path().join("Unibet Poker").join("History").join("Exports").join("Automatic");
        fs::create_dir_all(&export).unwrap();
        let found = unibet_folder(documents.path()).expect("the folder exists now");
        assert_eq!((found.room.as_str(), Path::new(&found.path)), ("Unibet", export.as_path()));
    }

    #[test]
    fn config_is_read_per_database() {
        let text = r#"{"databases":{"a":{"enabled":true,"folders":[{"room":"Winamax","path":"C:\\x"}]}}}"#;
        let config: Config = serde_json::from_str(text).unwrap();
        assert!(config.databases["a"].enabled);
        assert!(config.databases.get("b").is_none());
    }
}
