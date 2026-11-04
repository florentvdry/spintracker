//! The request interface of the backend: the same routes, parameters and JSON shapes as the
//! former HTTP API, served in-process.
//!
//! `Backend::handle` takes what the UI would have sent over HTTP (method, path with query,
//! JSON body) and returns the status and body it would have received. Imports are the one
//! exception: they stream progress, so the shell calls `Backend::importer` directly.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::de::DeserializeOwned;
use serde_json::{json, Value};

use crate::db::{Database, DatabaseInfo, DatabaseRegistry};
use crate::engines::analytics::AnalyticsCalculator;
use crate::engines::equity::calculate as calculate_equity;
use crate::models::ParsedHand;
use crate::parsers::{get_parser, get_parser_by_room};
use crate::repos::detailed_stats::{detailed_stats, DetailedQuery};
use crate::repos::hud_stats;
use crate::repos::hands_query::{self, HandsAgainstQuery, HandsQuery};
use crate::repos::player_queries::{self, PlayersQuery};
use crate::repos::stats::{self, ChartQuery, StatsQuery};
use crate::repos::{hands, heatmap, players, tournaments};
use crate::services::analysis::{self, AnalysisFilters, AnalysisHandsRequest};
use crate::services::hud::{HudNoteRequest, HudPlayersRequest, HudService};
use crate::services::Importer;
use crate::stats::store;
use crate::{Error, Result};

const DEFAULT_SESSION_LIMIT: usize = 50;
const API_VERSION: &str = "2.0.0-rust";

#[derive(Debug, Clone, PartialEq)]
pub struct Response {
    pub status: u16,
    pub body: Value,
}

impl Response {
    fn ok(body: Value) -> Self {
        Self { status: 200, body }
    }

    fn data(data: Value) -> Self {
        Self::ok(json!({ "success": true, "data": data }))
    }

    fn failure(status: u16, error: &str) -> Self {
        Self { status, body: json!({ "success": false, "error": error }) }
    }

    fn message(status: u16, message: &str) -> Self {
        Self { status, body: json!({ "success": false, "message": message }) }
    }

    /// An unexpected error: `success` is false and the problem details follow the former API.
    fn problem(error: &Error) -> Self {
        Self {
            status: 500,
            body: json!({ "success": false, "error": error.to_string(), "status": 500, "title": "An error occurred while processing your request.", "detail": error.to_string() }),
        }
    }
}

pub struct Backend {
    db: Arc<Database>,
    registry: DatabaseRegistry,
    importer: Importer,
    hud: HudService,
    /// Detailed statistics by query, valid for one data version: they read every hand.
    detailed_cache: Mutex<DetailedCache>,
}

#[derive(Default)]
struct DetailedCache {
    version: u64,
    entries: HashMap<String, Value>,
}

/// Queries kept in the detailed statistics cache.
const DETAILED_CACHE_CAPACITY: usize = 16;

impl Backend {
    /// Opens the active database of the registry kept in `app_dir`, creating both on first run.
    /// `provided_db` is an existing database adopted by a registry that does not exist yet.
    pub fn open(app_dir: impl Into<PathBuf>, provided_db: Option<&Path>) -> Result<Self> {
        let registry = DatabaseRegistry::load(app_dir, provided_db)?;
        let active = registry.get_active().ok_or_else(|| Error::Message("no active database in the registry".into()))?;
        let db = Arc::new(Database::open(&active.file_path)?);
        let analytics = Arc::new(AnalyticsCalculator::default());
        let importer = Importer::new(db.clone(), analytics.clone());
        let hud = HudService::new(db.clone());
        Ok(Self { db, registry, importer, hud, detailed_cache: Mutex::default() })
    }

    pub fn importer(&self) -> &Importer {
        &self.importer
    }

    pub fn database(&self) -> &Arc<Database> {
        &self.db
    }

    pub fn registry(&self) -> &DatabaseRegistry {
        &self.registry
    }

