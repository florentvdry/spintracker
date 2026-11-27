//! Live overlay for streaming: a page and a JSON endpoint served on 127.0.0.1 only, with no
//! outside access. Off until the player turns it on; read-only.

use std::io::{ErrorKind, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use serde_json::{json, Value};

use crate::db::Database;
use crate::error::Error;
use crate::repos::stats::{self, StatsQuery};
use crate::Result;

pub const DEFAULT_PORT: u16 = 7779;
/// Ports below this are reserved for the system.
pub const MIN_PORT: u16 = 1024;
const POLL_INTERVAL: Duration = Duration::from_millis(50);
const IO_TIMEOUT: Duration = Duration::from_secs(2);
const MAX_REQUEST_BYTES: usize = 4096;
const LOOPBACK: &str = "127.0.0.1";
/// How often the page asks for the session again.
const PAGE_REFRESH_MS: u32 = 5000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Theme {
    Dark,
    Light,
}

impl Theme {
    pub fn parse(raw: &str) -> Option<Theme> {
        match raw {
            "dark" => Some(Theme::Dark),
            "light" => Some(Theme::Light),
            _ => None,
        }
    }

    /// Background, text and accent colours of the page.
    fn colours(self) -> (&'static str, &'static str, &'static str) {
        match self {
            Theme::Dark => ("#0f1114", "#e6e9ef", "#34c27a"),
            Theme::Light => ("#f4f5f7", "#15181d", "#1f8f5a"),
        }
    }
}

/// What the overlay shows: the port, the theme, and the hero whose session it reads.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OverlayConfig {
    pub port: u16,
    pub theme: Theme,
    pub hero: Option<String>,
}

/// The page a browser source loads. It asks the JSON endpoint again every few seconds.
pub fn page(theme: Theme) -> String {
    let (background, text, accent) = theme.colours();
    format!(
        concat!(
            "<!doctype html><html><head><meta charset=\"utf-8\"><title>SpinTracker overlay</title>",
            "<style>body{{margin:0;background:{bg};color:{fg};font-family:Inter,system-ui,sans-serif}}",
            ".card{{padding:12px 16px}}.label{{font-size:12px;opacity:.7;text-transform:uppercase}}",
            ".value{{font-family:'IBM Plex Mono',monospace;font-size:26px;font-weight:600}}",
            ".accent{{color:{accent}}}</style></head><body><div class=\"card\">",
            "<div class=\"label\">Session</div><div class=\"value\" id=\"tournaments\">-</div>",
            "<div class=\"label\">Profit</div><div class=\"value accent\" id=\"profit\">-</div></div>",
            "<script>async function refresh(){{try{{const r=await fetch('/api/session',{{cache:'no-store'}});",
            "const s=(await r.json()).session;",
            "document.getElementById('tournaments').textContent=s?s.tournaments+' tournaments':'-';",
            "document.getElementById('profit').textContent=s?s.profit.toFixed(2)+' EUR':'-';}}catch(e){{}}}}",
            "refresh();setInterval(refresh,{refresh});</script></body></html>"
        ),
        bg = background,
        fg = text,
        accent = accent,
        refresh = PAGE_REFRESH_MS,
    )
}

/// The session the overlay shows: the most recent one of the hero, or null when there is none.
pub fn session_json(db: &Database, hero: Option<&str>) -> Result<Value> {
    let conn = db.conn()?;
    let query = StatsQuery { hero_name: hero.map(str::to_string), ..StatsQuery::default() };
    let session = stats::session_history(&conn, 1, &query)?.into_iter().next();
    Ok(json!({ "session": session }))
}

/// Answers one request line: (status, content type, body). Only GET is served.
pub fn respond(request_line: &str, db: &Database, config: &OverlayConfig) -> (u16, &'static str, String) {
    let mut parts = request_line.split_whitespace();
    let (method, target) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
    if method != "GET" {
        return (405, "text/plain; charset=utf-8", "method not allowed".into());
    }
    let path = target.split('?').next().unwrap_or("/");
    match path {
        "/" => (200, "text/html; charset=utf-8", page(config.theme)),
        "/api/session" => match session_json(db, config.hero.as_deref()) {
            Ok(value) => (200, "application/json", value.to_string()),
            Err(err) => (500, "text/plain; charset=utf-8", err.to_string()),
        },
        _ => (404, "text/plain; charset=utf-8", "not found".into()),
    }
}

fn write_response(stream: &mut TcpStream, status: u16, content_type: &str, body: &str) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        404 => "Not Found",
        405 => "Method Not Allowed",
        _ => "Internal Server Error",
    };
    let head = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(head.as_bytes())?;
    stream.write_all(body.as_bytes())
}

