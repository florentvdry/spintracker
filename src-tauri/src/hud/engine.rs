//! Finds poker tables, matches them to the tournaments being played, and shows the HUD on them
//! (Windows only).
//!
//! It does nothing until the HUD is turned on for a room. Then, every few seconds, it lists the
//! visible windows of the room's client (title, rectangle and the name of the owning program,
//! nothing else), asks the backend which tournaments have hands being written, and pairs the two:
//!
//! - one table and one tournament: paired automatically;
//! - several: paired when the window title names the tournament, otherwise left "to associate" for
//!   the user to pick. A panel is never shown on a table that is not paired: it could be the wrong one.
//!
//! While at least one table is open the application is in "table mode": equity is not computed.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use regex::Regex;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use super::overlay;
use super::win32::{self, Handle};
use crate::backend::{self, BackendState};

const SETTINGS_FILE: &str = "hud_settings.json";
const TICK: Duration = Duration::from_millis(1500);
/// A tournament counts as being played when a hand was written in this many minutes.
const DEFAULT_ACTIVE_MINUTES: i64 = 30;
/// Smaller windows (pop-ups, the lobby's dialogs) are not tables.
const MIN_TABLE_WIDTH: i32 = 500;
const MIN_TABLE_HEIGHT: i32 = 350;

/// Rooms with a client the HUD knows how to look for. The program name and the window title
/// pattern are a first guess, adjustable in the HUD settings (`detection`).
struct RoomDefaults {
    room: &'static str,
    process: &'static str,
    /// Titles that are the client's own window, not a table.
    not_tables: &'static [&'static str],
}

const ROOMS: [RoomDefaults; 2] = [
    RoomDefaults { room: "Winamax", process: "winamax", not_tables: &["winamax", "winamax poker"] },
    RoomDefaults { room: "Unibet", process: "unibet", not_tables: &["unibet", "unibet poker"] },
];

static TABLE_MODE: AtomicBool = AtomicBool::new(false);
static STARTED: OnceLock<()> = OnceLock::new();

/// Whether a poker table is open: equity must not be computed.
pub fn table_mode() -> bool {
    TABLE_MODE.load(Ordering::Relaxed)
}

#[derive(Default)]
pub struct EngineState {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    /// Table window to tournament, chosen by the user or found automatically.
    associations: HashMap<Handle, String>,
    /// Tables the user asked to hide the HUD on.
    hidden: HashSet<Handle>,
    /// What the UI shows, refreshed each tick.
    view: Value,
    /// What each shown table last received, to send only changes.
    sent: HashMap<Handle, Value>,
}

impl EngineState {
    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().expect("the HUD engine lock is never held across a panic")
    }
}

/// Starts the engine thread (once). It idles while the HUD is off.
pub fn start(app: &AppHandle) {
    if STARTED.set(()).is_err() {
        return;
    }
    let app = app.clone();
    let _ = std::thread::Builder::new().name("hud-engine".into()).spawn(move || loop {
        std::thread::sleep(TICK);
        tick(&app);
    });
}

fn settings_path(app: &AppHandle) -> PathBuf {
    backend::data_dir(app).join(SETTINGS_FILE)
}

/// How the user configured the HUD, as far as the engine cares.
struct Config {
    rooms: Vec<RoomConfig>,
}

struct RoomConfig {
    defaults: &'static RoomDefaults,
    process: String,
    title: Regex,
    active_minutes: i64,
}

fn read_config(app: &AppHandle) -> Config {
    let settings: Value = std::fs::read_to_string(settings_path(app)).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null);
    let enabled = settings["enabled"].as_bool() != Some(false);
    let rooms = ROOMS
        .iter()
        .filter(|d| enabled && settings["rooms"][d.room].as_bool() != Some(false))
        .map(|defaults| {
            let detection = &settings["detection"][defaults.room];
            let process = detection["process"].as_str().filter(|p| !p.trim().is_empty()).unwrap_or(defaults.process).trim().to_lowercase();
            // A pattern that does not compile falls back to "any title" rather than hiding the HUD.
            let title = detection["titleRegex"]
                .as_str()
                .filter(|p| !p.trim().is_empty())
                .and_then(|p| Regex::new(p).ok())
                .unwrap_or_else(|| Regex::new(".").expect("a valid pattern"));
            let active_minutes = detection["activeMinutes"].as_i64().filter(|m| *m > 0).unwrap_or(DEFAULT_ACTIVE_MINUTES);
            RoomConfig { defaults, process, title, active_minutes }
        })
        .collect();
    Config { rooms }
}