    /// Computes the stat flags the active database lacks (existing databases, or after the flags
    /// changed). `progress(done, total)` is called after each batch.
    pub fn backfill_flags(&self, progress: impl FnMut(u64, u64)) -> Result<u64> {
        let done = store::backfill(&mut *self.db.conn()?, progress);
        self.db.bump_data_version();
        done
    }

    /// Handles a request. Errors become 500 responses, never panics.
    pub fn handle(&self, method: &str, target: &str, body: Option<Value>) -> Response {
        let (path, query) = split_target(target);
        let method = method.to_ascii_uppercase();
        let segments: Vec<&str> = path.trim_matches('/').split('/').collect();
        let request = Request { method: &method, query: &query, body };
        match self.route(&request, &segments) {
            Ok(Some(response)) => response,
            Ok(None) => Response::failure(404, "Not found"),
            Err(e) => {
                log::error!("{method} {path}: {e}");
                Response::problem(&e)
            }
        }
    }

    fn route(&self, r: &Request, segments: &[&str]) -> Result<Option<Response>> {
        let conn = || self.db.conn();
        let post = r.method == "POST";

        let response = match (r.method, segments) {
            ("GET", ["health"]) => Response::ok(json!({
                "success": true, "status": "running", "version": API_VERSION,
                "features": { "database": true, "parsers": ["Betclic", "Winamax", "Unibet"], "equity": true, "analysis": true },
            })),

            // --- Parsing and import
            ("POST", ["parse", "file"]) => self.parse_file(r)?,
            ("POST", ["parse", "detect"]) => {
                let content = r.body_str("content");
                match content.as_deref().filter(|c| !c.is_empty()).map(|c| get_parser(c)) {
                    None => Response::failure(400, "No content provided"),
                    Some(parser) => Response::ok(json!({
                        "success": parser.is_some(), "room": parser.map(|p| p.room_name()), "version": parser.map(|p| p.parser_version()),
                    })),
                }
            }
            ("POST", ["import", "count-hands"]) => match r.body_str("filePath").filter(|p| !p.is_empty()) {
                None => Response::ok(json!({ "success": false, "error": "No file path provided" })),
                Some(path) => match self.importer.count_hands(Path::new(&path)) {
                    Ok(count) => Response::ok(json!({ "success": true, "count": count })),
                    Err(e) => Response::ok(json!({ "success": false, "error": e.to_string() })),
                },
            },

            // --- Hands
            ("POST", ["db", "insert-hands"]) => {
                let parsed: Vec<ParsedHand> = r.body_field("hands")?;
                if parsed.is_empty() {
                    Response::ok(json!({ "success": true, "inserted": 0 }))
                } else {
                    let (inserted, total) = self.importer.insert_parsed_hands(parsed)?;
                    Response::ok(json!({ "success": true, "inserted": inserted, "total": total, "analytics_calculated": total }))
                }
            }
            ("GET" | "POST", ["db", "hands"]) => Response::data(hands_query::get_hands(&*conn()?, &r.options(hands_query_from_query)?)?),
            ("GET" | "POST", ["db", "tournaments"]) => {
                let result = tournaments::get_tournaments(&*conn()?, &r.options(tournaments_query_from_query)?)?;
                Response::data(serde_json::to_value(result)?)
            }
            ("GET", ["db", "tournament-hands"]) => Response::data(Value::Array(hands_query::get_tournament_hands(
                &*conn()?,
                &r.query_str("gameId").unwrap_or_default(),
                r.query_str("heroName").as_deref(),
            )?)),
            ("GET", ["db", "hand", id]) => match hands_query::get_hand_by_id(&*conn()?, id, r.query_str("heroName").as_deref())? {
                Some(hand) => Response::data(hand),
                None => Response::failure(404, "Hand not found"),
            },
            ("GET" | "POST", ["db", "hands-against", opponent]) => {
                let q: HandsAgainstQuery = r.body_or_default()?;
                Response::data(hands_query::get_hands_against(&*conn()?, opponent, &q)?)
            }
            ("POST", ["db", "delete-all"]) => {
                hands::delete_all(&mut *conn()?)?;
                self.db.bump_data_version();
                Response::ok(json!({ "success": true, "message": "All data cleared and schema refreshed" }))
            }

            // --- Statistics
            ("GET", ["db", "dashboard-stats"]) => Response::data(stats::dashboard_stats(&*conn()?, &stats_query_from_query(&r.query))?),
            ("GET" | "POST", ["db", "session-history"]) => {
                let (limit, q) = r.session_options();
                Response::data(Value::Array(stats::session_history(&*conn()?, limit, &q)?))
            }
            ("GET", ["db", "buyins"]) => Response::data(json!(stats::unique_buy_ins(&*conn()?)?)),
            ("GET", ["db", "detailed-stats"]) => {
                let scope = r.query_str("statsScope").unwrap_or_default().trim().to_lowercase();
                let opponent = r.query_str("opponentName");
                if scope == "player" && opponent.as_deref().map_or(true, |o| o.trim().is_empty()) {
                    Response::data(Value::Null)
                } else {
                    let q = DetailedQuery {
                        date_from: r.query_str("dateFrom"),
                        date_to: r.query_str("dateTo"),
                        buy_in: r.query_f64("buyIn"),
                        stats_scope: r.query_str("statsScope"),
                        opponent_name: opponent,
                    };
                    Response::data(self.detailed_stats_cached(&q)?)
                }
            }
            ("GET" | "POST", ["db", "winrate-chart"]) => {
                let q: ChartQuery = r.options(chart_query_from_query)?;
                Response::data(Value::Array(stats::winrate_chart(&*conn()?, &q)?))
            }
            ("GET" | "POST", ["db", "multiplier-stats"]) => {
                let q: StatsQuery = r.options(|q| StatsQuery { buy_in: None, ..stats_query_from_query(q) })?;
                Response::data(serde_json::to_value(stats::multiplier_stats(&*conn()?, &q)?)?)
            }
            ("GET" | "POST", ["db", "range-heatmap"]) => {
                let q: heatmap::RangeHeatmapQuery = if post { r.body_or_default()? } else { Default::default() };
                Response::data(heatmap::range_heatmap(&*conn()?, &q)?)
            }

            // --- Players
            ("GET" | "POST", ["db", "players"]) => {
                let q: PlayersQuery = if post && r.body.is_some() {
                    r.body_or_default()?
                } else {
                    PlayersQuery { limit: r.query_i64("limit"), ..Default::default() }
                };
                Response::data(Value::Array(player_queries::players_overview(&*conn()?, &q)?))
            }
            ("POST", ["db", "players", "sync"]) => {
                players::update_player_stats(&*conn()?)?;
                self.db.bump_data_version();
                Response::ok(json!({ "success": true }))
            }
            ("POST", ["db", "players", id, "reg-status"]) => {
                let is_reg = r.body_field::<bool>("isReg").unwrap_or(false);
                match id.parse::<i64>() {
                    Ok(id) if player_queries::set_reg_status(&*conn()?, id, is_reg)? => {
                        // The regular/fish scope of the detailed statistics depends on it.
                        self.db.bump_data_version();
                        Response::ok(json!({ "success": true }))
                    }
                    _ => Response::failure(404, "Player not found"),
                }
            }
            ("GET", ["db", "opponents"]) => match r.query_str("heroName").filter(|h| !h.trim().is_empty()) {
                None => Response::data(json!([])),
                Some(hero) => Response::data(Value::Array(player_queries::opponents_for_hero(&*conn()?, &hero, r.query_i64("limit"))?)),
            },
            ("GET", ["db", "aliases"]) => Response::data(Value::Array(player_queries::aliases(&*conn()?)?)),
            ("POST", ["db", "aliases"]) => {
                let name = r.body_str("name").unwrap_or_default();
                Response::ok(json!({ "success": true, "id": player_queries::create_alias(&*conn()?, &name)? }))
            }
            ("DELETE", ["db", "aliases", id]) => {
                player_queries::delete_alias(&mut *conn()?, id.parse().unwrap_or(-1))?;
                self.db.bump_data_version();
                Response::ok(json!({ "success": true }))
            }
            ("POST", ["db", "players", id, "link"]) => {
                let alias: i64 = r.body_field("aliasId")?;
                player_queries::link_player_to_alias(&*conn()?, id.parse().unwrap_or(-1), alias)?;
                self.db.bump_data_version();
                Response::ok(json!({ "success": true }))
            }
            ("POST", ["db", "players", id, "unlink"]) => {
                player_queries::unlink_player_from_alias(&*conn()?, id.parse().unwrap_or(-1))?;
                self.db.bump_data_version();
                Response::ok(json!({ "success": true }))
            }

            // --- Table HUD
            ("GET", ["hud", "catalog"]) => Response::data(hud_stats::catalog()),
            ("POST", ["hud", "players"]) => {
                let request: HudPlayersRequest = r.body_as()?;
                match request.validate() {
                    Ok(()) => Response::data(self.hud.players(&request)?),
                    Err(message) => Response::message(400, &message),
                }
            }
            ("GET", ["hud", "tables"]) => match (r.query_str("room"), r.query_str("since")) {
                (Some(room), Some(since)) => Response::data(self.hud.active_tables(&room, &since)?),
                _ => Response::message(400, "room and since are required"),
            },
            ("PUT", ["hud", "notes"]) => {
                let request: HudNoteRequest = r.body_as()?;
                match request.validate() {
                    Ok(()) => {
                        self.hud.set_note(&request)?;
                        Response::ok(json!({ "success": true }))
                    }
                    Err(message) => Response::message(400, &message),
                }
            }

            // --- Analysis and equity
            ("POST", ["analysis", "stats"]) => Response::data(analysis::analysis_stats(&*conn()?, &r.body_as_camel::<AnalysisFilters>()?)?),
            ("POST", ["analysis", "hands"]) => Response::data(analysis::analysis_hands(&*conn()?, &r.body_as_camel::<AnalysisHandsRequest>()?)?),
            ("POST", ["analysis", "range-breakdown"]) => Response::data(analysis::range_breakdown(&*conn()?, &r.body_as_camel::<AnalysisFilters>()?)?),
            ("GET", ["analysis", "replayer", id]) => match analysis::hand_replay(&*conn()?, id, r.query_str("heroName").as_deref())? {
                Some(replay) => Response::data(replay),
                None => Response::failure(404, "Hand not found"),
            },
            ("POST", ["equity"]) => self.equity(r),
            ("POST", ["equity", "batch"]) => self.equity_batch(r),

            // --- Databases
            (_, ["api", "databases", rest @ ..]) => return self.databases(r, rest),

            _ => return Ok(None),
        };
        Ok(Some(response))
    }

