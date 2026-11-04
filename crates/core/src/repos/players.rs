//! Aggregated player records.

use rusqlite::Connection;

use crate::Result;

/// A player with at least this many hands is flagged as a regular, unless forced otherwise.
pub const REG_HANDS_THRESHOLD: i64 = 500;

/// Recomputes every player's totals from `player_hands` (hands of three players or fewer).
/// A manual regular flag is never overridden, and a regular stays one.
/// (The former SQL compared a missing row to 0, so a new player only became a regular on the
/// second recount; a player not yet known now counts as not forced.)
pub fn update_player_stats(conn: &Connection) -> Result<()> {
    conn.execute(
        "INSERT INTO players (name, room, total_hands, total_profit, total_ev_profit, is_reg, is_reg_forced, updated_at)
         SELECT
             ph.player_name,
             (SELECT h.room FROM hands h WHERE h.id = ph.hand_id LIMIT 1) AS room,
             COUNT(*) AS total_hands,
             SUM(ph.net_profit) AS total_profit,
             SUM(ph.net_won_adjusted) AS total_ev_profit,
             CASE
                 WHEN COUNT(*) >= ?1 AND COALESCE((SELECT is_reg_forced FROM players p2 WHERE p2.name = ph.player_name), 0) = 0 THEN 1
                 WHEN (SELECT is_reg FROM players p2 WHERE p2.name = ph.player_name) = 1 THEN 1
                 ELSE 0
             END AS is_reg,
             COALESCE((SELECT is_reg_forced FROM players p2 WHERE p2.name = ph.player_name), 0) AS is_reg_forced,
             CURRENT_TIMESTAMP
         FROM player_hands ph
         JOIN hands h ON ph.hand_id = h.id
         WHERE h.player_count <= 3
         GROUP BY ph.player_name
         ON CONFLICT(name) DO UPDATE SET
             room = excluded.room,
             total_hands = excluded.total_hands,
             total_profit = excluded.total_profit,
             total_ev_profit = excluded.total_ev_profit,
             is_reg = excluded.is_reg,
             is_reg_forced = excluded.is_reg_forced,
             updated_at = excluded.updated_at",
        [REG_HANDS_THRESHOLD],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn add_hands(conn: &Connection, player: &str, count: usize, profit: f64, start: usize) {
        for n in start..start + count {
            let id = format!("{player}-{n}");
            conn.execute("INSERT INTO hands (id, room, player_count) VALUES (?1, 'Winamax', 3)", [&id]).unwrap();
            conn.execute(
                "INSERT INTO player_hands (hand_id, player_name, net_profit, net_won_adjusted) VALUES (?1, ?2, ?3, ?3)",
                rusqlite::params![id, player, profit],
            )
            .unwrap();
        }
    }

    fn player(conn: &Connection, name: &str) -> (i64, f64, i64, i64) {
        conn.query_row(
            "SELECT total_hands, total_profit, is_reg, is_reg_forced FROM players WHERE name = ?1",
            [name],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .unwrap()
    }

    #[test]
    fn totals_and_regular_flag() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(dir.path().join("a.db")).unwrap();
        let conn = db.conn().unwrap();
        add_hands(&conn, "fish", 10, 5.0, 0);
        add_hands(&conn, "reg", 500, -1.0, 0);
        update_player_stats(&conn).unwrap();
        assert_eq!(player(&conn, "fish"), (10, 50.0, 0, 0));
        assert_eq!(player(&conn, "reg"), (500, -500.0, 1, 0));
    }

    #[test]
    fn forced_and_sticky_flags_survive_a_recount() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(dir.path().join("a.db")).unwrap();
        let conn = db.conn().unwrap();
        add_hands(&conn, "reg", 500, 1.0, 0);
        add_hands(&conn, "fish", 20, 1.0, 0);
        update_player_stats(&conn).unwrap();

        // A player manually marked as not a regular stays one even with many hands.
        conn.execute("UPDATE players SET is_reg = 0, is_reg_forced = 1 WHERE name = 'reg'", []).unwrap();
        add_hands(&conn, "reg", 10, 1.0, 500);
        // A regular flag, once set, is kept.
        conn.execute("UPDATE players SET is_reg = 1 WHERE name = 'fish'", []).unwrap();
        update_player_stats(&conn).unwrap();
        assert_eq!(player(&conn, "reg"), (510, 510.0, 0, 1));
        assert_eq!(player(&conn, "fish").2, 1);
    }

    #[test]
    fn hands_with_more_than_three_players_are_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(dir.path().join("a.db")).unwrap();
        let conn = db.conn().unwrap();
        add_hands(&conn, "p", 3, 1.0, 0);
        conn.execute("UPDATE hands SET player_count = 6 WHERE id = 'p-0'", []).unwrap();
        update_player_stats(&conn).unwrap();
        assert_eq!(player(&conn, "p").0, 2);
    }
}
