//! Data access for the CEV breakdown: one row per hero hand, in chronological order.

use rusqlite::Connection;

use crate::engines::cev_breakdown::HandRow;
use crate::repos::stats::{resolve_hero, scope};
use crate::Result;

/// Hands of the hero in the filtered scope, oldest first. The opponent counts are subqueries on
/// `player_hands`, whose primary key starts with `hand_id`, so each one is an indexed lookup.
pub fn hero_hands(
    conn: &Connection,
    hero_name: Option<&str>,
    date_from: Option<&str>,
    date_to: Option<&str>,
    buy_in: Option<f64>,
) -> Result<Vec<HandRow>> {
    let hero = resolve_hero(conn, hero_name)?;
    let scope = scope(hero.as_deref(), date_from, date_to, buy_in, false, &[]);
    let sql = format!(
        "SELECT h.game_id, COALESCE(h.multiplier, 0), ph.net_won_adjusted, COALESCE(ph.net_profit, 0),
                (SELECT COUNT(*) FROM player_hands o JOIN players pl ON pl.name = o.player_name
                   WHERE o.hand_id = h.id AND o.player_name <> ph.player_name AND pl.is_reg = 1),
                (SELECT COUNT(*) FROM player_hands o
                   WHERE o.hand_id = h.id AND o.player_name <> ph.player_name),
                COALESCE(ph.is_all_in, 0),
                COALESCE(ph.equity_river, ph.equity_turn, ph.equity_flop, ph.equity_preflop),
                COALESCE(h.position, 0)
         FROM {} {} {}
         ORDER BY h.date_time ASC, h.id ASC",
        scope.hands, scope.join, scope.where_clause
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(&scope.params()[..])?;
    let mut hands = Vec::new();
    while let Some(r) = rows.next()? {
        hands.push(HandRow {
            game_id: r.get(0)?,
            multiplier: r.get(1)?,
            ev: r.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
            hand_profit: r.get(3)?,
            regs: r.get(4)?,
            opponents: r.get(5)?,
            hero_all_in: r.get::<_, i64>(6)? != 0,
            hero_equity: r.get(7)?,
            finish: r.get(8)?,
        });
    }
    Ok(hands)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;

    fn test_conn() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations::run(&mut conn).unwrap();
        conn
    }

    /// One hand of a 3-max tournament: the hero, a regular and a fish at the table.
    fn insert_hand(conn: &Connection, id: &str, game: &str, date: &str, hero_profit: f64, hero_all_in: bool) {
        conn.execute(
            "INSERT INTO hands (id, room, game_id, date_time, player_count, multiplier, position, buy_in)
             VALUES (?1, 'Winamax', ?2, ?3, 3, 10, 0, 5.0)",
            rusqlite::params![id, game, date],
        )
        .unwrap();
        for (player, profit) in [("Hero", hero_profit), ("Reg", -hero_profit / 2.0), ("Fish", -hero_profit / 2.0)] {
            conn.execute(
                "INSERT INTO player_hands (hand_id, player_name, net_profit, net_won_adjusted, is_all_in, equity_river)
                 VALUES (?1, ?2, ?3, ?3, ?4, ?5)",
                rusqlite::params![id, player, profit, i64::from(hero_all_in && player == "Hero"), if player == "Hero" { Some(80.0) } else { None::<f64> }],
            )
            .unwrap();
        }
    }

    fn insert_players(conn: &Connection) {
        conn.execute_batch(
            "INSERT INTO players (name, is_reg) VALUES ('Hero', 0), ('Reg', 1), ('Fish', 0);",
        )
        .unwrap();
    }

    #[test]
    fn hero_hands_counts_regulars_and_reads_all_in_equity() {
        let conn = test_conn();
        insert_players(&conn);
        insert_hand(&conn, "h1", "G1", "2026-01-01 10:00:00", 4.0, false);
        insert_hand(&conn, "h2", "G1", "2026-01-01 10:05:00", -6.0, true);

        let hands = hero_hands(&conn, Some("Hero"), None, None, None).unwrap();
        assert_eq!(hands.len(), 2);
        assert_eq!(hands[0].regs, 1);
        assert_eq!(hands[0].opponents, 2);
        assert!(!hands[0].hero_all_in);
        assert!(hands[1].hero_all_in);
        assert_eq!(hands[1].hero_equity, Some(80.0));
        assert!((hands[1].hand_profit + 6.0).abs() < 1e-9);
    }
}