    fn detailed_stats_cached(&self, q: &DetailedQuery) -> Result<Value> {
        let version = self.db.data_version();
        let key = format!("{q:?}");
        {
            let mut cache = self.detailed_cache.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            if cache.version != version {
                cache.entries.clear();
                cache.version = version;
            }
            if let Some(value) = cache.entries.get(&key) {
                return Ok(value.clone());
            }
        }
        let value = detailed_stats(&*self.db.conn()?, q)?;
        let mut cache = self.detailed_cache.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        // Data written while the statistics were computed makes them stale: do not keep them.
        if cache.version == version {
            if cache.entries.len() >= DETAILED_CACHE_CAPACITY {
                cache.entries.clear();
            }
            cache.entries.insert(key, value.clone());
        }
        Ok(value)
    }

    fn parse_file(&self, r: &Request) -> Result<Response> {
        let Some(content) = r.body_str("content").filter(|c| !c.is_empty()) else {
            return Ok(Response::failure(400, "No content provided"));
        };
        let parser = match r.body_str("room").filter(|room| !room.is_empty()) {
            Some(room) => get_parser_by_room(&room),
            None => get_parser(&content),
        };
        let Some(parser) = parser else { return Ok(Response::failure(400, "Could not detect hand history format")) };
        let result = parser.parse_file(&content);
        Ok(Response::ok(json!({
            "success": result.success, "room": parser.room_name(), "hands": result.hands, "count": result.count, "error": result.error,
        })))
    }

