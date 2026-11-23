//! A tiny local web server for a streaming overlay (an OBS "browser source").
//!
//! Off unless the user turns it on. It listens on `127.0.0.1` only, answers two GET requests (the
//! page and its figures) and refuses any request whose `Host` is not the loopback address, so a
//! web page elsewhere cannot read it through the user's browser. Nothing leaves the machine.

use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Duration;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::db::Database;
use crate::repos::stats::{self, StatsQuery};
use crate::{Error, Result};

pub const DEFAULT_PORT: u16 = 38417;
const MIN_PORT: u16 = 1024;
const MAX_REQUEST_BYTES: usize = 8 * 1024;
const READ_TIMEOUT: Duration = Duration::from_secs(2);
const ACCEPT_POLL: Duration = Duration::from_millis(100);
const MIN_FONT_PX: u32 = 12;
const MAX_FONT_PX: u32 = 72;

/// The look of the overlay. Colours are `#rrggbb`; the background may also be `transparent`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Theme {
    pub background: String,
    pub text: String,
    pub accent: String,
    pub font_size: u32,
    /// Figures shown, from `tournaments`, `profit`, `cev`, `winRate`, `multipliers`.
    pub show: Vec<String>,
}

impl Default for Theme {
    fn default() -> Self {
        Self {
            background: "transparent".into(),
            text: "#e6e9ef".into(),
            accent: "#34c27a".into(),
            font_size: 28,
            show: ["tournaments", "profit", "cev", "multipliers"].map(String::from).to_vec(),
        }
    }
}

const FIGURES: [&str; 5] = ["tournaments", "profit", "cev", "winRate", "multipliers"];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct OverlaySettings {
    pub enabled: bool,
    pub port: u16,
    pub hero_name: Option<String>,
    pub theme: Theme,
}

impl Default for OverlaySettings {
    fn default() -> Self {
        Self { enabled: false, port: DEFAULT_PORT, hero_name: None, theme: Theme::default() }
    }
}

fn is_hex_colour(text: &str) -> bool {
    text.len() == 7 && text.starts_with('#') && text[1..].chars().all(|c| c.is_ascii_hexdigit())
}

impl OverlaySettings {
    /// The first problem found, as a message for the user.
    pub fn validate(&self) -> std::result::Result<(), String> {
        if self.port < MIN_PORT {
            return Err(format!("the port must be {MIN_PORT} or above"));
        }
        if !(self.theme.background == "transparent" || is_hex_colour(&self.theme.background)) {
            return Err("the background is `transparent` or a colour such as #101418".into());
        }
        if !is_hex_colour(&self.theme.text) || !is_hex_colour(&self.theme.accent) {
            return Err("colours are written #rrggbb".into());
        }
        if !(MIN_FONT_PX..=MAX_FONT_PX).contains(&self.theme.font_size) {
            return Err(format!("the font size is between {MIN_FONT_PX} and {MAX_FONT_PX} pixels"));
        }
        if self.theme.show.iter().any(|f| !FIGURES.contains(&f.as_str())) {
            return Err("unknown figure".into());
        }
        Ok(())
    }
}

/// Figures of the latest session, with the theme the page draws them in.
pub fn stats_json(conn: &Connection, settings: &OverlaySettings) -> Result<Value> {
    let base = StatsQuery { hero_name: settings.hero_name.clone(), ..StatsQuery::default() };
    let sessions = stats::session_history(conn, 1, &base)?;
    let theme = serde_json::to_value(&settings.theme)?;
    let Some(session) = sessions.first() else { return Ok(json!({ "session": Value::Null, "theme": theme })) };
    let range = StatsQuery {
        date_from: session["session_date"].as_str().map(str::to_string),
        date_to: session["session_end"].as_str().map(str::to_string),
        ..base
    };
    let dashboard = stats::dashboard_stats(conn, &range)?;
    let tournaments = dashboard["total_tournaments"].as_i64().unwrap_or(0);
    let won = dashboard["tournaments_won"].as_i64().unwrap_or(0);
    let multipliers: Vec<Value> = stats::multiplier_stats(conn, &range)?
        .into_iter()
        .filter(|m| m.total_count > 0)
        .map(|m| json!({ "multiplier": m.multiplier, "count": m.total_count }))
        .collect();
    Ok(json!({
        "session": {
            "start": session["session_date"], "end": session["session_end"],
            "tournaments": tournaments,
            "profit": dashboard["total_profit"],
            "cev": dashboard["avg_chips_ev"],
            "winRate": if tournaments > 0 { won as f64 * 100.0 / tournaments as f64 } else { 0.0 },
            "multipliers": multipliers,
        },
        "theme": theme,
    }))
}

/// What a request asks for, once its first line and `Host` are read.
#[derive(Debug, PartialEq, Eq)]
pub enum Route {
    Page,
    Stats,
    NotFound,
    MethodNotAllowed,
    Forbidden,
    BadRequest,
}

