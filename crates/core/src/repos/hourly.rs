//! Data access for the hourly analysis: one sample per tournament and per hand of the hero.

use rusqlite::Connection;

use crate::engines::hourly::{HandSample, TournamentSample};
use crate::repos::stats::{parse_date_time, resolve_hero, scope, Room, TournamentFigures};
use crate::Result;

/// Hero filters shared by both queries: the same scope as the dashboard.
pub struct HourlyScope<'a> {
    pub hero_name: Option<&'a str>,
    pub date_from: Option<&'a str>,
    pub date_to: Option<&'a str>,
    pub buy_in: Option<f64>,
}

/// Tournaments of the hero, with the euro result the dashboard computes for them.
pub fn tournaments(conn: &Connection, s: &HourlyScope) -> Result<Vec<TournamentSample>> {
    let hero = resolve_hero(conn, s.hero_name)?;
    let scope = scope(hero.as_deref(), s.date_from, s.date_to, s.buy_in, false, &["h.game_id IS NOT NULL"]);
    let sql = format!(
        "SELECT MIN(h.date_time), MAX(h.room), MAX(h.buy_in), MAX(h.prize_pool), MAX(h.multiplier),
                MAX(h.position), MIN(h.player_count), SUM(COALESCE(ph.net_profit, 0.0))
         FROM {} {} {}
         GROUP BY h.game_id",
        scope.hands, scope.join, scope.where_clause
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(&scope.params()[..])?;
    let mut samples = Vec::new();
    while let Some(r) = rows.next()? {
        let start: Option<String> = r.get(0)?;
        let Some(start) = start.as_deref().and_then(parse_date_time) else {
            continue; // A tournament without a readable start cannot be placed in the grid.
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
        samples.push(TournamentSample { start, euro_profit: figures.euro_profit() });
    }
    Ok(samples)
}

/// Hands of the hero with the number of opponents and of regulars among them.
pub fn hands(conn: &Connection, s: &HourlyScope) -> Result<Vec<HandSample>> {
    let hero = resolve_hero(conn, s.hero_name)?;
    let scope = scope(hero.as_deref(), s.date_from, s.date_to, s.buy_in, false, &[]);
    let sql = format!(
        "SELECT h.date_time,
                (SELECT COUNT(*) FROM player_hands o WHERE o.hand_id = h.id AND o.player_name <> ph.player_name),
                (SELECT COUNT(*) FROM player_hands o JOIN players pl ON pl.name = o.player_name
                   WHERE o.hand_id = h.id AND o.player_name <> ph.player_name AND pl.is_reg = 1)
         FROM {} {} {}",
        scope.hands, scope.join, scope.where_clause
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(&scope.params()[..])?;
    let mut samples = Vec::new();
    while let Some(r) = rows.next()? {
        let date: Option<String> = r.get(0)?;
        let Some(time) = date.as_deref().and_then(parse_date_time) else {
            continue;
        };
        samples.push(HandSample { time, opponents: r.get(1)?, regs: r.get(2)? });
    }
    Ok(samples)
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

    fn insert_hand(conn: &Connection, id: &str, game: &str, date: &str, hero_profit: f64) {
        conn.execute(
            "INSERT INTO hands (id, room, game_id, date_time, player_count, multiplier, position, buy_in, prize_pool)
             VALUES (?1, 'Winamax', ?2, ?3, 3, 100, 1, 5.0, 500.0)",
            rusqlite::params![id, game, date],
        )
        .unwrap();
        for (player, profit) in [("Hero", hero_profit), ("Reg", 0.0), ("Fish", 0.0)] {
            conn.execute(
                "INSERT INTO player_hands (hand_id, player_name, net_profit, net_won_adjusted) VALUES (?1, ?2, ?3, ?3)",
                rusqlite::params![id, player, profit],
            )
            .unwrap();
        }
    }

    #[test]
    fn tournaments_are_one_sample_per_game_at_its_first_hand() {
        let conn = test_conn();
        conn.execute_batch("INSERT INTO players (name, is_reg) VALUES ('Hero', 0), ('Reg', 1), ('Fish', 0);").unwrap();
        insert_hand(&conn, "h1", "G1", "2026-01-05 21:10:00", 1.0);
        insert_hand(&conn, "h2", "G1", "2026-01-05 21:20:00", 2.0);
        insert_hand(&conn, "h3", "G2", "2026-01-06 08:00:00", 0.0);

        let scope = HourlyScope { hero_name: Some("Hero"), date_from: None, date_to: None, buy_in: None };
        let mut samples = tournaments(&conn, &scope).unwrap();
        samples.sort_by_key(|s| s.start);
        assert_eq!(samples.len(), 2);
        assert_eq!(samples[0].start.hour(), 21);
        assert_eq!(samples[1].start.hour(), 8);
    }

    #[test]
    fn hands_count_opponents_and_regulars() {
        let conn = test_conn();
        conn.execute_batch("INSERT INTO players (name, is_reg) VALUES ('Hero', 0), ('Reg', 1), ('Fish', 0);").unwrap();
        insert_hand(&conn, "h1", "G1", "2026-01-05 21:10:00", 0.0);

        let scope = HourlyScope { hero_name: Some("Hero"), date_from: None, date_to: None, buy_in: None };
        let hands = hands(&conn, &scope).unwrap();
        assert_eq!(hands.len(), 1);
        assert_eq!(hands[0].opponents, 2);
        assert_eq!(hands[0].regs, 1);
    }
}