    fn equity(&self, r: &Request) -> Response {
        let (hero, villain) = (r.body_str("heroCards").unwrap_or_default(), r.body_str("villainCards").unwrap_or_default());
        if hero.is_empty() || villain.is_empty() {
            return Response::failure(400, "heroCards and villainCards are required");
        }
        match calculate_equity(&hero, &villain, &r.body_str("board").unwrap_or_default(), None) {
            Ok(e) => Response::data(json!({ "heroEquity": e.hero_equity, "villainEquity": e.villain_equity, "tieEquity": e.tie_equity })),
            Err(e) => Response::problem(&e),
        }
    }

    fn equity_batch(&self, r: &Request) -> Response {
        let Some(hands) = r.body.as_ref().and_then(|b| b.get("hands")).and_then(Value::as_array) else {
            return Response::failure(400, "Invalid request");
        };
        let text = |hand: &Value, key: &str| hand.get(key).and_then(Value::as_str).unwrap_or("").to_string();
        let results: Vec<Value> = hands
            .iter()
            .map(|hand| {
                let id = hand.get("id").cloned().unwrap_or(Value::Null);
                match calculate_equity(&text(hand, "heroCards"), &text(hand, "villainCards"), &text(hand, "board"), None) {
                    Ok(e) => json!({ "id": id, "heroEquity": e.hero_equity, "villainEquity": e.villain_equity, "tieEquity": e.tie_equity, "error": null }),
                    Err(e) => json!({ "id": id, "heroEquity": null, "villainEquity": null, "tieEquity": null, "error": e.to_string() }),
                }
            })
            .collect();
        let processed = results.len();
        Response::ok(json!({ "success": true, "data": results, "processed": processed }))
    }