struct TableWindow {
    handle: Handle,
    title: String,
}

/// The table windows of a room: visible, big enough, of the room's program, not its lobby.
fn table_windows(config: &RoomConfig) -> Vec<TableWindow> {
    win32::visible_windows()
        .into_iter()
        .filter(|(handle, title)| {
            let lower = title.trim().to_lowercase();
            !config.defaults.not_tables.contains(&lower.as_str())
                && config.title.is_match(title)
                && win32::rect(*handle).is_some_and(|r| r.width >= MIN_TABLE_WIDTH && r.height >= MIN_TABLE_HEIGHT)
                && win32::process_name(*handle).is_some_and(|name| name.to_lowercase().contains(&config.process))
        })
        .map(|(handle, title)| TableWindow { handle, title })
        .collect()
}

fn active_tables(app: &AppHandle, room: &str, minutes: i64) -> Vec<Value> {
    let Some(backend) = app.state::<BackendState>().ready() else { return Vec::new() };
    let since = (chrono::Utc::now() - chrono::Duration::minutes(minutes)).format("%Y-%m-%d %H:%M:%S").to_string();
    let response = backend.handle("GET", &format!("/hud/tables?room={room}&since={}", since.replace(' ', "%20")), None);
    response.body["data"].as_array().cloned().unwrap_or_default()
}

/// Whether a window title names a tournament (its id, or its name when long enough to mean something).
fn title_names(title: &str, table: &Value) -> bool {
    let lower = title.to_lowercase();
    let id = table["gameId"].as_str().unwrap_or_default();
    let name = table["tournamentName"].as_str().unwrap_or_default().to_lowercase();
    (!id.is_empty() && lower.contains(&id.to_lowercase())) || (name.len() >= 6 && lower.contains(&name))
}

