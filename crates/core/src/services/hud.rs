//! Data for the table HUD: the figures of a few players and the notes the user attached to them.
//!
//! Answers must stay fast between two hands, so the rows of a player are kept in memory until
//! the data changes (see [`Database::data_version`]).

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use rusqlite::Connection;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::db::Database;
use crate::repos::detailed_stats::Row;
use crate::repos::hud_hands;
use crate::repos::hud_stats::{self, HandsOf, HudStatRequest, SpinFormat};
use crate::repos::hud_tables;
use crate::stats::custom::store as custom_store;
use crate::repos::player_notes::{self, PlayerNote, MAX_NOTE_CHARS};
use crate::Result;

/// A table shows at most this many opponents, hero included.
const MAX_PLAYERS: usize = 12;
/// Enough for a full heads-up layout asked in one go: two stack-depth matrices of about fifteen
/// columns over seven depths, with popups, come to a few hundred figures. The cost per figure is
/// small (see the timing test in `tests/hud.rs`).
pub const MAX_STATS: usize = 2048;
/// Players kept in memory; the cache is emptied when it grows past this.
const CACHE_CAPACITY: usize = 500;
/// Hands listed behind a figure by default, and at most: a list is read at a glance.
const DEFAULT_FIGURE_HANDS: usize = 30;
const MAX_FIGURE_HANDS: usize = 50;
/// Hands a report sends to the hand history: the history reads them as bound parameters.
pub const MAX_FIGURE_HAND_IDS: usize = crate::repos::hands_query::MAX_HAND_IDS;
/// Stack depths a group can hold: there are not more depths than this.
const MAX_GROUP_BUCKETS: usize = 16;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HudPlayersRequest {
    pub room: String,
    pub hero_name: String,
    pub players: Vec<String>,
    pub stats: Vec<HudStatRequest>,
    /// `nitro` or `classic`: only the hands of that format are counted. Absent counts them all.
    #[serde(default)]
    pub spin_format: Option<String>,
    /// A stored date (`YYYY-MM-DD HH:MM:SS`): only the hands played before it count, so the
    /// replayer can show the figures as they were at the time of a hand.
    #[serde(default)]
    pub before: Option<String>,
}

/// The format asked for; an unknown name is a mistake of the caller.
fn parse_format(format: Option<&str>) -> std::result::Result<Option<SpinFormat>, String> {
    match format {
        None | Some("") => Ok(None),
        Some(text) => SpinFormat::parse(text).map(Some).ok_or_else(|| "spinFormat must be nitro or classic".to_string()),
    }
}

impl HudPlayersRequest {
    /// The first problem found, as a message for the caller.
    pub fn validate(&self) -> std::result::Result<(), String> {
        if self.room.trim().is_empty() {
            return Err("room is required".into());
        }
        if self.hero_name.trim().is_empty() {
            return Err("heroName is required".into());
        }
        if self.players.len() > MAX_PLAYERS {
            return Err(format!("at most {MAX_PLAYERS} players per request"));
        }
        if self.stats.len() > MAX_STATS {
            return Err(format!("at most {MAX_STATS} stats per request"));
        }
        parse_format(self.spin_format.as_deref())?;
        Ok(())
    }
}

/// The hands behind one figure of one player: the same stat, column and stack depths as the figure.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HudFigureHandsRequest {
    pub room: String,
    pub hero_name: String,
    pub player: String,
    pub stat: HudStatRequest,
    /// The depths of a stack group, added up like the figure does; none means the stat's own bucket.
    #[serde(default)]
    pub buckets: Vec<String>,
    pub which: HandsOf,
    #[serde(default = "default_figure_hands")]
    pub limit: usize,
    #[serde(default)]
    pub spin_format: Option<String>,
}

fn default_figure_hands() -> usize {
    DEFAULT_FIGURE_HANDS
}