    fn databases(&self, r: &Request, rest: &[&str]) -> Result<Option<Response>> {
        let response = match (r.method, rest) {
            ("GET", []) => Response::data(Value::Array(self.registry.get_all().iter().map(database_json).collect())),
            ("GET", ["active"]) => Response::data(self.registry.get_active().map_or(Value::Null, |d| database_json(&d))),
            ("POST", []) => {
                let name = r.body_str("name").unwrap_or_else(|| "Nouvelle base de données".into());
                Response::data(database_json(&self.registry.create(&name)?))
            }
            ("POST", [id, "set-active"]) => {
                let target = self.registry.get_by_id(id);
                match target {
                    Some(info) if self.registry.set_active(id) => {
                        // The pool is swapped in place: no restart, the next request uses the new file.
                        self.db.switch_to(&info.file_path)?;
                        Response::ok(json!({ "success": true }))
                    }
                    _ => Response::message(400, "Database not found or cannot be set as active"),
                }
            }
            ("DELETE", [id]) => {
                if self.registry.delete(id) {
                    Response::ok(json!({ "success": true }))
                } else {
                    Response::message(400, "Cannot delete database (may be the last one or is currently active)")
                }
            }
            ("PUT", [id]) => match r.body_str("name").filter(|n| !n.trim().is_empty()) {
                None => Response::message(400, "Name is required"),
                Some(name) if self.registry.rename(id, &name) => Response::ok(json!({ "success": true })),
                Some(_) => Response::message(400, "Database not found"),
            },
            _ => return Ok(None),
        };
        Ok(Some(response))
    }
}

