//! Rakeback: the share of the entry fees the player gets back from each room.

use std::collections::BTreeMap;

use rusqlite::Connection;
use serde::Serialize;

use crate::repos::rakeback as repo;
use crate::{Error, Result};

const MAX_PERCENT: f64 = 100.0;
const PERCENT_DIVISOR: f64 = 100.0;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomRakeback {
    pub room: String,
    pub tournaments: i64,
    pub total_fees: f64,
    pub percent: f64,
    pub rakeback: f64,
}

/// Rakeback owed for a total of entry fees at a percentage (0 to 100).
pub fn rakeback_amount(total_fees: f64, percent: f64) -> f64 {
    total_fees * percent / PERCENT_DIVISOR
}

/// Rooms with at least one tournament, each with its rakeback. Percentages default to 0.
pub fn summary(conn: &Connection) -> Result<Vec<RoomRakeback>> {
    let percents: BTreeMap<String, f64> = repo::percents(conn)?.into_iter().collect();
    Ok(repo::fees_by_room(conn)?
        .into_iter()
        .map(|fees| {
            let percent = percents.get(&fees.room).copied().unwrap_or(0.0);
            RoomRakeback {
                rakeback: rakeback_amount(fees.total_fees, percent),
                percent,
                room: fees.room,
                tournaments: fees.tournaments,
                total_fees: fees.total_fees,
            }
        })
        .collect())
}

pub fn set_percent(conn: &Connection, room: &str, percent: f64) -> Result<()> {
    let room = room.trim();
    if room.is_empty() {
        return Err(Error::Message("rakeback room must not be empty".into()));
    }
    if !percent.is_finite() || !(0.0..=MAX_PERCENT).contains(&percent) {
        return Err(Error::Message(format!("rakeback percent must be between 0 and {MAX_PERCENT}")));
    }
    repo::set_percent(conn, room, percent)
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

    fn insert_hand(conn: &Connection, id: i64, room: &str, game_id: &str, fee: f64) {
        conn.execute(
            "INSERT INTO hands (id, room, game_id, rake_per_player) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![id, room, game_id, fee],
        )
        .unwrap();
    }

    #[test]
    fn rakeback_amount_is_fee_times_percent() {
        assert!((rakeback_amount(200.0, 10.0) - 20.0).abs() < 1e-9);
        assert_eq!(rakeback_amount(200.0, 0.0), 0.0);
    }

    #[test]
    fn summary_counts_each_tournament_fee_once() {
        let conn = test_conn();
        // Three hands of the same tournament repeat the same fee: it must count once.
        insert_hand(&conn, 1, "Winamax", "T1", 2.0);
        insert_hand(&conn, 2, "Winamax", "T1", 2.0);
        insert_hand(&conn, 3, "Winamax", "T1", 2.0);
        insert_hand(&conn, 4, "Winamax", "T2", 3.0);
        set_percent(&conn, "Winamax", 10.0).unwrap();

        let rows = summary(&conn).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].tournaments, 2);
        assert!((rows[0].total_fees - 5.0).abs() < 1e-9);
        assert!((rows[0].rakeback - 0.5).abs() < 1e-9);
    }

    #[test]
    fn room_without_setting_gives_zero_rakeback() {
        let conn = test_conn();
        insert_hand(&conn, 1, "Unibet", "U1", 4.0);
        let rows = summary(&conn).unwrap();
        assert_eq!(rows[0].percent, 0.0);
        assert_eq!(rows[0].rakeback, 0.0);
    }

    #[test]
    fn set_percent_rejects_out_of_range_values() {
        let conn = test_conn();
        assert!(set_percent(&conn, "Winamax", -1.0).is_err());
        assert!(set_percent(&conn, "Winamax", 100.5).is_err());
        assert!(set_percent(&conn, "Winamax", f64::NAN).is_err());
        assert!(set_percent(&conn, "  ", 10.0).is_err());
        assert!(set_percent(&conn, "Winamax", 100.0).is_ok());
    }
}
