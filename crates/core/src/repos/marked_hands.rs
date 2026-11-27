//! Data access for the hands the player marked to review.

use rusqlite::{params, Connection};
use serde_json::{json, Value};

use crate::Result;

pub fn mark(conn: &Connection, hand_id: &str, marked_at: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO marked_hands (hand_id, marked_at) VALUES (?1, ?2)
         ON CONFLICT(hand_id) DO UPDATE SET marked_at = excluded.marked_at",
        params![hand_id, marked_at],
    )?;
    Ok(())
}

pub fn unmark(conn: &Connection, hand_id: &str) -> Result<()> {
    conn.execute("DELETE FROM marked_hands WHERE hand_id = ?1", params![hand_id])?;
    Ok(())
}

/// The marked hands, most recently marked first. A mark whose hand was deleted is still listed:
/// the list only reports what the player marked.
pub fn list(conn: &Connection) -> Result<Vec<Value>> {
    let mut stmt = conn.prepare(
        "SELECT m.hand_id, m.marked_at, h.room, h.date_time
         FROM marked_hands m LEFT JOIN hands h ON h.id = m.hand_id
         ORDER BY m.marked_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(json!({
            "handId": row.get::<_, String>(0)?,
            "markedAt": row.get::<_, String>(1)?,
            "room": row.get::<_, Option<String>>(2)?,
            "dateTime": row.get::<_, Option<String>>(3)?,
        }))
    })?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}