fn database_json(d: &DatabaseInfo) -> Value {
    json!({
        "id": d.id, "name": d.name, "fileName": d.file_name, "filePath": d.file_path,
        "createdAt": d.created_at.to_rfc3339(), "lastUsedAt": d.last_used_at.to_rfc3339(),
        "isActive": d.is_active, "handsCount": d.hands_count,
    })
}

// ---------------------------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------------------------

struct Request<'a> {
    method: &'a str,
    query: &'a HashMap<String, String>,
    body: Option<Value>,
}

impl Request<'_> {
    fn query_str(&self, key: &str) -> Option<String> {
        self.query.get(key).filter(|v| !v.is_empty()).cloned()
    }

    fn query_f64(&self, key: &str) -> Option<f64> {
        self.query.get(key).and_then(|v| v.parse().ok())
    }

    fn query_i64(&self, key: &str) -> Option<i64> {
        self.query.get(key).and_then(|v| v.parse().ok())
    }

    fn body_str(&self, key: &str) -> Option<String> {
        self.body.as_ref()?.get(key)?.as_str().map(str::to_string)
    }

    fn body_field<T: DeserializeOwned>(&self, key: &str) -> Result<T> {
        let value = self.body.as_ref().and_then(|b| b.get(key)).cloned().unwrap_or(Value::Null);
        Ok(serde_json::from_value(value)?)
    }

    fn body_as<T: DeserializeOwned>(&self) -> Result<T> {
        Ok(serde_json::from_value(self.body.clone().unwrap_or_else(|| json!({})))?)
    }

    /// Like [`Request::body_as`], accepting PascalCase keys too: the analysis screens saved their
    /// filters that way (the former backend read JSON keys case-insensitively).
    fn body_as_camel<T: DeserializeOwned>(&self) -> Result<T> {
        let body = self.body.clone().unwrap_or_else(|| json!({}));
        Ok(serde_json::from_value(camelize_keys(body))?)
    }

    /// The body as `T`, or `T::default()` without one.
    fn body_or_default<T: DeserializeOwned + Default>(&self) -> Result<T> {
        match &self.body {
            Some(b) if !b.is_null() => Ok(serde_json::from_value(b.clone())?),
            _ => Ok(T::default()),
        }
    }

    /// Options from the body of a POST, or from the query string otherwise.
    fn options<T: DeserializeOwned>(&self, from_query: impl Fn(&HashMap<String, String>) -> T) -> Result<T> {
        match (&self.body, self.method) {
            (Some(b), "POST") if !b.is_null() => Ok(serde_json::from_value(b.clone())?),
            _ => Ok(from_query(self.query)),
        }
    }

    fn session_options(&self) -> (usize, StatsQuery) {
        if let (Some(b), "POST") = (&self.body, self.method) {
            if !b.is_null() {
                let limit = b.get("limit").and_then(Value::as_u64).map_or(DEFAULT_SESSION_LIMIT, |l| l as usize);
                return (limit, serde_json::from_value(b.clone()).unwrap_or_default());
            }
        }
        let limit = self.query_i64("limit").map_or(DEFAULT_SESSION_LIMIT, |l| l.max(0) as usize);
        (limit, stats_query_from_query(self.query))
    }
}

/// Lower-cases the first letter of every top-level key ("HeroName" -> "heroName"). A key that is
/// already camelCase wins over its PascalCase twin.
fn camelize_keys(value: Value) -> Value {
    let Value::Object(map) = value else { return value };
    let (camel, pascal): (Vec<_>, Vec<_>) = map.into_iter().partition(|(k, _)| !k.chars().next().is_some_and(char::is_uppercase));
    let mut out: serde_json::Map<String, Value> = camel.into_iter().collect();
    for (key, v) in pascal {
        let mut chars = key.chars();
        let first = chars.next().map(|c| c.to_lowercase().collect::<String>()).unwrap_or_default();
        out.entry(first + chars.as_str()).or_insert(v);
    }
    Value::Object(out)
}

fn q(query: &HashMap<String, String>, key: &str) -> Option<String> {
    query.get(key).filter(|v| !v.is_empty()).cloned()
}

