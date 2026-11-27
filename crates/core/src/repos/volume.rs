//! Data access for the volume view: one span per tournament, and the goals the player set.

use rusqlite::{params, Connection};

use crate::engines::volume::{GoalPeriod, Span};
use crate::repos::stats::{parse_date_time, resolve_hero, scope};
use crate::Result;

/// Hero filters, as on the dashboard.
pub struct VolumeScope<'a> {
    pub hero_name: Option<&'a str>,
    pub date_from: Option<&'a str>,
    pub date_to: Option<&'a str>,
    pub buy_in: Option<f64>,
}

/// First and last hand of each tournament of the hero in the scope.
pub fn spans(conn: &Connection, s: &VolumeScope) -> Result<Vec<Span>> {
    let hero = resolve_hero(conn, s.hero_name)?;
    let scope = scope(hero.as_deref(), s.date_from, s.date_to, s.buy_in, false, &["h.game_id IS NOT NULL"]);
    let sql = format!(
        "SELECT MIN(h.date_time), MAX(h.date_time) FROM {} {} {} GROUP BY h.game_id",
        scope.hands, scope.join, scope.where_clause
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(&scope.params()[..])?;
    let mut spans = Vec::new();
    while let Some(r) = rows.next()? {
        let first: Option<String> = r.get(0)?;
        let last: Option<String> = r.get(1)?;
        if let (Some(start), Some(end)) = (first.as_deref().and_then(parse_date_time), last.as_deref().and_then(parse_date_time)) {
            spans.push(Span { start, end: end.max(start) });
        }
    }
    Ok(spans)
}

pub fn goals(conn: &Connection) -> Result<Vec<(GoalPeriod, i64)>> {
    let mut stmt = conn.prepare("SELECT period, target FROM goals ORDER BY period")?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))?;
    let mut goals = Vec::new();
    for row in rows {
        let (period, target) = row?;
        if let Some(period) = GoalPeriod::parse(&period) {
            goals.push((period, target));
        }
    }
    Ok(goals)
}

pub fn set_goal(conn: &Connection, period: GoalPeriod, target: i64) -> Result<()> {
    conn.execute(
        "INSERT INTO goals (period, target) VALUES (?1, ?2) ON CONFLICT(period) DO UPDATE SET target = excluded.target",
        params![period_key(period), target],
    )?;
    Ok(())
}

pub fn delete_goal(conn: &Connection, period: GoalPeriod) -> Result<()> {
    conn.execute("DELETE FROM goals WHERE period = ?1", params![period_key(period)])?;
    Ok(())
}

fn period_key(period: GoalPeriod) -> &'static str {
    match period {
        GoalPeriod::Week => "week",
        GoalPeriod::Month => "month",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;
    use chrono::Timelike;

    fn test_conn() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations::run(&mut conn).unwrap();
        conn
    }

    fn insert_hand(conn: &Connection, id: &str, game: &str, date: &str) {
        conn.execute(
            "INSERT INTO hands (id, room, game_id, date_time, player_count, multiplier, position, buy_in)
             VALUES (?1, 'Winamax', ?2, ?3, 3, 100, 1, 5.0)",
            params![id, game, date],
        )
        .unwrap();
        conn.execute("INSERT INTO player_hands (hand_id, player_name, net_profit) VALUES (?1, 'Hero', 0.0)", params![id]).unwrap();
    }

    #[test]
    fn spans_run_from_first_to_last_hand_of_each_tournament() {
        let conn = test_conn();
        conn.execute_batch("INSERT INTO players (name, is_reg) VALUES ('Hero', 0);").unwrap();
        insert_hand(&conn, "h1", "G1", "2026-01-05 21:10:00");
        insert_hand(&conn, "h2", "G1", "2026-01-05 21:25:00");
        let scope = VolumeScope { hero_name: Some("Hero"), date_from: None, date_to: None, buy_in: None };
        let spans = spans(&conn, &scope).unwrap();
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].start.hour(), 21);
        assert_eq!((spans[0].end - spans[0].start).num_minutes(), 15);
    }

    #[test]
    fn goals_are_saved_read_and_removed() {
        let conn = test_conn();
        set_goal(&conn, GoalPeriod::Week, 40).unwrap();
        set_goal(&conn, GoalPeriod::Week, 50).unwrap();
        assert_eq!(goals(&conn).unwrap(), vec![(GoalPeriod::Week, 50)]);
        delete_goal(&conn, GoalPeriod::Week).unwrap();
        assert!(goals(&conn).unwrap().is_empty());
    }
}
