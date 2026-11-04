//! Data for the table HUD: the figures of a few players and the notes the user attached to them.
//!
//! Answers must stay fast between two hands, so the rows of a player are kept in memory until
//! the data changes (see [`Database::data_version`]).

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::Deserialize;
use serde_json::{json, Value};

use crate::db::Database;
use crate::repos::detailed_stats::Row;
use crate::repos::hud_stats::{self, HudStatRequest};
use crate::repos::hud_tables;
use crate::repos::player_notes::{self, PlayerNote, MAX_NOTE_CHARS};
use crate::Result;

/// A table shows at most this many opponents, hero included.
const MAX_PLAYERS: usize = 12;
/// Enough for a heads-up layout asked in one go (stack-depth tables hold about a hundred figures).
const MAX_STATS: usize = 256;
/// Players kept in memory; the cache is emptied when it grows past this.
const CACHE_CAPACITY: usize = 500;

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
}

#[derive(Default)]
struct Cache {
    version: u64,
    rows: HashMap<CacheKey, Arc<Vec<Row>>>,
}

pub struct HudService {
    db: Arc<Database>,
    cache: Mutex<Cache>,
}

impl HudService {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db, cache: Mutex::new(Cache::default()) }
    }

    fn rows_of(&self, room: &str, hero: &str, player: &str) -> Result<Arc<Vec<Row>>> {
        let version = self.db.data_version();
        let key = CacheKey { room: room.into(), hero: hero.into(), player: player.into() };
        {
            let mut cache = self.cache.lock().expect("the HUD cache lock is never held across a panic");
            if cache.version != version || cache.rows.len() >= CACHE_CAPACITY {
                cache.rows.clear();
                cache.version = version;
            }
            if let Some(rows) = cache.rows.get(&key) {
                return Ok(rows.clone());
            }
        }
        let rows = Arc::new(hud_stats::load_rows(&*self.db.conn()?, room, hero, player)?);
        let mut cache = self.cache.lock().expect("the HUD cache lock is never held across a panic");
        // Data written while the rows were being read makes them stale: do not keep them.
        if cache.version == version {
            cache.rows.insert(key, rows.clone());
        }
        Ok(rows)
    }

    pub fn players(&self, request: &HudPlayersRequest) -> Result<Value> {
        let conn = self.db.conn()?;
        let mut players = Vec::with_capacity(request.players.len());
        for name in &request.players {
            let rows = self.rows_of(&request.room, &request.hero_name, name)?;
            let (hands, stats) = hud_stats::compute(&rows, &request.stats);
            let note = player_notes::get(&conn, &request.room, name)?.unwrap_or_default();
            players.push(json!({ "name": name, "room": request.room, "hands": hands, "stats": stats, "note": note.note, "tag": note.tag }));
        }
        Ok(json!({ "players": players }))
    }

    /// Tournaments of `room` being played: see [`hud_tables::active_tables`].
    pub fn active_tables(&self, room: &str, since: &str) -> Result<Value> {
        Ok(Value::Array(hud_tables::active_tables(&*self.db.conn()?, room, since)?))
    }

    pub fn set_note(&self, request: &HudNoteRequest) -> Result<()> {
        let note = PlayerNote { note: request.note.clone(), tag: request.tag.clone() };
        player_notes::set(&*self.db.conn()?, &request.room, &request.player_name, &note)
    }
}