impl HudFigureHandsRequest {
    pub fn validate(&self) -> std::result::Result<(), String> {
        if self.room.trim().is_empty() || self.hero_name.trim().is_empty() || self.player.trim().is_empty() {
            return Err("room, heroName and player are required".into());
        }
        if self.limit == 0 || self.limit > MAX_FIGURE_HANDS {
            return Err(format!("limit must be between 1 and {MAX_FIGURE_HANDS}"));
        }
        if self.buckets.len() > MAX_GROUP_BUCKETS {
            return Err(format!("at most {MAX_GROUP_BUCKETS} buckets"));
        }
        parse_format(self.spin_format.as_deref())?;
        Ok(())
    }
}

/// The hands behind one figure of a player (the hero when `player` is empty), in every room: what a
/// report needs to show them in the hand history.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FigureHandIdsRequest {
    pub hero_name: String,
    #[serde(default)]
    pub player: String,
    pub stat: HudStatRequest,
    #[serde(default)]
    pub buckets: Vec<String>,
    pub which: HandsOf,
    #[serde(default)]
    pub spin_format: Option<String>,
}

impl FigureHandIdsRequest {
    pub fn validate(&self) -> std::result::Result<(), String> {
        if self.hero_name.trim().is_empty() {
            return Err("heroName is required".into());
        }
        if self.buckets.len() > MAX_GROUP_BUCKETS {
            return Err(format!("at most {MAX_GROUP_BUCKETS} buckets"));
        }
        parse_format(self.spin_format.as_deref())?;
        Ok(())
    }
}

/// Which tournaments are being played: those of `room` with a hand written since `since`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HudTablesRequest {
    pub room: String,
    pub since: String,
    /// The names the user plays under (hero and aliases), to tell the hero from the opponents.
    #[serde(default)]
    pub hero_names: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HudNoteRequest {
    pub room: String,
    pub player_name: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub tag: String,
}

impl HudNoteRequest {
    pub fn validate(&self) -> std::result::Result<(), String> {
        if self.room.trim().is_empty() || self.player_name.trim().is_empty() {
            return Err("room and playerName are required".into());
        }
        if self.note.chars().count() > MAX_NOTE_CHARS {
            return Err(format!("a note holds at most {MAX_NOTE_CHARS} characters"));
        }
        if !player_notes::is_valid_tag(&self.tag) {
            return Err("unknown tag".into());
        }
        Ok(())
    }
}

#[derive(PartialEq, Eq, Hash)]
struct CacheKey {
    room: String,
    hero: String,
    player: String,
    /// Rows read with the custom-stat hits are not the rows read without them.
    with_custom: bool,
    format: Option<SpinFormat>,
}

/// Rows of one player, with the version of that player's data they were read at.
struct CachedRows {
    player_version: u64,
    rows: Arc<Vec<Row>>,
}

#[derive(Default)]
struct Cache {
    /// The cache is emptied when this changes (a write that can touch anyone's figures).
    epoch: u64,
    rows: HashMap<CacheKey, CachedRows>,
}

/// How long the rows of a pool are kept: the average of a whole base moves slowly, and reading
/// it takes a pass over every hand.
const POOL_TTL: Duration = Duration::from_secs(300);

type PoolKey = (String, String, Option<SpinFormat>);

pub struct HudService {
    db: Arc<Database>,
    cache: Mutex<Cache>,
    pools: Mutex<HashMap<PoolKey, (Instant, Arc<Vec<Row>>)>>,
}

