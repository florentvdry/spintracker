//! What the hero's history against one player amounts to: the games they shared, the chip EV the
//! hero made against them, their tags and the note kept on them.

use rusqlite::Connection;
use serde_json::{json, Value};

use super::hands_query::hero_resolution_sql;
use super::player_notes;
use crate::services::auto_tags;
use crate::Result;

/// Games and hands the hero shared with `name`, and the hero's result in them. `room` is the room
/// of the player (the notes and the automatic tags are kept per room); empty when unknown.
pub fn summary(conn: &Connection, hero: &str, name: &str, room: &str) -> Result<Value> {
    let sql = format!(
        "SELECT COUNT(DISTINCT h.game_id), COUNT(*),
                COALESCE(SUM(COALESCE(me.net_won_adjusted, 0)), 0), COALESCE(SUM(COALESCE(me.net_profit, 0)), 0),
                MIN(h.date_time), MAX(h.date_time)
         FROM hands h
         JOIN player_hands opp ON opp.hand_id = h.id AND opp.player_name = @opponent
         JOIN player_hands me ON me.hand_id = h.id AND me.player_name IN {}
         WHERE h.player_count IN (2, 3)",
        hero_resolution_sql("@hero")
    );
    let (games, hands, cev, profit, first, last): (i64, i64, f64, f64, Option<String>, Option<String>) = conn.query_row(
        &sql,
        rusqlite::named_params! { "@opponent": name, "@hero": hero },
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
    )?;
    let note = if room.is_empty() { None } else { player_notes::get(conn, room, name)? };
    let auto_tags = if room.is_empty() { Vec::new() } else { auto_tags::tags_of(conn, room, name)? };
    Ok(json!({
        "name": name,
        "room": room,
        "games": games,
        "hands": hands,
        "cev": cev,
        "cevPerGame": if games > 0 { cev / games as f64 } else { 0.0 },
        "profitChips": profit,
        "firstPlayedAt": first,
        "lastPlayedAt": last,
        "autoTags": auto_tags,
        "note": note.as_ref().map(|n| n.note.clone()).unwrap_or_default(),
        "tag": note.map(|n| n.tag).unwrap_or_default(),
    }))
}
