//! Data access for the bankroll: the player's deposits and withdrawals, and the euro result of
//! each tournament of the hero.

use chrono::NaiveDateTime;
use rusqlite::{params, Connection};

use crate::engines::bankroll::Movement;
use crate::repos::stats::{parse_date_time, resolve_hero, scope, Room, TournamentFigures};
use crate::Result;

#[derive(Debug, Clone, PartialEq)]
pub struct StoredMovement {
    pub id: i64,
    pub occurred_at: String,
    pub amount: f64,
    pub note: String,
}

pub fn movements(conn: &Connection) -> Result<Vec<StoredMovement>> {
    let mut stmt = conn.prepare("SELECT id, occurred_at, amount, note FROM bankroll_movements ORDER BY occurred_at, id")?;
    let rows = stmt.query_map([], |row| {
        Ok(StoredMovement { id: row.get(0)?, occurred_at: row.get(1)?, amount: row.get(2)?, note: row.get(3)? })
    })?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}

/// Movements read as times; a row whose date cannot be read is left out of the curve.
pub fn dated_movements(conn: &Connection) -> Result<Vec<Movement>> {
    Ok(movements(conn)?
        .into_iter()
        .filter_map(|m| parse_date_time(&m.occurred_at).map(|time| Movement { time, amount: m.amount }))
        .collect())
}

pub fn insert_movement(conn: &Connection, occurred_at: &str, amount: f64, note: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO bankroll_movements (occurred_at, amount, note) VALUES (?1, ?2, ?3)",
        params![occurred_at, amount, note],
    )?;
    Ok(())
}

pub fn delete_movement(conn: &Connection, id: i64) -> Result<bool> {
    Ok(conn.execute("DELETE FROM bankroll_movements WHERE id = ?1", params![id])? > 0)
}

/// Euro result of each tournament of the hero, with its start, over the whole history.
pub fn tournament_results(conn: &Connection, hero_name: Option<&str>) -> Result<Vec<(NaiveDateTime, f64)>> {
    let hero = resolve_hero(conn, hero_name)?;
    let scope = scope(hero.as_deref(), None, None, None, false, &["h.game_id IS NOT NULL"]);
    let sql = format!(
        "SELECT MIN(h.date_time), MAX(h.room), MAX(h.buy_in), MAX(h.prize_pool), MAX(h.multiplier),
                MAX(h.position), MIN(h.player_count), SUM(COALESCE(ph.net_profit, 0.0))
         FROM {} {} {}
         GROUP BY h.game_id",
        scope.hands, scope.join, scope.where_clause
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(&scope.params()[..])?;
    let mut results = Vec::new();
    while let Some(r) = rows.next()? {
        let start: Option<String> = r.get(0)?;
        let Some(start) = start.as_deref().and_then(parse_date_time) else {
            continue;
        };
        let figures = TournamentFigures {
            room: Room::from_name(&r.get::<_, Option<String>>(1)?.unwrap_or_default()),
            buy_in: r.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
            prize_pool: r.get::<_, Option<f64>>(3)?.unwrap_or(0.0),
            multiplier: r.get::<_, Option<i32>>(4)?.unwrap_or(0),
            position: r.get::<_, Option<i32>>(5)?.unwrap_or(0),
            lowest_player_count: r.get::<_, Option<i32>>(6)?.unwrap_or(3),
            chip_profit: r.get(7)?,
        };
        results.push((start, figures.euro_profit()));
    }
    Ok(results)
}