fn handle(mut stream: TcpStream, db: &Database, config: &OverlayConfig) {
    if stream.set_read_timeout(Some(IO_TIMEOUT)).is_err() {
        return;
    }
    let mut buffer = vec![0u8; MAX_REQUEST_BYTES];
    let read = match stream.read(&mut buffer) {
        Ok(read) => read,
        Err(_) => return,
    };
    let text = String::from_utf8_lossy(&buffer[..read]);
    let line = text.lines().next().unwrap_or("");
    let (status, content_type, body) = respond(line, db, config);
    // A client that went away mid-answer is not an error worth reporting.
    let _ = write_response(&mut stream, status, content_type, &body);
}

struct Running {
    stop: Arc<AtomicBool>,
    thread: JoinHandle<()>,
    port: u16,
}

/// Owns the overlay's server thread. Starting again replaces the running one.
#[derive(Default)]
pub struct OverlayServer {
    running: Mutex<Option<Running>>,
}

impl OverlayServer {
    /// Starts serving on 127.0.0.1 at `config.port`; returns the port in use.
    pub fn start(&self, db: Arc<Database>, config: OverlayConfig) -> Result<u16> {
        if config.port < MIN_PORT {
            return Err(Error::Message(format!("the overlay port must be {MIN_PORT} or more")));
        }
        self.stop();
        let listener = TcpListener::bind((LOOPBACK, config.port))?;
        listener.set_nonblocking(true)?;
        let port = listener.local_addr()?.port();
        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        let thread = thread::spawn(move || {
            while !flag.load(Ordering::SeqCst) {
                match listener.accept() {
                    Ok((stream, _)) => handle(stream, &db, &config),
                    Err(err) if err.kind() == ErrorKind::WouldBlock => thread::sleep(POLL_INTERVAL),
                    Err(_) => thread::sleep(POLL_INTERVAL),
                }
            }
        });
        *self.running.lock().expect("the overlay lock is never held across a panic") = Some(Running { stop, thread, port });
        Ok(port)
    }

    /// Stops the server and waits for its thread. Does nothing when it is not running.
    pub fn stop(&self) {
        let running = self.running.lock().expect("the overlay lock is never held across a panic").take();
        if let Some(running) = running {
            running.stop.store(true, Ordering::SeqCst);
            let _ = running.thread.join();
        }
    }

    /// The port the server listens on, when it runs.
    pub fn port(&self) -> Option<u16> {
        self.running.lock().expect("the overlay lock is never held across a panic").as_ref().map(|r| r.port)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> (tempfile::TempDir, Database) {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(dir.path().join("overlay.db")).unwrap();
        (dir, db)
    }

    fn config(theme: Theme) -> OverlayConfig {
        OverlayConfig { port: DEFAULT_PORT, theme, hero: None }
    }

    #[test]
    fn serves_the_page_and_the_session_and_nothing_else() {
        let (_dir, db) = database();
        let (status, kind, body) = respond("GET / HTTP/1.1", &db, &config(Theme::Dark));
        assert_eq!((status, kind), (200, "text/html; charset=utf-8"));
        assert!(body.contains("/api/session"));

        let (status, kind, body) = respond("GET /api/session?x=1 HTTP/1.1", &db, &config(Theme::Dark));
        assert_eq!((status, kind), (200, "application/json"));
        assert_eq!(serde_json::from_str::<Value>(&body).unwrap()["session"], Value::Null);

        assert_eq!(respond("GET /secret HTTP/1.1", &db, &config(Theme::Dark)).0, 404);
    }

    #[test]
    fn only_get_is_allowed() {
        let (_dir, db) = database();
        assert_eq!(respond("POST / HTTP/1.1", &db, &config(Theme::Dark)).0, 405);
    }

    #[test]
    fn the_theme_changes_the_page_colours() {
        assert_ne!(page(Theme::Dark), page(Theme::Light));
        assert_eq!(Theme::parse("light"), Some(Theme::Light));
        assert_eq!(Theme::parse("neon"), None);
    }

    #[test]
    fn a_port_in_the_reserved_range_is_refused_and_stopping_an_idle_server_is_harmless() {
        let (_dir, db) = database();
        let server = OverlayServer::default();
        let refused = server.start(Arc::new(db), OverlayConfig { port: 80, theme: Theme::Dark, hero: None });
        assert!(refused.is_err());
        assert_eq!(server.port(), None);
        server.stop();
        assert_eq!(server.port(), None);
    }
}

impl Drop for OverlayServer {
    /// The server thread holds a database handle: it must not outlive the backend.
    fn drop(&mut self) {
        self.stop();
    }
}