impl HudService {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db, cache: Mutex::new(Cache::default()), pools: Mutex::new(HashMap::new()) }
    }

    /// `conn` is the caller's connection: asking the pool for a second one while holding the first
    /// could wait for ever when every connection is held by a caller doing the same.
    fn rows_of(&self, conn: &Connection, room: &str, hero: &str, player: &str, with_custom: bool, format: Option<SpinFormat>) -> Result<Arc<Vec<Row>>> {
        // Versions are read before the rows: a write landing in between makes the entry look stale
        // at the next read instead of hiding it.
        let epoch = self.db.epoch();
        let player_version = self.db.player_version(player).max(self.db.player_version(hero));
        let key = CacheKey { room: room.into(), hero: hero.into(), player: player.into(), with_custom, format };
        {
            let mut cache = self.cache.lock().expect("the HUD cache lock is never held across a panic");
            if cache.epoch != epoch || cache.rows.len() >= CACHE_CAPACITY {
                cache.rows.clear();
                cache.epoch = epoch;
            }
            if let Some(cached) = cache.rows.get(&key) {
                if cached.player_version == player_version {
                    return Ok(cached.rows.clone());
                }
            }
        }
        let rows = Arc::new(hud_stats::load_rows(conn, room, hero, player, with_custom, format, None)?);
        let mut cache = self.cache.lock().expect("the HUD cache lock is never held across a panic");
        if cache.epoch == epoch {
            cache.rows.insert(key, CachedRows { player_version, rows: rows.clone() });
        }
        Ok(rows)
    }

    pub fn players(&self, request: &HudPlayersRequest) -> Result<Value> {
        let conn = self.db.conn()?;
        // Custom stats cost two queries: only a request that asks for one pays for them.
        let with_custom = request.stats.iter().any(hud_stats::is_custom);
        let ready = if with_custom { custom_store::ready_ids(&conn)? } else { Default::default() };
        let format = parse_format(request.spin_format.as_deref()).ok().flatten();
        let mut players = Vec::with_capacity(request.players.len());
        for name in &request.players {
            // A figure as of a past date is read once for that hand: it is not worth keeping in memory.
            let rows = match request.before.as_deref().filter(|b| !b.is_empty()) {
                Some(before) => Arc::new(hud_stats::load_rows(&conn, &request.room, &request.hero_name, name, with_custom, format, Some(before))?),
                None => self.rows_of(&conn, &request.room, &request.hero_name, name, with_custom, format)?,
            };
            let (hands, stats) = hud_stats::compute(&rows, &request.stats, &ready);
            let note = player_notes::get(&conn, &request.room, name)?.unwrap_or_default();
            players.push(json!({ "name": name, "room": request.room, "hands": hands, "stats": stats, "note": note.note, "tag": note.tag }));
        }
        Ok(json!({ "players": players }))
    }

    /// The figures of the whole pool (every opponent of the hero in the room): what a player is
    /// compared with. Same shape as one player of [`HudService::players`].
    pub fn pool(&self, request: &HudPlayersRequest) -> Result<Value> {
        let format = parse_format(request.spin_format.as_deref()).ok().flatten();
        let rows = self.pool_rows(&request.room, &request.hero_name, format)?;
        let (hands, stats) = hud_stats::compute(&rows, &request.stats, &Default::default());
        Ok(json!({ "room": request.room, "hands": hands, "stats": stats }))
    }

    /// The rows of every opponent of the hero in a room, kept for [`POOL_TTL`].
    fn pool_rows(&self, room: &str, hero: &str, format: Option<SpinFormat>) -> Result<Arc<Vec<Row>>> {
        let key: PoolKey = (room.to_string(), hero.to_string(), format);
        let cached = {
            let pools = self.pools.lock().expect("the HUD pool lock is never held across a panic");
            pools.get(&key).filter(|(at, _)| at.elapsed() < POOL_TTL).map(|(_, rows)| rows.clone())
        };
        match cached {
            Some(rows) => Ok(rows),
            None => {
                let conn = self.db.conn()?;
                let rows = Arc::new(hud_stats::load_pool_rows(&conn, room, hero, format)?);
                self.pools.lock().expect("the HUD pool lock is never held across a panic").insert(key, (Instant::now(), rows.clone()));
                Ok(rows)
            }
        }
    }

    /// Best responses against the all-in frequencies the pool shows, one block per stack depth.
    pub fn exploit(&self, room: &str, hero: &str, spin_format: Option<&str>) -> std::result::Result<Value, String> {
        let format = parse_format(spin_format)?;
        if room.trim().is_empty() || hero.trim().is_empty() {
            return Err("room and heroName are required".into());
        }
        let rows = self.pool_rows(room, hero, format).map_err(|e| e.to_string())?;
        Ok(crate::services::exploit::analyze(&rows))
    }

    /// The newest hands behind a figure, summarised, with how many there are in all.
    pub fn figure_hands(&self, request: &HudFigureHandsRequest) -> Result<Value> {
        let conn = self.db.conn()?;
        let with_custom = hud_stats::is_custom(&request.stat);
        let ready = if with_custom { custom_store::ready_ids(&conn)? } else { Default::default() };
        let rows = hud_stats::load_identified_rows(&conn, &request.room, &request.hero_name, &request.player, with_custom, parse_format(request.spin_format.as_deref()).ok().flatten(), None)?;
        let (listed, total) = hud_stats::figure_hand_ids(&rows, &request.stat, &request.buckets, &ready, request.which, request.limit);
        let ids: Vec<String> = listed.iter().map(|hand| hand.hand_id.clone()).collect();
        let mut hands = hud_hands::summaries(&conn, &request.player, &ids)?;
        for hand in &mut hands {
            let done = listed.iter().find(|l| hand["id"].as_str() == Some(l.hand_id.as_str())).is_some_and(|l| l.done);
            hand["done"] = json!(done);
        }
        Ok(json!({ "total": total, "hands": hands }))
    }

    /// The newest hands behind a figure over every room, at most [`MAX_FIGURE_HAND_IDS`], and how
    /// many there are in all.
    pub fn figure_hand_ids(&self, request: &FigureHandIdsRequest) -> Result<Value> {
        let conn = self.db.conn()?;
        let with_custom = hud_stats::is_custom(&request.stat);
        let ready = if with_custom { custom_store::ready_ids(&conn)? } else { Default::default() };
        let format = parse_format(request.spin_format.as_deref()).ok().flatten();
        let player = if request.player.trim().is_empty() { request.hero_name.as_str() } else { request.player.as_str() };
        let rooms: Vec<String> = {
            let mut stmt = conn.prepare("SELECT DISTINCT room FROM hands WHERE room IS NOT NULL AND room != ''")?;
            let rooms = stmt.query_map([], |r| r.get(0))?.collect::<std::result::Result<_, _>>()?;
            rooms
        };
        let mut found: Vec<(String, String)> = Vec::new();
        let mut total = 0;
        for room in rooms {
            let rows = hud_stats::load_identified_rows(&conn, &room, &request.hero_name, player, with_custom, format, None)?;
            let (listed, count) = hud_stats::figure_hand_ids(&rows, &request.stat, &request.buckets, &ready, request.which, MAX_FIGURE_HAND_IDS);
            total += count;
            for hand in listed {
                let played_at = rows.iter().find(|r| r.hand_id == hand.hand_id).map(|r| r.played_at.clone()).unwrap_or_default();
                found.push((played_at, hand.hand_id));
            }
        }
        found.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
        found.truncate(MAX_FIGURE_HAND_IDS);
        Ok(json!({ "total": total, "handIds": found.into_iter().map(|(_, id)| id).collect::<Vec<_>>() }))
    }

    /// Tournaments of `room` being played: see [`hud_tables::active_tables`].
    pub fn active_tables(&self, room: &str, since: &str, heroes: &[String]) -> Result<Value> {
        Ok(Value::Array(hud_tables::active_tables(&*self.db.conn()?, room, since, heroes)?))
    }

    pub fn set_note(&self, request: &HudNoteRequest) -> Result<()> {
        let note = PlayerNote { note: request.note.clone(), tag: request.tag.clone() };
        player_notes::set(&*self.db.conn()?, &request.room, &request.player_name, &note)
    }
}
