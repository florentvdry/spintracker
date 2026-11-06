//! Progress of the automatic import, per hand-history file.

use rusqlite::{params, Connection, OptionalExtension};

use crate::Result;

/// What was last seen of a file and how many of its hands were handled.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ImportFileState {
    pub size: i64,
    pub mtime: i64,
    pub hands_done: usize,
}

pub fn get(conn: &Connection, path: &str) -> Result<Option<ImportFileState>> {
    Ok(conn
        .query_row("SELECT size, mtime, hands_done FROM import_files WHERE path = ?1", [path], |r| {
            Ok(ImportFileState { size: r.get(0)?, mtime: r.get(1)?, hands_done: r.get::<_, i64>(2)?.max(0) as usize })
        })
        .optional()?)
}

pub fn upsert(conn: &Connection, path: &str, state: ImportFileState) -> Result<()> {
    conn.execute(
        "INSERT INTO import_files (path, size, mtime, hands_done) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(path) DO UPDATE SET size = excluded.size, mtime = excluded.mtime, hands_done = excluded.hands_done",
        params![path, state.size, state.mtime, state.hands_done as i64],
    )?;
    Ok(())
}

/// Records whether a file still has hands imported without equity.
pub fn set_equity_pending(conn: &Connection, path: &str, pending: bool) -> Result<()> {
    conn.execute("UPDATE import_files SET equity_pending = ?2 WHERE path = ?1", params![path, pending])?;
    Ok(())
}

pub fn is_equity_pending(conn: &Connection, path: &str) -> Result<bool> {
    Ok(conn
        .query_row("SELECT equity_pending FROM import_files WHERE path = ?1", [path], |r| r.get::<_, bool>(0))
        .optional()?
        .unwrap_or(false))
}

/// The files that still have hands imported without equity.
pub fn equity_pending_paths(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT path FROM import_files WHERE equity_pending = 1 ORDER BY path")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    #[test]
    fn state_is_stored_and_updated_per_path() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(dir.path().join("a.db")).unwrap();
        let conn = db.conn().unwrap();
        assert_eq!(get(&conn, "a.txt").unwrap(), None);

        upsert(&conn, "a.txt", ImportFileState { size: 10, mtime: 5, hands_done: 2 }).unwrap();
        upsert(&conn, "a.txt", ImportFileState { size: 20, mtime: 6, hands_done: 3 }).unwrap();
        assert_eq!(get(&conn, "a.txt").unwrap(), Some(ImportFileState { size: 20, mtime: 6, hands_done: 3 }));
        assert_eq!(get(&conn, "b.txt").unwrap(), None);
    }

    #[test]
    fn equity_pending_files_are_listed_until_cleared() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(dir.path().join("a.db")).unwrap();
        let conn = db.conn().unwrap();
        upsert(&conn, "a.txt", ImportFileState { size: 1, mtime: 1, hands_done: 1 }).unwrap();
        upsert(&conn, "b.txt", ImportFileState { size: 1, mtime: 1, hands_done: 1 }).unwrap();
        set_equity_pending(&conn, "b.txt", true).unwrap();
        assert_eq!(equity_pending_paths(&conn).unwrap(), vec!["b.txt".to_string()]);
        // A later upsert of the progress does not forget the pending flag.
        upsert(&conn, "b.txt", ImportFileState { size: 2, mtime: 2, hands_done: 2 }).unwrap();
        assert!(is_equity_pending(&conn, "b.txt").unwrap());
        set_equity_pending(&conn, "b.txt", false).unwrap();
        assert!(equity_pending_paths(&conn).unwrap().is_empty());
    }
}
