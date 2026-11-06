//! The hands behind a HUD figure, read from the database and reduced for display.

use rusqlite::Connection;
use serde_json::{json, Value};

use crate::engines::hand_summary::{summarize, HandInput};
use crate::Result;

/// A short summary of each of `ids`, from the point of view of `player`, in the order given. A hand
/// that is no longer in the database is skipped.
pub fn summaries(conn: &Connection, player: &str, ids: &[String]) -> Result<Vec<Value>> {
    let mut hand = conn.prepare_cached(
        "SELECT h.date_time, h.blinds, h.preflop_action, h.flop_action, h.turn_action, h.river_action,
                h.flop, h.turn, h.river, ph.cards, ph.net_profit
         FROM hands h JOIN player_hands ph ON ph.hand_id = h.id
         WHERE h.id = ?1 AND ph.player_name = ?2",
    )?;
    let mut seats = conn.prepare_cached("SELECT player_name, stack FROM player_hands WHERE hand_id = ?1")?;

    let mut out = Vec::with_capacity(ids.len());
    for id in ids {
        let mut rows = hand.query(rusqlite::params![id, player])?;
        let Some(row) = rows.next()? else { continue };
        let text = |i: usize| -> rusqlite::Result<String> { Ok(row.get::<_, Option<String>>(i)?.unwrap_or_default()) };
        let (played_at, blinds) = (text(0)?, text(1)?);
        let actions = [text(2)?, text(3)?, text(4)?, text(5)?];
        let board = [text(6)?, text(7)?, text(8)?];
        let cards = text(9)?;
        let net_profit = row.get::<_, Option<f64>>(10)?.unwrap_or(0.0);

        let stacks: Vec<(String, f64)> = seats
            .query_map([id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<f64>>(1)?.unwrap_or(0.0))))?
            .collect::<std::result::Result<_, _>>()?;
        let summary = summarize(&HandInput {
            blinds: &blinds,
            player,
            stacks: &stacks,
            actions: [&actions[0], &actions[1], &actions[2], &actions[3]],
            board: [&board[0], &board[1], &board[2]],
            cards: &cards,
            net_profit,
        });
        let mut value = serde_json::to_value(summary)?;
        value["id"] = json!(id);
        value["playedAt"] = json!(played_at);
        out.push(value);
    }
    Ok(out)
}
