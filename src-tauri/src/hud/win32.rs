//! The few Win32 calls the table HUD needs.
//!
//! They only read what Windows shows of any window (its title, rectangle and state) and shape the
//! HUD's own windows. Nothing here touches another process: no memory reads, no injection, no
//! screen capture.

use std::sync::mpsc::Sender;
use std::sync::OnceLock;

use windows::core::{BOOL, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, POINT, RECT};
use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_RBUTTON};
use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, EnumWindows, GetCursorPos, GetMessageW, SetLayeredWindowAttributes, GetWindow, GetWindowLongPtrW, GetWindowRect, GetWindowThreadProcessId,
    GetWindowTextLengthW, GetWindowTextW, IsIconic, IsWindow, IsWindowVisible, SetWindowLongPtrW, SetWindowPos, ShowWindow, TranslateMessage,
    EVENT_OBJECT_DESTROY, EVENT_OBJECT_LOCATIONCHANGE, EVENT_SYSTEM_MINIMIZEEND, EVENT_SYSTEM_MINIMIZESTART, GWL_EXSTYLE,
    GW_HWNDPREV, HWND_TOP, HWND_TOPMOST, MSG, OBJID_WINDOW, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_HIDE, SW_SHOWNOACTIVATE, LWA_ALPHA, WS_EX_LAYERED, WS_EX_TRANSPARENT,
    WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
};

/// A window handle that can cross threads.
pub type Handle = isize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

fn hwnd(handle: Handle) -> HWND {
    HWND(handle as *mut _)
}

pub fn handle_of(window: HWND) -> Handle {
    window.0 as isize
}

pub fn exists(handle: Handle) -> bool {
    // SAFETY: IsWindow accepts any handle value.
    unsafe { IsWindow(Some(hwnd(handle))).as_bool() }
}

pub fn is_minimized(handle: Handle) -> bool {
    // SAFETY: IsIconic accepts any handle value.
    unsafe { IsIconic(hwnd(handle)).as_bool() }
}

pub fn is_visible(handle: Handle) -> bool {
    // SAFETY: IsWindowVisible accepts any handle value.
    unsafe { IsWindowVisible(hwnd(handle)).as_bool() }
}

pub fn title(handle: Handle) -> String {
    // SAFETY: the buffer is sized from GetWindowTextLengthW, plus the terminating zero.
    unsafe {
        let length = GetWindowTextLengthW(hwnd(handle));
        if length <= 0 {
            return String::new();
        }
        let mut buffer = vec![0u16; length as usize + 1];
        let copied = GetWindowTextW(hwnd(handle), &mut buffer);
        String::from_utf16_lossy(&buffer[..copied.max(0) as usize])
    }
}

/// The window rectangle in physical screen pixels.
pub fn rect(handle: Handle) -> Option<Rect> {
    let mut r = RECT::default();
    // SAFETY: `r` is a valid out pointer for the call.
    unsafe { GetWindowRect(hwnd(handle), &mut r).ok()? };
    Some(Rect { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top })
}

/// File name of the program that owns a window (`winamax.exe`), if Windows lets us read it.
pub fn process_name(handle: Handle) -> Option<String> {
    let mut pid = 0u32;
    // SAFETY: `pid` is a valid out pointer; the process handle is closed before returning.
    unsafe {
        GetWindowThreadProcessId(hwnd(handle), Some(&mut pid));
        if pid == 0 {
            return None;
        }
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buffer = [0u16; 520];
        let mut length = buffer.len() as u32;
        let queried = QueryFullProcessImageNameW(process, PROCESS_NAME_FORMAT(0), PWSTR(buffer.as_mut_ptr()), &mut length);
        let _ = CloseHandle(process);
        queried.ok()?;
        let path = String::from_utf16_lossy(&buffer[..length as usize]);
        path.rsplit(['\\', '/']).next().map(str::to_string)
    }
}

/// Whether the right mouse button is held down, wherever the cursor is. Only the button state is
/// read: nothing is sent to any window.
pub fn right_button_down() -> bool {
    // SAFETY: plain read of the keyboard and mouse state.
    unsafe { GetAsyncKeyState(VK_RBUTTON.0 as i32) < 0 }
}

/// The cursor position in physical screen pixels.
pub fn cursor() -> Option<(i32, i32)> {
    let mut p = POINT::default();
    // SAFETY: `p` is a valid out pointer for the call.
    unsafe { GetCursorPos(&mut p).ok()? };
    Some((p.x, p.y))
}

/// Every visible top-level window with a title: `(handle, title)`.
pub fn visible_windows() -> Vec<(Handle, String)> {
    unsafe extern "system" fn collect(window: HWND, param: LPARAM) -> BOOL {
        // SAFETY: `param` is the address of the Vec passed to EnumWindows below, alive for the call.
        let list = unsafe { &mut *(param.0 as *mut Vec<(Handle, String)>) };
        let handle = handle_of(window);
        if is_visible(handle) {
            let name = title(handle);
            if !name.is_empty() {
                list.push((handle, name));
            }
        }
        BOOL(1)
    }
    let mut list: Vec<(Handle, String)> = Vec::new();
    // SAFETY: the callback only runs during this call, with the pointer to `list`.
    unsafe {
        let _ = EnumWindows(Some(collect), LPARAM(&mut list as *mut _ as isize));
    }
    list
}

