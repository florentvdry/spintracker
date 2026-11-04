//! SQLite connection pool that can be swapped at runtime (switching database needs no restart).

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use arc_swap::ArcSwapOption;
use r2d2::{Pool, PooledConnection};
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;

use super::migrations;
use crate::{Error, Result};

pub type Conn = PooledConnection<SqliteConnectionManager>;

struct Active {
    path: PathBuf,
    pool: Pool<SqliteConnectionManager>,
}

/// Active database. `switch_to` migrates the schema then swaps the pool atomically:
/// later calls to `conn` use the new database.
#[derive(Default)]
pub struct Database {
    active: ArcSwapOption<Active>,
    /// Changes whenever the stored hands, players or aliases do; caches built on the data compare it.
    data_version: AtomicU64,
}

impl Database {
    pub fn new() -> Self {
        Self::default()
    }

    /// Opens `path` and installs it as the active database (shortcut for `new` + `switch_to`).
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let db = Self::new();
        db.switch_to(path)?;
        Ok(db)
    }

    /// Opens (and migrates) `path`, then installs it as the active database.
    pub fn switch_to(&self, path: impl AsRef<Path>) -> Result<()> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // WAL is persisted in the file; migrations run on a dedicated connection.
        let mut conn = Connection::open(&path)?;
        conn.execute_batch("PRAGMA journal_mode = WAL;")?;
        migrations::run(&mut conn)?;
        drop(conn);

        // No `foreign_keys = ON`: the C# backend only enabled it on a throwaway connection,
        // so never on the ones that write. Enabling it here would break
        // `INSERT OR REPLACE INTO hands` when `player_hands` rows reference the hand.
        let manager = SqliteConnectionManager::file(&path).with_init(|c| {
            c.execute_batch("PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY; PRAGMA busy_timeout = 5000;")
        });
        let pool = Pool::builder().max_size(8).build(manager)?;
        self.active.store(Some(Arc::new(Active { path, pool })));
        self.bump_data_version();
        Ok(())
    }

    pub fn data_version(&self) -> u64 {
        self.data_version.load(Ordering::Acquire)
    }

    /// To be called after every write that changes what the statistics are computed from.
    pub fn bump_data_version(&self) {
        self.data_version.fetch_add(1, Ordering::AcqRel);
    }

    pub fn path(&self) -> Option<PathBuf> {
        self.active.load_full().map(|a| a.path.clone())
    }

    /// Borrows a connection from the active database.
    pub fn conn(&self) -> Result<Conn> {
        let active = self
            .active
            .load_full()
            .ok_or_else(|| Error::Message("no active database".into()))?;
        Ok(active.pool.get()?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_creates_file_migrates_and_uses_wal() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(dir.path().join("nested").join("a.db")).unwrap();
        let conn = db.conn().unwrap();
        let mode: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap();
        assert_eq!(mode, "wal");
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM VersionInfo", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 15);
    }

    #[test]
    fn switching_swaps_database_without_restart() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.db");
        let b = dir.path().join("b.db");
        let db = Database::open(&a).unwrap();
        db.conn().unwrap().execute("INSERT INTO players (name) VALUES ('only_in_a')", []).unwrap();

        db.switch_to(&b).unwrap();
        assert_eq!(db.path().unwrap(), b);
        let count: i64 = db.conn().unwrap().query_row("SELECT COUNT(*) FROM players", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 0);

        db.switch_to(&a).unwrap();
        let count: i64 = db.conn().unwrap().query_row("SELECT COUNT(*) FROM players", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
    }

    /// Opens a copy of a real database created by the former backend.
    /// `SPINTRACKER_TEST_DB=<fichier.db> cargo test -p spintracker-core -- --ignored`
    #[test]
    #[ignore]
    fn opens_a_real_legacy_database_copy() {
        let src = std::env::var("SPINTRACKER_TEST_DB").expect("SPINTRACKER_TEST_DB is not set");
        let dir = tempfile::tempdir().unwrap();
        let copy = dir.path().join("copy.db");
        std::fs::copy(&src, &copy).unwrap();
        let db = Database::open(&copy).unwrap();
        let hands: i64 = db.conn().unwrap().query_row("SELECT COUNT(*) FROM hands", [], |r| r.get(0)).unwrap();
        println!("{hands} hands in the copy");
    }

    #[test]
    fn conn_without_active_database_errors() {
        assert!(Database::new().conn().is_err());
    }

    #[test]
    fn insert_or_replace_hand_with_children_is_allowed() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(dir.path().join("a.db")).unwrap();
        let c = db.conn().unwrap();
        c.execute("INSERT INTO hands (id) VALUES ('h')", []).unwrap();
        c.execute("INSERT INTO player_hands (hand_id, player_name) VALUES ('h','p')", []).unwrap();
        c.execute("INSERT OR REPLACE INTO hands (id, room) VALUES ('h','Betclic')", []).unwrap();
    }
}
