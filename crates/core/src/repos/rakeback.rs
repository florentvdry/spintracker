//! Data access for rakeback: entry fees per room and the percentage set for each room.

use rusqlite::{params, Connection};

use crate::Result;

/// Entry fees paid in one room. The fee is repeated on every hand of a tournament, so it is
/// taken once per `game_id` before being summed.
pub struct RoomFees {
    pub room: String,
    pub tournaments: i64,
    pub total_fees: f64,
}

pub fn fees_by_room(conn: &Connection) -> Result<Vec<RoomFees>> {
    let mut stmt = conn.prepare(
        "SELECT room, COUNT(*), COALESCE(SUM(fee), 0.0) FROM (
             SELECT room, game_id, MAX(COALESCE(rake_per_player, 0.0)) AS fee
             FROM hands
             WHERE game_id IS NOT NULL
             GROUP BY room, game_id
         )
         GROUP BY room
         ORDER BY room",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(RoomFees { room: row.get(0)?, tournaments: row.get(1)?, total_fees: row.get(2)? })
    })?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}

pub fn percents(conn: &Connection) -> Result<Vec<(String, f64)>> {
    let mut stmt = conn.prepare("SELECT room, percent FROM rakeback_settings")?;
    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}

pub fn set_percent(conn: &Connection, room: &str, percent: f64) -> Result<()> {
    conn.execute(
        "INSERT INTO rakeback_settings (room, percent) VALUES (?1, ?2)
         ON CONFLICT(room) DO UPDATE SET percent = excluded.percent",
        params![room, percent],
    )?;
    Ok(())
}