/// Which answer a raw request gets. `port` is the one the server listens on.
pub fn route_of(request: &str, port: u16) -> Route {
    let mut lines = request.split("\r\n");
    let Some(first) = lines.next() else { return Route::BadRequest };
    let mut parts = first.split_whitespace();
    let (Some(method), Some(target), Some(version)) = (parts.next(), parts.next(), parts.next()) else { return Route::BadRequest };
    if !version.starts_with("HTTP/1.") {
        return Route::BadRequest;
    }
    let host = lines.take_while(|l| !l.is_empty()).find_map(|l| l.split_once(':').filter(|(name, _)| name.eq_ignore_ascii_case("host")).map(|(_, v)| v.trim().to_string()));
    let allowed = [format!("127.0.0.1:{port}"), format!("localhost:{port}")];
    if !host.is_some_and(|h| allowed.contains(&h.to_ascii_lowercase())) {
        return Route::Forbidden;
    }
    if method != "GET" {
        return Route::MethodNotAllowed;
    }
    match target.split('?').next().unwrap_or("") {
        "/" => Route::Page,
        "/stats.json" => Route::Stats,
        _ => Route::NotFound,
    }
}

fn respond(stream: &mut TcpStream, status: &str, content_type: &str, body: &str) {
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'self' 'unsafe-inline'; connect-src 'self'\r\nConnection: close\r\n\r\n",
        body.len()
    );
    // The client may have left: nothing to do about a failed write.
    let _ = stream.write_all(head.as_bytes()).and_then(|()| stream.write_all(body.as_bytes()));
}

fn serve(mut stream: TcpStream, db: &Database, settings: &OverlaySettings, port: u16) {
    let _ = stream.set_read_timeout(Some(READ_TIMEOUT));
    let mut buffer = vec![0u8; MAX_REQUEST_BYTES];
    let read = stream.read(&mut buffer).unwrap_or(0);
    let request = String::from_utf8_lossy(&buffer[..read]).into_owned();
    match route_of(&request, port) {
        Route::Page => respond(&mut stream, "200 OK", "text/html; charset=utf-8", PAGE),
        Route::Stats => match db.conn().map_err(Error::from).and_then(|conn| stats_json(&conn, settings)) {
            Ok(value) => respond(&mut stream, "200 OK", "application/json", &value.to_string()),
            Err(error) => {
                log::warn!("[overlay] could not read the figures: {error}");
                respond(&mut stream, "500 Internal Server Error", "text/plain", "error");
            }
        },
        Route::NotFound => respond(&mut stream, "404 Not Found", "text/plain", "not found"),
        Route::MethodNotAllowed => respond(&mut stream, "405 Method Not Allowed", "text/plain", "method not allowed"),
        Route::Forbidden => respond(&mut stream, "403 Forbidden", "text/plain", "forbidden"),
        Route::BadRequest => respond(&mut stream, "400 Bad Request", "text/plain", "bad request"),
    }
}

/// A running server; dropping it stops it.
pub struct OverlayServer {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    port: u16,
}

impl OverlayServer {
    /// Starts listening on `127.0.0.1:<port>` (port 0 picks a free one, for tests).
    pub fn start(db: Arc<Database>, settings: OverlaySettings, port: u16) -> Result<Self> {
        let listener = TcpListener::bind(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port)).map_err(|e| Error::Message(format!("cannot listen on port {port}: {e}")))?;
        listener.set_nonblocking(true).map_err(|e| Error::Message(e.to_string()))?;
        let port = listener.local_addr().map_err(|e| Error::Message(e.to_string()))?.port();
        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        let thread = std::thread::spawn(move || {
            while !flag.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        // A connection is served on its own thread: a slow client must not hold up the others.
                        let (db, settings) = (db.clone(), settings.clone());
                        std::thread::spawn(move || serve(stream, &db, &settings, port));
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(ACCEPT_POLL),
                    Err(e) => {
                        log::warn!("[overlay] accept failed: {e}");
                        std::thread::sleep(ACCEPT_POLL);
                    }
                }
            }
        });
        Ok(Self { stop, thread: Some(thread), port })
    }

    pub fn port(&self) -> u16 {
        self.port
    }
}