/// Whether `hud` is the window right above `table` in the z-order.
pub fn is_directly_above(hud: Handle, table: Handle) -> bool {
    // SAFETY: plain query on window handles.
    unsafe { GetWindow(hwnd(table), GW_HWNDPREV).ok().is_some_and(|previous| handle_of(previous) == hud) }
}

/// Puts `hud` directly above `table` in the z-order, without moving, resizing or activating it.
/// Another window that covers the table then covers the HUD too, which an always-on-top window
/// cannot do. The window must not be owned by the table: an owner in another process shares its
/// input queue with the owned window, and either side can then freeze the other.
pub fn place_above(hud: Handle, table: Handle) {
    // SAFETY: plain z-order change of one of our own windows, relative to another window's handle.
    unsafe {
        let above_table = GetWindow(hwnd(table), GW_HWNDPREV).ok();
        let table_is_topmost = GetWindowLongPtrW(hwnd(table), GWL_EXSTYLE) & WS_EX_TOPMOST.0 as isize != 0;
        let insert_after = match above_table {
            Some(previous) => previous,
            None if table_is_topmost => HWND_TOPMOST,
            None => HWND_TOP,
        };
        let _ = SetWindowPos(hwnd(hud), Some(insert_after), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }
}

/// Shows a window without activating it, so the table keeps the focus.
pub fn show_without_focus(handle: Handle) {
    // SAFETY: plain show command on a window handle.
    unsafe {
        let _ = ShowWindow(hwnd(handle), SW_SHOWNOACTIVATE);
    }
}

pub fn hide(handle: Handle) {
    // SAFETY: plain hide command on a window handle.
    unsafe {
        let _ = ShowWindow(hwnd(handle), SW_HIDE);
    }
}

/// Sets the extended style of a HUD window: it never takes the focus, has no taskbar button, and
/// lets clicks through (or not).
///
/// This is the only place that changes the style, and the only caller is the thread that owns the
/// overlay state. The window library rewrites the style from its own flags whenever it applies one
/// of them, so the style is set again after it shows the window; and its own `ignore cursor events`
/// call must not be used alongside, since it changes the style on another thread.
pub fn configure(handle: Handle, click_through: bool) {
    // SAFETY: reads then writes the extended style of one of our own windows.
    unsafe {
        let mut style = GetWindowLongPtrW(hwnd(handle), GWL_EXSTYLE);
        style |= WS_EX_NOACTIVATE.0 as isize | WS_EX_TOOLWINDOW.0 as isize;
        let click_through_bits = (WS_EX_LAYERED.0 | WS_EX_TRANSPARENT.0) as isize;
        if click_through {
            style |= click_through_bits;
        } else {
            style &= !click_through_bits;
        }
        SetWindowLongPtrW(hwnd(handle), GWL_EXSTYLE, style);
        if click_through {
            // A layered window draws nothing until it has its attributes: fully opaque here.
            let _ = SetLayeredWindowAttributes(hwnd(handle), Default::default(), 255, LWA_ALPHA);
        }
    }
}

/// What happened to a watched window.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowEvent {
    Moved,
    Destroyed,
    Minimized,
    Restored,
}

static EVENTS: OnceLock<Sender<(Handle, WindowEvent)>> = OnceLock::new();

unsafe extern "system" fn on_event(_hook: HWINEVENTHOOK, event: u32, window: HWND, object: i32, _child: i32, _thread: u32, _time: u32) {
    // Only events about the window itself: its children and cursors report through the same hook.
    if object != OBJID_WINDOW.0 {
        return;
    }
    let kind = match event {
        EVENT_OBJECT_LOCATIONCHANGE => WindowEvent::Moved,
        EVENT_OBJECT_DESTROY => WindowEvent::Destroyed,
        EVENT_SYSTEM_MINIMIZESTART => WindowEvent::Minimized,
        EVENT_SYSTEM_MINIMIZEEND => WindowEvent::Restored,
        _ => return,
    };
    if let Some(sender) = EVENTS.get() {
        let _ = sender.send((handle_of(window), kind));
    }
}

/// Starts a thread reporting moves, minimizing, restoring and closing of windows of other
/// processes. Call once; the events arrive on `sender`.
pub fn watch_windows(sender: Sender<(Handle, WindowEvent)>) {
    if EVENTS.set(sender).is_err() {
        return;
    }
    let spawned = std::thread::Builder::new().name("hud-win-events".into()).spawn(|| {
        // SAFETY: out-of-context hooks need a message loop on the thread that installed them.
        unsafe {
            for (low, high) in [
                (EVENT_OBJECT_LOCATIONCHANGE, EVENT_OBJECT_LOCATIONCHANGE),
                (EVENT_OBJECT_DESTROY, EVENT_OBJECT_DESTROY),
                (EVENT_SYSTEM_MINIMIZESTART, EVENT_SYSTEM_MINIMIZEEND),
            ] {
                SetWinEventHook(low, high, None, Some(on_event), 0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
            }
            let mut message = MSG::default();
            while GetMessageW(&mut message, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }
    });
    if let Err(err) = spawned {
        log::error!("[hud] cannot watch windows: {err}");
    }
}
