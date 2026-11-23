//! Deposits and withdrawals of the bankroll.

use chrono::NaiveDate;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::Result;

const MAX_NOTE_CHARS: usize = 200;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub id: i64,
    /// `YYYY-MM-DD`.
    pub occurred_on: String,
    /// Positive for a deposit, negative for a withdrawal.
    pub amount: f64,
    pub note: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NewTransaction {
    pub occurred_on: String,
    pub amount: f64,
    pub note: String,
}

/// Why a transaction was refused; shown to the user as is.
#[derive(Debug, PartialEq)]
pub enum Invalid {
    Date,
    Amount,
}

impl NewTransaction {
    pub fn validate(&self) -> std::result::Result<(), Invalid> {
        if NaiveDate::parse_from_str(&self.occurred_on, "%Y-%m-%d").is_err() {
            return Err(Invalid::Date);
        }
        if !self.amount.is_finite() || self.amount == 0.0 {
            return Err(Invalid::Amount);
        }
        Ok(())
    }
}

pub fn list(conn: &Connection) -> Result<Vec<Transaction>> {
    let mut stmt = conn.prepare("SELECT id, occurred_on, amount, note FROM bankroll_transactions ORDER BY occurred_on, id")?;
    let rows = stmt
        .query_map([], |r| Ok(Transaction { id: r.get(0)?, occurred_on: r.get(1)?, amount: r.get(2)?, note: r.get(3)? }))?
        .collect::<std::result::Result<_, _>>()?;
    Ok(rows)
}

pub fn add(conn: &Connection, new: &NewTransaction) -> Result<i64> {
    let note: String = new.note.chars().take(MAX_NOTE_CHARS).collect();
    conn.execute(
        "INSERT INTO bankroll_transactions (occurred_on, amount, note) VALUES (?1, ?2, ?3)",
        params![new.occurred_on, new.amount, note],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn delete(conn: &Connection, id: i64) -> Result<bool> {
    Ok(conn.execute("DELETE FROM bankroll_transactions WHERE id = ?1", params![id])? > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../db/sql/202611230002_add_bankroll_transactions.sql")).unwrap();
        conn
    }

    fn tx(date: &str, amount: f64) -> NewTransaction {
        NewTransaction { occurred_on: date.into(), amount, note: String::new() }
    }

    #[test]
    fn transactions_are_listed_by_date_and_can_be_deleted() {
        let conn = conn();
        add(&conn, &tx("2026-03-01", 100.0)).unwrap();
        let withdrawal = add(&conn, &tx("2026-02-01", -20.0)).unwrap();
        let listed = list(&conn).unwrap();
        assert_eq!(listed.iter().map(|t| t.amount).collect::<Vec<_>>(), vec![-20.0, 100.0]);
        assert!(delete(&conn, withdrawal).unwrap());
        assert!(!delete(&conn, withdrawal).unwrap());
        assert_eq!(list(&conn).unwrap().len(), 1);
    }

    #[test]
    fn invalid_transactions_are_refused() {
        assert_eq!(tx("not a date", 10.0).validate(), Err(Invalid::Date));
        assert_eq!(tx("2026-03-01", 0.0).validate(), Err(Invalid::Amount));
        assert_eq!(tx("2026-03-01", f64::NAN).validate(), Err(Invalid::Amount));
        assert_eq!(tx("2026-03-01", 5.0).validate(), Ok(()));
    }

    #[test]
    fn a_long_note_is_cut() {
        let conn = conn();
        let id = add(&conn, &NewTransaction { note: "x".repeat(500), ..tx("2026-03-01", 1.0) }).unwrap();
        assert_eq!(list(&conn).unwrap().iter().find(|t| t.id == id).unwrap().note.chars().count(), MAX_NOTE_CHARS);
    }
}
