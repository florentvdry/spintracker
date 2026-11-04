//! HUD windows laid over poker tables (Windows only).
//!
//! One transparent window per table, kept right above it in the z-order (never owned by it, see
//! `win32::place_above`). It never takes the focus, and lets every click through except those
//! landing on a panel. It only follows the table's rectangle: nothing else of the table is read.
//!
//! Locking rule: the state lock is never held while calling a Tauri window method. Those calls
//! wait for the main thread, and the main thread takes the same lock when the HUD page asks for
//! its state: holding it across such a call deadlocks the application.

use std::collections::HashMap;
use std::sync::mpsc::{channel, Receiver};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::Deserialize;
use serde_json::Value;
use tauri::window::Color;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

use super::win32::{self, Handle, WindowEvent};

const STATE_EVENT: &str = "hud-state";
/// How often the cursor is compared with the panels, and the HUD windows are checked to still sit
/// right above their table.
const CURSOR_POLL: Duration = Duration::from_millis(30);
/// The z-order check is slower: a table brought to the front is covered again within this delay.
const ZORDER_EVERY_N_POLLS: u32 = 5;
/// Rectangles reported per window: one per visible grid (several per seat) and per open popup.
const MAX_RECTS: usize = 128;

/// A panel's rectangle in the HUD window, in CSS pixels.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct PanelRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

struct Overlay {
    label: String,
    /// The HUD window's own handle, so the watchers never ask the window library for it.
    hud: Handle,
    /// What the HUD page shows; opaque to this module.
    payload: Value,
    panels: Vec<PanelRect>,
    /// Physical pixels per CSS pixel in the HUD window.
    scale: f64,
    /// Whether clicks currently go through the window.
    click_through: bool,
    /// Last physical rectangle given to the window.
    rect: Option<win32::Rect>,
}

#[derive(Default)]
struct Inner {
    overlays: HashMap<Handle, Overlay>,
    counter: u32,
}

#[derive(Default)]
pub struct OverlayState {
    inner: Mutex<Inner>,
}

impl OverlayState {
    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().expect("the HUD state lock is never held across a panic")
    }
}

static STARTED: OnceLock<()> = OnceLock::new();

/// Installs the window hooks and the cursor watcher, the first time a HUD window is needed: while
/// the HUD is unused, nothing watches any window.
fn ensure_started(app: &AppHandle) {
    if STARTED.set(()).is_err() {
        return;
    }
    let (sender, receiver) = channel();
    win32::watch_windows(sender);
    let events_app = app.clone();
    let _ = std::thread::Builder::new().name("hud-events".into()).spawn(move || handle_events(&events_app, receiver));
    let cursor_app = app.clone();
    let _ = std::thread::Builder::new().name("hud-cursor".into()).spawn(move || watch_cursor(&cursor_app));
}

/// Puts a HUD window over `table`, or refreshes the one already there.
pub fn attach(app: &AppHandle, table: Handle, payload: Value) -> Result<String, String> {
    if !win32::exists(table) {
        return Err("The table window no longer exists.".into());
    }
    ensure_started(app);
    let state = app.state::<OverlayState>();
    let existing = state.lock().overlays.get(&table).map(|o| o.label.clone());
    if let Some(label) = existing {
        set_payload(app, table, payload);
        return Ok(label);
    }

    let rect = win32::rect(table).ok_or("Cannot read the table rectangle.")?;
    let label = {
        let mut inner = state.lock();
        inner.counter += 1;
        format!("hud-{}", inner.counter)
    };

    // Registered before the window exists: its page asks for its state as soon as it loads.
    state.lock().overlays.insert(
        table,
        Overlay { label: label.clone(), hud: 0, payload, panels: Vec::new(), scale: 1.0, click_through: true, rect: Some(rect) },
    );

    let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("hud.html".into()))
        .title("SpinTracker HUD")
        .transparent(true)
        .background_color(Color(0, 0, 0, 0))
        .decorations(false)
        .shadow(false)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(false)
        .focused(false)
        .visible(false)
        .build();
    let window = match built {
        Ok(window) => window,
        Err(err) => {
            state.lock().overlays.remove(&table);
            return Err(err.to_string());
        }
    };
    let hud = win32::handle_of(window.hwnd().map_err(|e| e.to_string())?);
    let scale = window.scale_factor().unwrap_or(1.0);
    if let Some(overlay) = state.lock().overlays.get_mut(&table) {
        overlay.hud = hud;
        overlay.scale = scale;
    }

    place(&window, rect);
    win32::configure(hud, true);
    win32::place_above(hud, table);
    // The window library has to show the window once so that its webview starts drawing.
    let _ = window.show();
    win32::configure(hud, true);
    win32::place_above(hud, table);
    Ok(label)
}

fn place(window: &tauri::WebviewWindow, rect: win32::Rect) {
    let _ = window.set_position(PhysicalPosition::new(rect.x, rect.y));
    let _ = window.set_size(PhysicalSize::new(rect.width.max(1) as u32, rect.height.max(1) as u32));
}

/// Replaces what the HUD window of `table` shows.
pub fn set_payload(app: &AppHandle, table: Handle, payload: Value) {
    let label = {
        let state = app.state::<OverlayState>();
        let mut inner = state.lock();
        let Some(overlay) = inner.overlays.get_mut(&table) else { return };
        overlay.payload = payload.clone();
        overlay.label.clone()
    };
    let _ = app.emit_to(label, STATE_EVENT, payload);
}

/// Closes the HUD window of `table`.
pub fn detach(app: &AppHandle, table: Handle) {
    let removed = app.state::<OverlayState>().lock().overlays.remove(&table);
    if let Some(overlay) = removed {
        if let Some(window) = app.get_webview_window(&overlay.label) {
            let _ = window.close();
        }
    }
}