fn tick(app: &AppHandle) {
    let config = read_config(app);
    let engine = app.state::<EngineState>();

    if config.rooms.is_empty() {
        let was_open = table_mode();
        TABLE_MODE.store(false, Ordering::Relaxed);
        let had_overlays = !engine.lock().sent.is_empty();
        if had_overlays {
            overlay::detach_all(app);
        }
        *engine.lock() = Inner::default();
        if was_open {
            log::info!("[hud] turned off");
        }
        return;
    }
    if app.state::<BackendState>().ready().is_none() {
        return;
    }

    let mut view_tables: Vec<Value> = Vec::new();
    let mut candidates: Vec<Value> = Vec::new();
    let mut shown: HashMap<Handle, Value> = HashMap::new();
    let mut open_tables: HashSet<Handle> = HashSet::new();

    for room in &config.rooms {
        let windows = table_windows(room);
        let active = active_tables(app, room.defaults.room, room.active_minutes);
        candidates.extend(active.iter().cloned());
        open_tables.extend(windows.iter().map(|w| w.handle));

        let mut inner = engine.lock();
        // Pairings that no longer hold: the window closed or the tournament ended.
        inner.associations.retain(|handle, game| {
            windows.iter().any(|w| w.handle == *handle) && active.iter().any(|t| t["gameId"].as_str() == Some(game.as_str()))
        });

        let claimed: HashSet<String> = inner.associations.values().cloned().collect();
        let free_windows: Vec<&TableWindow> = windows.iter().filter(|w| !inner.associations.contains_key(&w.handle)).collect();
        let free_tournaments: Vec<&Value> = active.iter().filter(|t| !claimed.contains(t["gameId"].as_str().unwrap_or_default())).collect();

        let mut new_pairs: Vec<(Handle, String)> = Vec::new();
        if free_windows.len() == 1 && free_tournaments.len() == 1 {
            new_pairs.push((free_windows[0].handle, free_tournaments[0]["gameId"].as_str().unwrap_or_default().to_string()));
        } else {
            for w in &free_windows {
                let named: Vec<&&Value> = free_tournaments.iter().filter(|t| title_names(&w.title, t)).collect();
                if let [only] = named.as_slice() {
                    new_pairs.push((w.handle, only["gameId"].as_str().unwrap_or_default().to_string()));
                }
            }
        }
        for (handle, game) in new_pairs {
            inner.associations.insert(handle, game);
        }

        for w in &windows {
            let hidden = inner.hidden.contains(&w.handle);
            let table = inner.associations.get(&w.handle).and_then(|game| active.iter().find(|t| t["gameId"].as_str() == Some(game.as_str())));
            let (state, info) = match table {
                Some(t) if hidden => ("hidden", Some(t)),
                Some(t) => {
                    shown.insert(
                        w.handle,
                        json!({
                            "room": room.defaults.room, "format": t["format"], "hero": t["hero"], "gameId": t["gameId"],
                            "players": t["players"],
                            // Changes with every hand, so the HUD page reads the figures again.
                            "lastHandAt": t["lastHandAt"],
                        }),
                    );
                    ("shown", Some(t))
                }
                None if active.is_empty() => ("waiting", None),
                None => ("toAssociate", None),
            };
            view_tables.push(json!({
                "id": w.handle, "room": room.defaults.room, "title": w.title, "state": state,
                "gameId": info.map(|t| t["gameId"].clone()), "tournamentName": info.map(|t| t["tournamentName"].clone()),
                "opponents": info.map(|t| t["players"].clone()),
            }));
        }
    }

    // Table mode follows the tables that are open, whether or not a panel can be shown on them.
    let was_open = table_mode();
    let is_open = !open_tables.is_empty();
    TABLE_MODE.store(is_open, Ordering::Relaxed);
    if was_open != is_open {
        log::info!("[hud] table mode {}", if is_open { "on: equity is not computed" } else { "off" });
    }

    // Panels: attach or refresh the tables that are paired, close the others.
    let previously_sent: Vec<Handle> = engine.lock().sent.keys().copied().collect();
    for handle in previously_sent {
        if !shown.contains_key(&handle) {
            overlay::detach(app, handle);
            engine.lock().sent.remove(&handle);
        }
    }
    for (handle, payload) in shown {
        let unchanged = engine.lock().sent.get(&handle) == Some(&payload);
        if unchanged {
            continue;
        }
        match overlay::attach(app, handle, payload.clone()) {
            Ok(_) => {
                engine.lock().sent.insert(handle, payload);
            }
            Err(err) => log::warn!("[hud] cannot show the HUD on a table: {err}"),
        }
    }

    engine.lock().view = json!({ "success": true, "enabled": true, "tableMode": is_open, "tables": view_tables, "candidates": candidates });
}

/// What the HUD page of the main window lists: detected tables and the tournaments they can be paired with.
pub fn view(app: &AppHandle) -> Value {
    let view = app.state::<EngineState>().lock().view.clone();
    if view.is_null() {
        json!({ "success": true, "enabled": false, "tableMode": false, "tables": [], "candidates": [] })
    } else {
        view
    }
}

/// Pairs a table window with a tournament by hand.
pub fn associate(app: &AppHandle, table: Handle, game_id: String) -> Value {
    let engine = app.state::<EngineState>();
    let mut inner = engine.lock();
    inner.associations.retain(|_, game| *game != game_id);
    inner.associations.insert(table, game_id);
    inner.hidden.remove(&table);
    json!({ "success": true })
}

pub fn set_hidden(app: &AppHandle, table: Handle, hidden: bool) -> Value {
    let engine = app.state::<EngineState>();
    let mut inner = engine.lock();
    if hidden {
        inner.hidden.insert(table);
    } else {
        inner.hidden.remove(&table);
    }
    json!({ "success": true })
}
