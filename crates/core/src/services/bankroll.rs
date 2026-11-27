//! Bankroll: the balance over time, and the deposits and withdrawals that move it.

use chrono::Local;
use rusqlite::Connection;
use serde_json::{json, Value};

use crate::engines::bankroll::{curve, totals};
use crate::error::Error;
use crate::repos::bankroll as repo;
use crate::repos::stats::parse_date_time;
use crate::Result;

/// A single movement above this is almost certainly a typing mistake.
const MAX_MOVEMENT: f64 = 1_000_000_000.0;
const MAX_NOTE_CHARS: usize = 200;
const DATE_FORMAT: &str = "%Y-%m-%d %H:%M:%S";

pub fn overview(conn: &Connection, hero_name: Option<&str>) -> Result<Value> {
    let movements = repo::dated_movements(conn)?;
    let tournaments = repo::tournament_results(conn, hero_name)?;
    Ok(json!({
        "totals": totals(&movements, &tournaments),
        "curve": curve(&movements, &tournaments),
        "movements": repo::movements(conn)?
            .into_iter()
            .map(|m| json!({ "id": m.id, "occurredAt": m.occurred_at, "amount": m.amount, "note": m.note }))
            .collect::<Vec<_>>(),
    }))
}

/// Records a deposit (positive) or a withdrawal (negative). The date defaults to now.
pub fn record_movement(conn: &Connection, occurred_at: Option<&str>, amount: f64, note: &str) -> Result<()> {
    if !amount.is_finite() || amount == 0.0 || amount.abs() > MAX_MOVEMENT {
        return Err(Error::Message(format!("bankroll amount must be a non-zero number up to {MAX_MOVEMENT}")));
    }
    let note = note.trim();
    if note.chars().count() > MAX_NOTE_CHARS {
        return Err(Error::Message(format!("bankroll note is longer than {MAX_NOTE_CHARS} characters")));
    }
    let when = match occurred_at.map(str::trim).filter(|s| !s.is_empty()) {
        Some(raw) => parse_date_time(raw)
            .map(|t| t.format(DATE_FORMAT).to_string())
            .ok_or_else(|| Error::Message(format!("bankroll date is not readable: {raw}")))?,
        None => Local::now().naive_local().format(DATE_FORMAT).to_string(),
    };
    repo::insert_movement(conn, &when, amount, note)
}

pub fn remove_movement(conn: &Connection, id: i64) -> Result<bool> {
    repo::delete_movement(conn, id)
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

    #[test]
    fn deposit_is_stored_and_shown_in_the_overview() {
        let conn = test_conn();
        record_movement(&conn, Some("2026-01-02 09:00:00"), 100.0, " first deposit ").unwrap();
        record_movement(&conn, Some("2026-01-03 09:00:00"), -40.0, "").unwrap();
        let view = overview(&conn, None).unwrap();
        assert_eq!(view["totals"]["deposits"], json!(100.0));
        assert_eq!(view["totals"]["withdrawals"], json!(-40.0));
        assert_eq!(view["movements"][0]["note"], json!("first deposit"));
        assert_eq!(view["curve"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn invalid_movements_are_rejected() {
        let conn = test_conn();
        assert!(record_movement(&conn, None, 0.0, "").is_err());
        assert!(record_movement(&conn, None, f64::NAN, "").is_err());
        assert!(record_movement(&conn, Some("not a date"), 10.0, "").is_err());
        assert!(record_movement(&conn, None, 10.0, &"x".repeat(MAX_NOTE_CHARS + 1)).is_err());
    }

    #[test]
    fn removing_a_movement_reports_whether_it_existed() {
        let conn = test_conn();
        record_movement(&conn, None, 10.0, "").unwrap();
        assert!(remove_movement(&conn, 1).unwrap());
        assert!(!remove_movement(&conn, 1).unwrap());
    }
}