pub fn detach_all(app: &AppHandle) {
    let tables: Vec<Handle> = app.state::<OverlayState>().lock().overlays.keys().copied().collect();
    for table in tables {
        detach(app, table);
    }
}

/// The payload of the overlay behind a HUD window.
pub fn payload_of(app: &AppHandle, label: &str) -> Option<Value> {
    let state = app.state::<OverlayState>();
    let inner = state.lock();
    inner.overlays.values().find(|o| o.label == label).map(|o| o.payload.clone())
}

pub fn set_panel_rects(app: &AppHandle, label: &str, rects: Vec<PanelRect>) {
    let state = app.state::<OverlayState>();
    let mut inner = state.lock();
    if let Some(overlay) = inner.overlays.values_mut().find(|o| o.label == label) {
        overlay.panels = rects.into_iter().take(MAX_RECTS).collect();
    }
}

fn handle_events(app: &AppHandle, receiver: Receiver<(Handle, WindowEvent)>) {
    while let Ok((handle, event)) = receiver.recv() {
        let known = app.state::<OverlayState>().lock().overlays.contains_key(&handle);
        if !known {
            continue;
        }
        match event {
            WindowEvent::Destroyed => detach(app, handle),
            WindowEvent::Minimized => hide(app, handle),
            WindowEvent::Moved | WindowEvent::Restored => follow(app, handle),
        }
    }
}

fn hud_of(app: &AppHandle, table: Handle) -> Option<Handle> {
    app.state::<OverlayState>().lock().overlays.get(&table).map(|o| o.hud)
}

/// Hides and shows go through Win32 rather than the window library, whose `show` activates the
/// window and would take the focus from the table. The library only shows the window once, when it
/// is created, so that its webview starts drawing.
fn hide(app: &AppHandle, table: Handle) {
    if let Some(hud) = hud_of(app, table) {
        win32::hide(hud);
    }
}

/// Matches the HUD window to the table's rectangle, and shows it unless the table is minimized.
fn follow(app: &AppHandle, table: Handle) {
    if win32::is_minimized(table) || !win32::is_visible(table) {
        hide(app, table);
        return;
    }
    let Some(rect) = win32::rect(table) else { return };
    let (label, hud, click_through, changed) = {
        let state = app.state::<OverlayState>();
        let mut inner = state.lock();
        let Some(overlay) = inner.overlays.get_mut(&table) else { return };
        let changed = overlay.rect != Some(rect);
        overlay.rect = Some(rect);
        (overlay.label.clone(), overlay.hud, overlay.click_through, changed)
    };
    // The window is still being created: its handle is not known yet.
    if hud == 0 {
        return;
    }
    if changed {
        if let Some(window) = app.get_webview_window(&label) {
            place(&window, rect);
            let scale = window.scale_factor().unwrap_or(1.0);
            if let Some(overlay) = app.state::<OverlayState>().lock().overlays.get_mut(&table) {
                overlay.scale = scale;
            }
        }
    }
    win32::configure(hud, click_through);
    win32::place_above(hud, table);
    win32::show_without_focus(hud);
    win32::configure(hud, click_through);
}

/// Raises each HUD window back above its table when the table was brought to the front.
fn keep_above_tables(app: &AppHandle) {
    let pairs: Vec<(Handle, Handle)> = app.state::<OverlayState>().lock().overlays.iter().map(|(table, o)| (*table, o.hud)).collect();
    for (table, hud) in pairs {
        if win32::is_minimized(table) || !win32::is_visible(table) {
            continue;
        }
        if win32::is_visible(hud) && !win32::is_directly_above(hud, table) {
            win32::place_above(hud, table);
        }
    }
}

/// What the cursor watcher needs of an overlay, copied out of the lock.
struct Snapshot {
    table: Handle,
    hud: Handle,
    rect: win32::Rect,
    panels: Vec<PanelRect>,
    scale: f64,
    click_through: bool,
}

/// Lets clicks through the HUD windows except where a panel is, checked only while the cursor is
/// over a table.
fn watch_cursor(app: &AppHandle) {
    let mut polls = 0u32;
    loop {
        std::thread::sleep(CURSOR_POLL);
        polls = polls.wrapping_add(1);
        if polls % ZORDER_EVERY_N_POLLS == 0 {
            keep_above_tables(app);
        }
        let Some((cx, cy)) = win32::cursor() else { continue };
        let snapshots: Vec<Snapshot> = app
            .state::<OverlayState>()
            .lock()
            .overlays
            .iter()
            .filter_map(|(table, o)| {
                // Not yet created: the window handle is filled in once the window exists.
                if o.hud == 0 {
                    return None;
                }
                Some(Snapshot {
                    table: *table,
                    hud: o.hud,
                    rect: o.rect?,
                    panels: o.panels.clone(),
                    scale: o.scale,
                    click_through: o.click_through,
                })
            })
            .collect();

        for s in snapshots {
            let over_table = cx >= s.rect.x && cx < s.rect.x + s.rect.width && cy >= s.rect.y && cy < s.rect.y + s.rect.height;
            let (x, y) = (f64::from(cx - s.rect.x), f64::from(cy - s.rect.y));
            let over_panel = over_table
                && s.panels.iter().any(|p| x >= p.x * s.scale && x < (p.x + p.width) * s.scale && y >= p.y * s.scale && y < (p.y + p.height) * s.scale);
            let wanted = !over_panel;
            if wanted == s.click_through {
                continue;
            }
            if let Some(overlay) = app.state::<OverlayState>().lock().overlays.get_mut(&s.table) {
                overlay.click_through = wanted;
            }
            win32::configure(s.hud, wanted);
        }
    }
}
