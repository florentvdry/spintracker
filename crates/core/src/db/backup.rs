//! Backup and restore of a database as one file.
//!
//! A backup is a consistent copy made by SQLite itself (`VACUUM INTO`), so it is safe while the
//! application runs and holds no WAL side file. A restore never overwrites anything: the file is
//! checked, then registered as a NEW database next to the others, and the user switches to it.

use std::path::Path;

use rusqlite::{Connection, OpenFlags};
use serde::Serialize;

use super::migrations;
use super::registry::{DatabaseInfo, DatabaseRegistry};
use crate::{Error, Result};

/// What a backup file holds, read without touching the application's databases.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub hands: i64,
    pub players: i64,
    /// Highest migration the file went through.
    pub schema_version: i64,
}

/// Writes a consistent copy of the database `conn` is open on to `dest`, replacing a file already
/// there, and checks the copy. Returns what the copy holds.
pub fn create_backup(conn: &Connection, dest: &Path) -> Result<BackupInfo> {
    if dest.exists() {
        std::fs::remove_file(dest)?;
    }
    let target = dest.to_str().ok_or_else(|| Error::Message("the backup path is not valid text".into()))?;
    conn.execute("VACUUM INTO ?1", [target])?;
    // A copy that cannot be read back is worth nothing: say so now rather than at the restore.
    verify(dest)
}

/// Checks that `path` is an intact SpinTracker database this version can read.
pub fn verify(path: &Path) -> Result<BackupInfo> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| Error::Message(format!("this file is not a database: {e}")))?;
    let integrity: Vec<String> = conn
        .prepare("PRAGMA integrity_check")
        .and_then(|mut stmt| stmt.query_map([], |r| r.get(0))?.collect::<std::result::Result<_, _>>())
        .map_err(|e| Error::Message(format!("this file is not a database: {e}")))?;
    if integrity != ["ok"] {
        return Err(Error::Message(format!("the database is damaged: {}", integrity.first().cloned().unwrap_or_default())));
    }
    let has_table = |name: &str| -> bool { conn.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)", [name], |r| r.get(0)).unwrap_or(false) };
    if !has_table("hands") || !has_table("player_hands") || !has_table("VersionInfo") {
        return Err(Error::Message("this file is not a SpinTracker database".into()));
    }
    let schema_version: i64 = conn.query_row("SELECT COALESCE(MAX(Version), 0) FROM VersionInfo", [], |r| r.get(0))?;
    if schema_version > migrations::latest_version() {
        return Err(Error::Message("this backup comes from a newer version of SpinTracker: update the application first".into()));
    }
    Ok(BackupInfo {
        hands: conn.query_row("SELECT COUNT(*) FROM hands", [], |r| r.get(0))?,
        players: conn.query_row("SELECT COUNT(*) FROM players", [], |r| r.get(0)).unwrap_or(0),
        schema_version,
    })
}

/// Checks `source` and registers a copy of it as a new database called `name`. The copy is brought
/// up to date the first time it is opened.
pub fn restore_as_new(registry: &DatabaseRegistry, source: &Path, name: &str) -> Result<(DatabaseInfo, BackupInfo)> {
    let info = verify(source)?;
    let database = registry.adopt(name, source)?;
    Ok((database, info))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn database_with_a_hand(dir: &Path, name: &str) -> Database {
        let db = Database::open(dir.join(name)).unwrap();
        let conn = db.conn().unwrap();
        conn.execute("INSERT INTO hands (id, room, game_id) VALUES ('h1', 'Winamax', 'g1')", []).unwrap();
        conn.execute("INSERT INTO player_hands (hand_id, player_name) VALUES ('h1', 'Hero')", []).unwrap();
        drop(conn);
        db
    }

    #[test]
    fn a_backup_holds_the_data_and_can_be_checked() {
        let dir = tempfile::tempdir().unwrap();
        let db = database_with_a_hand(dir.path(), "a.db");
        let backup = dir.path().join("backup.db");
        let info = create_backup(&db.conn().unwrap(), &backup).unwrap();
        assert_eq!(info.hands, 1);
        assert_eq!(info.schema_version, migrations::latest_version());
        assert_eq!(verify(&backup).unwrap(), info);
        // A second backup to the same path replaces the first.
        create_backup(&db.conn().unwrap(), &backup).unwrap();
    }

    #[test]
    fn a_restore_adds_a_database_and_leaves_the_others_alone() {
        let dir = tempfile::tempdir().unwrap();
        let db = database_with_a_hand(dir.path(), "a.db");
        let backup = dir.path().join("backup.db");
        create_backup(&db.conn().unwrap(), &backup).unwrap();

        let app_dir = tempfile::tempdir().unwrap();
        let registry = DatabaseRegistry::load(app_dir.path(), None).unwrap();
        let before = registry.get_all().len();
        let (restored, info) = restore_as_new(&registry, &backup, "Restored").unwrap();
        assert_eq!(registry.get_all().len(), before + 1);
        assert!(!restored.is_active, "the restore never switches databases by itself");
        assert_eq!(info.hands, 1);
        // The registered copy opens and holds the hand.
        let reopened = Database::open(&restored.file_path).unwrap();
        let hands: i64 = reopened.conn().unwrap().query_row("SELECT COUNT(*) FROM hands", [], |r| r.get(0)).unwrap();
        assert_eq!(hands, 1);
        assert_ne!(Path::new(&restored.file_path), backup.as_path(), "a copy, not the file itself");
    }

    #[test]
    fn damaged_foreign_and_newer_files_are_refused() {
        let dir = tempfile::tempdir().unwrap();
        let junk = dir.path().join("junk.db");
        std::fs::write(&junk, b"this is not a database at all, just text").unwrap();
        assert!(verify(&junk).is_err());

        let foreign = dir.path().join("foreign.db");
        Connection::open(&foreign).unwrap().execute_batch("CREATE TABLE notes (id INTEGER);").unwrap();
        assert!(verify(&foreign).unwrap_err().to_string().contains("not a SpinTracker database"));

        let db = database_with_a_hand(dir.path(), "new.db");
        let conn = db.conn().unwrap();
        conn.execute("INSERT INTO VersionInfo (Version, AppliedOn, Description) VALUES (?1, datetime('now'), 'future')", [migrations::latest_version() + 1]).unwrap();
        drop(conn);
        let newer = dir.path().join("newer.db");
        // `VACUUM INTO` keeps the version table, so the copy carries the future version.
        db.conn().unwrap().execute("VACUUM INTO ?1", [newer.to_str().unwrap()]).unwrap();
        assert!(verify(&newer).unwrap_err().to_string().contains("newer version"));
        assert!(verify(&dir.path().join("missing.db")).is_err());
    }
}
