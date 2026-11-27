//! Hands marked to review: marking, unmarking and the list the review will work from.

use chrono::Local;
use rusqlite::Connection;
use serde_json::Value;

use crate::error::Error;
use crate::repos::marked_hands as repo;
use crate::Result;

const MAX_HAND_ID_CHARS: usize = 64;

fn checked(hand_id: &str) -> Result<&str> {
    let id = hand_id.trim();
    if id.is_empty() || id.chars().count() > MAX_HAND_ID_CHARS {
        return Err(Error::Message("a hand id is required and at most 64 characters".into()));
    }
    Ok(id)
}

pub fn mark(conn: &Connection, hand_id: &str) -> Result<()> {
    let id = checked(hand_id)?;
    repo::mark(conn, id, &Local::now().naive_local().format("%Y-%m-%d %H:%M:%S").to_string())
}

pub fn unmark(conn: &Connection, hand_id: &str) -> Result<()> {
    repo::unmark(conn, checked(hand_id)?)
}

pub fn list(conn: &Connection) -> Result<Vec<Value>> {
    repo::list(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;

    #[test]
    fn marking_twice_keeps_one_mark_and_unmarking_removes_it() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations::run(&mut conn).unwrap();
        mark(&conn, "h1").unwrap();
        mark(&conn, "h1").unwrap();
        assert_eq!(list(&conn).unwrap().len(), 1);
        unmark(&conn, "h1").unwrap();
        assert!(list(&conn).unwrap().is_empty());
    }

    #[test]
    fn an_empty_or_too_long_id_is_refused() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations::run(&mut conn).unwrap();
        assert!(mark(&conn, "  ").is_err());
        assert!(mark(&conn, &"x".repeat(MAX_HAND_ID_CHARS + 1)).is_err());
    }
}