fn stats_query_from_query(query: &HashMap<String, String>) -> StatsQuery {
    StatsQuery {
        hero_name: q(query, "heroName"),
        date_from: q(query, "dateFrom"),
        date_to: q(query, "dateTo"),
        buy_in: query.get("buyIn").and_then(|v| v.parse().ok()),
    }
}

fn chart_query_from_query(query: &HashMap<String, String>) -> ChartQuery {
    ChartQuery {
        hero_name: q(query, "heroName"),
        date_from: q(query, "dateFrom"),
        date_to: q(query, "dateTo"),
        buy_in: query.get("buyIn").and_then(|v| v.parse().ok()),
        position: q(query, "position"),
    }
}

fn hands_query_from_query(query: &HashMap<String, String>) -> HandsQuery {
    HandsQuery {
        page: query.get("page").and_then(|v| v.parse().ok()).unwrap_or(1),
        limit: query.get("limit").and_then(|v| v.parse().ok()).unwrap_or(hands_query::DEFAULT_PAGE_SIZE),
        date_from: q(query, "dateFrom"),
        date_to: q(query, "dateTo"),
        hero_name: q(query, "heroName"),
        position: q(query, "position"),
        result: q(query, "result"),
        game_type: q(query, "gameType"),
        sort_by: q(query, "sortBy"),
        ..Default::default()
    }
}

/// The tournaments list ignores the result, position and pot filters when they come in the query.
fn tournaments_query_from_query(query: &HashMap<String, String>) -> HandsQuery {
    HandsQuery {
        page: query.get("page").and_then(|v| v.parse().ok()).unwrap_or(1),
        limit: query.get("limit").and_then(|v| v.parse().ok()).unwrap_or(hands_query::DEFAULT_PAGE_SIZE),
        date_from: q(query, "dateFrom"),
        date_to: q(query, "dateTo"),
        hero_name: q(query, "heroName"),
        sort_by: q(query, "sortBy"),
        ..Default::default()
    }
}

/// Splits "/path?a=1&b=x%20y" into the path and the decoded query parameters.
fn split_target(target: &str) -> (&str, HashMap<String, String>) {
    let (path, raw) = target.split_once('?').unwrap_or((target, ""));
    let query = raw
        .split('&')
        .filter(|p| !p.is_empty())
        .map(|pair| {
            let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
            (percent_decode(k), percent_decode(v))
        })
        .collect();
    (path, query)
}