impl Drop for OverlayServer {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

/// The page the browser source loads: it reads `/stats.json` every few seconds and writes the
/// figures with `textContent`, never as markup.
const PAGE: &str = r##"<!doctype html>
<html><head><meta charset="utf-8"><title>SpinTracker overlay</title>
<style>
  html, body { margin: 0; background: transparent; font-family: Inter, system-ui, sans-serif; }
  #root { display: inline-flex; flex-direction: column; gap: 6px; padding: 12px 16px; border-radius: 12px; }
  .row { display: flex; justify-content: space-between; gap: 24px; }
  .label { opacity: .7; }
  .value { font-family: "IBM Plex Mono", ui-monospace, monospace; font-weight: 600; }
  .pos { color: var(--accent); }
  .neg { color: #ff7a6b; }
</style></head>
<body><div id="root"></div>
<script>
const root = document.getElementById('root');
function row(label, value, cls) {
  const line = document.createElement('div'); line.className = 'row';
  const l = document.createElement('span'); l.className = 'label'; l.textContent = label;
  const v = document.createElement('span'); v.className = 'value' + (cls ? ' ' + cls : ''); v.textContent = value;
  line.append(l, v); return line;
}
const sign = (n) => (n > 0 ? '+' : '') + n;
async function refresh() {
  try {
    const data = await (await fetch('/stats.json', { cache: 'no-store' })).json();
    const theme = data.theme, s = data.session;
    document.body.style.background = theme.background;
    root.style.color = theme.text; root.style.fontSize = theme.fontSize + 'px';
    root.style.setProperty('--accent', theme.accent);
    root.style.background = theme.background === 'transparent' ? 'transparent' : theme.background;
    root.replaceChildren();
    if (!s) return;
    const shown = new Set(theme.show);
    if (shown.has('tournaments')) root.append(row('Spins', String(s.tournaments)));
    if (shown.has('profit')) root.append(row('Profit', sign(Math.round(s.profit * 100) / 100) + ' €', s.profit >= 0 ? 'pos' : 'neg'));
    if (shown.has('cev')) root.append(row('CEV', sign(Math.round(s.cev * 10) / 10), s.cev >= 0 ? 'pos' : 'neg'));
    if (shown.has('winRate')) root.append(row('Win', (Math.round(s.winRate * 10) / 10) + ' %'));
    if (shown.has('multipliers') && s.multipliers.length) {
      root.append(row('x', s.multipliers.map((m) => 'x' + m.multiplier + ' ' + m.count).join('  ')));
    }
  } catch (e) { /* the app is closed: keep the last figures */ }
}
refresh(); setInterval(refresh, 3000);
</script></body></html>"##;

#[cfg(test)]
mod tests {
    use super::*;

    fn request(method: &str, target: &str, host: &str) -> String {
        format!("{method} {target} HTTP/1.1\r\nHost: {host}\r\nAccept: */*\r\n\r\n")
    }

    #[test]
    fn only_the_two_known_pages_are_served_to_the_loopback_host() {
        assert_eq!(route_of(&request("GET", "/", "127.0.0.1:4000"), 4000), Route::Page);
        assert_eq!(route_of(&request("GET", "/stats.json?x=1", "localhost:4000"), 4000), Route::Stats);
        assert_eq!(route_of(&request("GET", "/other", "127.0.0.1:4000"), 4000), Route::NotFound);
        assert_eq!(route_of(&request("POST", "/", "127.0.0.1:4000"), 4000), Route::MethodNotAllowed);
    }

    #[test]
    fn a_foreign_or_missing_host_is_refused() {
        assert_eq!(route_of(&request("GET", "/", "evil.example:4000"), 4000), Route::Forbidden, "DNS rebinding");
        assert_eq!(route_of(&request("GET", "/", "127.0.0.1:4001"), 4000), Route::Forbidden);
        assert_eq!(route_of("GET / HTTP/1.1\r\n\r\n", 4000), Route::Forbidden);
        assert_eq!(route_of("nonsense", 4000), Route::BadRequest);
        assert_eq!(route_of("", 4000), Route::BadRequest);
    }

    #[test]
    fn settings_are_checked() {
        let mut settings = OverlaySettings::default();
        assert!(settings.validate().is_ok());
        assert!(!settings.enabled, "off by default");
        settings.port = 80;
        assert!(settings.validate().is_err());
        settings.port = DEFAULT_PORT;
        settings.theme.accent = "green".into();
        assert!(settings.validate().is_err());
        settings.theme.accent = "#00ff88".into();
        settings.theme.font_size = 500;
        assert!(settings.validate().is_err());
        settings.theme.font_size = 24;
        settings.theme.show = vec!["secrets".into()];
        assert!(settings.validate().is_err());
        settings.theme.show = vec!["profit".into()];
        settings.theme.background = "#101418".into();
        assert!(settings.validate().is_ok());
    }

    #[test]
    fn the_server_answers_and_stops_on_drop() {
        let dir = tempfile::tempdir().unwrap();
        let db = Arc::new(Database::open(dir.path().join("o.db")).unwrap());
        let server = OverlayServer::start(db, OverlaySettings::default(), 0).unwrap();
        let port = server.port();
        let get = |host: &str, method: &str, target: &str| -> String {
            let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
            stream.write_all(request(method, target, host).as_bytes()).unwrap();
            let mut answer = String::new();
            stream.read_to_string(&mut answer).unwrap();
            answer
        };
        let host = format!("127.0.0.1:{port}");
        assert!(get(&host, "GET", "/").starts_with("HTTP/1.1 200"));
        let stats = get(&host, "GET", "/stats.json");
        assert!(stats.starts_with("HTTP/1.1 200") && stats.contains("\"theme\""), "{stats}");
        assert!(get("example.com", "GET", "/").starts_with("HTTP/1.1 403"));
        assert!(get(&host, "POST", "/").starts_with("HTTP/1.1 405"));
        drop(server);
        assert!(TcpStream::connect(("127.0.0.1", port)).is_err(), "the port is released");
    }
}
