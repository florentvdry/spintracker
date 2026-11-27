//! Single-file backups of the database: written by SQLite itself (`VACUUM INTO`), then checked
//! before anyone relies on them. Restoring is not here: it must happen with the database closed.

use std::path::Path;

use rusqlite::{Connection, OpenFlags};

use crate::error::Error;
use crate::Result;

/// The extension a backup file must have, so a backup cannot overwrite another kind of file.
pub const BACKUP_EXTENSION: &str = "db";
/// Tables every database of the app has. A file without them is not a SpinTracker database.
const REQUIRED_TABLES: [&str; 3] = ["hands", "player_hands", "players"];

/// Writes a copy of the database to `dest`, a new absolute path ending in `.db`.
pub fn write_backup(conn: &Connection, dest: &Path) -> Result<()> {
    if !dest.is_absolute() {
        return Err(Error::Message("the backup path must be absolute".into()));
    }
    if dest.extension().and_then(|e| e.to_str()) != Some(BACKUP_EXTENSION) {
        return Err(Error::Message(format!("the backup file must end with .{BACKUP_EXTENSION}")));
    }
    if dest.exists() {
        return Err(Error::Message("the backup file already exists".into()));
    }
    let text = dest.to_str().ok_or_else(|| Error::Message("the backup path is not valid text".into()))?;
    conn.execute("VACUUM INTO ?1", [text])?;
    Ok(())
}

/// What checking a backup found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackupCheck {
    pub integrity_ok: bool,
    pub schema_version: i64,
    pub tables_present: bool,
}

/// Opens a backup read-only and checks its integrity, its schema version and its main tables.
pub fn verify_backup(path: &Path) -> Result<BackupCheck> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let integrity: String = conn.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    let schema_version: i64 = match conn.query_row("SELECT COALESCE(MAX(Version), 0) FROM VersionInfo", [], |r| r.get(0)) {
        Ok(version) => version,
        // A file without the version table is not an app database; it fails the check below.
        Err(_) => 0,
    };
    let mut tables_present = true;
    for table in REQUIRED_TABLES {
        let found: i64 = conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1", [table], |r| r.get(0))?;
        tables_present &= found == 1;
    }
    Ok(BackupCheck { integrity_ok: integrity == "ok", schema_version, tables_present })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;

    fn migrated_file(dir: &Path) -> Connection {
        let mut conn = Connection::open(dir.join("source.db")).unwrap();
        migrations::run(&mut conn).unwrap();
        conn
    }

    #[test]
    fn a_backup_is_a_checked_copy_of_the_database() {
        let dir = tempfile::tempdir().unwrap();
        let source = migrated_file(dir.path());
        let dest = dir.path().join("copy.db");
        write_backup(&source, &dest).unwrap();

        let check = verify_backup(&dest).unwrap();
        assert!(check.integrity_ok);
        assert!(check.tables_present);
        assert!(check.schema_version > 0);
    }

    #[test]
    fn refuses_a_relative_path_a_wrong_extension_or_an_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let source = migrated_file(dir.path());
        assert!(write_backup(&source, Path::new("relative.db")).is_err());
        assert!(write_backup(&source, &dir.path().join("copy.txt")).is_err());
        let existing = dir.path().join("exists.db");
        std::fs::write(&existing, b"x").unwrap();
        assert!(write_backup(&source, &existing).is_err());
    }

    #[test]
    fn a_file_that_is_not_a_database_fails_the_check() {
        let dir = tempfile::tempdir().unwrap();
        let junk = dir.path().join("junk.db");
        std::fs::write(&junk, b"not sqlite at all, just text").unwrap();
        assert!(verify_backup(&junk).is_err());
    }
}