fn percent_decode(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < bytes.len() => {
                match u8::from_str_radix(&raw[i + 1..i + 3], 16) {
                    Ok(b) => {
                        out.push(b);
                        i += 2;
                    }
                    Err(_) => out.push(b'%'),
                }
            }
            b => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn targets_are_split_and_decoded() {
        let (path, query) = split_target("/db/hands?limit=3&heroName=jmen%20fouu&dateFrom=2026-01-02+10%3A00&flag");
        assert_eq!(path, "/db/hands");
        assert_eq!(query["limit"], "3");
        assert_eq!(query["heroName"], "jmen fouu");
        assert_eq!(query["dateFrom"], "2026-01-02 10:00");
        assert_eq!(query["flag"], "");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%e2%82%ac"), "€");
    }

    #[test]
    fn pascal_case_filters_are_read_like_camel_case_ones() {
        let body = json!({ "HeroName": "Hero", "PlayerCount": 3, "MinStackBB": 5.0, "heroName": "Kept", "Positions": ["SB"] });
        let filters: AnalysisFilters = serde_json::from_value(camelize_keys(body)).unwrap();
        assert_eq!(filters.hero_name.as_deref(), Some("Kept"), "camelCase wins over its PascalCase twin");
        assert_eq!(filters.player_count, Some(3));
        assert_eq!(filters.min_stack_bb, Some(5.0));
        assert_eq!(filters.positions, Some(vec!["SB".to_string()]));
    }

    fn backend() -> (tempfile::TempDir, Backend) {
        let dir = tempfile::tempdir().unwrap();
        let backend = Backend::open(dir.path(), None).unwrap();
        (dir, backend)
    }

    #[test]
    fn unknown_routes_and_methods_are_404() {
        let (_dir, b) = backend();
        assert_eq!(b.handle("GET", "/nope", None).status, 404);
        assert_eq!(b.handle("DELETE", "/db/hands", None).status, 404);
        assert_eq!(b.handle("GET", "/health", None).body["success"], true);
    }

    #[test]
    fn missing_hands_and_empty_databases_answer_like_the_former_api() {
        let (_dir, b) = backend();
        let missing = b.handle("GET", "/db/hand/none", None);
        assert_eq!((missing.status, missing.body["error"].as_str()), (404, Some("Hand not found")));
        let hands = b.handle("GET", "/db/hands?limit=5", None);
        assert_eq!((hands.body["data"]["total"].clone(), hands.body["data"]["pages"].clone()), (json!(0), json!(0)));
        assert_eq!(b.handle("GET", "/db/opponents", None).body["data"], json!([]));
        assert_eq!(b.handle("GET", "/db/detailed-stats?statsScope=player", None).body["data"], Value::Null);
        assert_eq!(b.handle("POST", "/db/players/9/reg-status", Some(json!({"isReg": true}))).status, 404);
    }

    #[test]
    fn validation_errors_are_400() {
        let (_dir, b) = backend();
        assert_eq!(b.handle("POST", "/equity", Some(json!({"heroCards": "Ah Kh"}))).status, 400);
        assert_eq!(b.handle("POST", "/parse/file", Some(json!({}))).status, 400);
        assert_eq!(b.handle("POST", "/parse/file", Some(json!({"content": "nothing"}))).status, 400);
        assert_eq!(b.handle("PUT", "/api/databases/x", Some(json!({"name": " "}))).status, 400);
    }

    #[test]
    fn equity_and_batch_round_trip() {
        let (_dir, b) = backend();
        let one = b.handle("POST", "/equity", Some(json!({"heroCards": "Ah Kh", "villainCards": "Qs Qd", "board": "2h 7h 9c Js"})));
        assert!((one.body["data"]["heroEquity"].as_f64().unwrap() - 34.0909).abs() < 1e-3);
        let batch = b.handle("POST", "/equity/batch", Some(json!({"hands": [{"id": "a", "heroCards": "Zz Ad", "villainCards": "Kc Kd"}]})));
        assert_eq!(batch.body["processed"], 1);
        assert!(batch.body["data"][0]["error"].is_string());
    }

    #[test]
    fn databases_can_be_created_renamed_switched_and_deleted() {
        let (_dir, b) = backend();
        let created = b.handle("POST", "/api/databases", Some(json!({"name": "Second"})));
        let id = created.body["data"]["id"].as_str().unwrap().to_string();
        assert_eq!(created.body["data"]["isActive"], false);

        assert_eq!(b.handle("PUT", &format!("/api/databases/{id}"), Some(json!({"name": "Renamed"}))).status, 200);
        let before = b.database().path().unwrap();
        assert_eq!(b.handle("POST", &format!("/api/databases/{id}/set-active"), Some(json!({}))).status, 200);
        assert_ne!(b.database().path().unwrap(), before, "the active database was swapped without restarting");
        assert_eq!(b.handle("GET", "/api/databases/active", None).body["data"]["name"], "Renamed");

        // The previous database is no longer active and can go; the active one cannot.
        let old = b.registry().get_all().into_iter().find(|d| d.id != id).unwrap();
        assert_eq!(b.handle("DELETE", &format!("/api/databases/{}", old.id), None).status, 200);
        assert_eq!(b.handle("DELETE", &format!("/api/databases/{id}"), None).status, 400);
        assert_eq!(b.handle("POST", "/api/databases/unknown/set-active", Some(json!({}))).status, 400);
    }
}
