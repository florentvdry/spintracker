//! Key/value user preferences stored in the active database.

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

use crate::Result;

/// Keys the UI may read and write; anything else is refused so the table stays a closed set.
pub const ALLOWED_KEYS: &[&str] = &[];

pub fn is_allowed(key: &str) -> bool {
    ALLOWED_KEYS.contains(&key)
}

/// The stored JSON value, `None` when the key was never saved (or holds invalid JSON).
pub fn get(conn: &Connection, key: &str) -> Result<Option<Value>> {
    let raw: Option<String> =
        conn.query_row("SELECT value FROM app_settings WHERE key = ?1", params![key], |r| r.get(0)).optional()?;
    Ok(raw.and_then(|text| serde_json::from_str(&text).ok()))
}

pub fn set(conn: &Connection, key: &str, value: &Value) -> Result<()> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value.to_string()],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);").unwrap();
        conn
    }

    #[test]
    fn a_saved_value_is_read_back_and_overwritten() {
        let conn = conn();
        assert_eq!(get(&conn, "example").unwrap(), None);
        set(&conn, "example", &json!({ "a": 1 })).unwrap();
        set(&conn, "example", &json!({ "a": 2 })).unwrap();
        assert_eq!(get(&conn, "example").unwrap(), Some(json!({ "a": 2 })));
    }

    #[test]
    fn unknown_keys_are_refused() {
        assert!(!is_allowed("anything_else"));
    }
}
