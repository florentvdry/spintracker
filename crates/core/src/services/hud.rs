//! Data for the table HUD: the figures of a few players and the notes the user attached to them.
//!
//! Answers must stay fast between two hands, so the rows of a player are kept in memory until
//! the data changes (see [`Database::data_version`]).

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::db::Database;
use crate::repos::detailed_stats::Row;
use crate::repos::hud_hands;
use crate::repos::hud_stats::{self, HandsOf, HudStatRequest};
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
/// Stack depths a group can hold: there are not more depths than this.
const MAX_GROUP_BUCKETS: usize = 16;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HudPlayersRequest {
    pub room: String,
    pub hero_name: String,
    pub players: Vec<String>,
    pub stats: Vec<HudStatRequest>,
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

pub struct HudService {
    db: Arc<Database>,
    cache: Mutex<Cache>,
}

impl HudService {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db, cache: Mutex::new(Cache::default()) }
    }

    /// `conn` is the caller's connection: asking the pool for a second one while holding the first
    /// could wait for ever when every connection is held by a caller doing the same.
    fn rows_of(&self, conn: &Connection, room: &str, hero: &str, player: &str, with_custom: bool) -> Result<Arc<Vec<Row>>> {
        // Versions are read before the rows: a write landing in between makes the entry look stale
        // at the next read instead of hiding it.
        let epoch = self.db.epoch();
        let player_version = self.db.player_version(player).max(self.db.player_version(hero));
        let key = CacheKey { room: room.into(), hero: hero.into(), player: player.into(), with_custom };
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
        let rows = Arc::new(hud_stats::load_rows(conn, room, hero, player, with_custom)?);
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
        let mut players = Vec::with_capacity(request.players.len());
        for name in &request.players {
            let rows = self.rows_of(&conn, &request.room, &request.hero_name, name, with_custom)?;
            let (hands, stats) = hud_stats::compute(&rows, &request.stats, &ready);
            let note = player_notes::get(&conn, &request.room, name)?.unwrap_or_default();
            players.push(json!({ "name": name, "room": request.room, "hands": hands, "stats": stats, "note": note.note, "tag": note.tag }));
        }
        Ok(json!({ "players": players }))
    }

    /// The newest hands behind a figure, summarised, with how many there are in all.
    pub fn figure_hands(&self, request: &HudFigureHandsRequest) -> Result<Value> {
        let conn = self.db.conn()?;
        let with_custom = hud_stats::is_custom(&request.stat);
        let ready = if with_custom { custom_store::ready_ids(&conn)? } else { Default::default() };
        let rows = hud_stats::load_identified_rows(&conn, &request.room, &request.hero_name, &request.player, with_custom)?;
        let (listed, total) = hud_stats::figure_hand_ids(&rows, &request.stat, &request.buckets, &ready, request.which, request.limit);
        let ids: Vec<String> = listed.iter().map(|hand| hand.hand_id.clone()).collect();
        let mut hands = hud_hands::summaries(&conn, &request.player, &ids)?;
        for hand in &mut hands {
            let done = listed.iter().find(|l| hand["id"].as_str() == Some(l.hand_id.as_str())).is_some_and(|l| l.done);
            hand["done"] = json!(done);
        }
        Ok(json!({ "total": total, "hands": hands }))
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
