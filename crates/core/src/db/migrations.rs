//! Schema migrations.
//!
//! They mirror the FluentMigrator ones (C# backend) with the same version numbers and the
//! same `VersionInfo` table, so a database created by the former backend is recognised as
//! already migrated and both backends can share it.

use rusqlite::{params, Connection};

use crate::Result;

struct Migration {
    version: i64,
    description: &'static str,
    sql: &'static str,
}

macro_rules! migration {
    ($version:expr, $description:expr, $file:expr) => {
        Migration {
            version: $version,
            description: $description,
            sql: include_str!(concat!("sql/", $file)),
        }
    };
}

const MIGRATIONS: &[Migration] = &[
    migration!(20260111001, "InitialCreate20260111", "20260111001_initial_create.sql"),
    migration!(20260116001, "DropConfigTable20260116", "20260116001_drop_config_table.sql"),
    migration!(20260312001, "AddPerformanceIndexes", "20260312001_add_performance_indexes.sql"),
    migration!(20260313001, "AddPlayerRegColumns", "20260313001_add_player_reg_columns.sql"),
    migration!(202603151932, "AddHandPosition", "202603151932_add_hand_position.sql"),
    migration!(202604040001, "AddStructuredActionsAndNewColumns", "202604040001_add_structured_actions.sql"),
    migration!(202605160001, "AddPlayerRoomColumn", "202605160001_add_player_room_column.sql"),
    migration!(202605200001, "AddAliasesTable", "202605200001_add_aliases_table.sql"),
    migration!(20260525001, "OptimizeIndexes", "20260525001_optimize_indexes.sql"),
    migration!(202611030001, "AddHandPlayerFlags", "202611030001_add_hand_player_flags.sql"),
    migration!(202611040001, "AddStreetCounts", "202611040001_add_street_counts.sql"),
    migration!(202611050001, "AddImportFiles", "202611050001_add_import_files.sql"),
    migration!(202611060001, "AddPlayerNotes", "202611060001_add_player_notes.sql"),
];

/// Applies the missing migrations in numeric version order (like FluentMigrator).
/// Returns the number of migrations applied.
pub fn run(conn: &mut Connection) -> Result<usize> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS VersionInfo (
             Version INTEGER NOT NULL,
             AppliedOn DATETIME,
             Description TEXT
         );
         CREATE UNIQUE INDEX IF NOT EXISTS UC_Version ON VersionInfo (Version ASC);",
    )?;

    let applied: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT Version FROM VersionInfo")?;
        let rows = stmt.query_map([], |r| r.get(0))?;
        rows.collect::<std::result::Result<_, _>>()?
    };

    let mut pending: Vec<&Migration> = MIGRATIONS
        .iter()
        .filter(|m| !applied.contains(&m.version))
        .collect();
    pending.sort_by_key(|m| m.version);

    for m in &pending {
        let tx = conn.transaction()?;
        tx.execute_batch(m.sql)?;
        tx.execute(
            "INSERT INTO VersionInfo (Version, AppliedOn, Description) VALUES (?1, datetime('now'), ?2)",
            params![m.version, m.description],
        )?;
        tx.commit()?;
        log::info!("migration {} ({}) applied", m.version, m.description);
    }
    Ok(pending.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn columns(conn: &Connection, table: &str) -> Vec<String> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})")).unwrap();
        stmt.query_map([], |r| r.get::<_, String>(1))
            .unwrap()
            .map(|c| c.unwrap())
            .collect()
    }

    fn names(conn: &Connection, kind: &str) -> Vec<String> {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = ?1")
            .unwrap();
        stmt.query_map([kind], |r| r.get::<_, String>(0))
            .unwrap()
            .map(|c| c.unwrap())
            .collect()
    }

    #[test]
    fn fresh_database_gets_final_schema() {
        let mut conn = Connection::open_in_memory().unwrap();
        assert_eq!(run(&mut conn).unwrap(), MIGRATIONS.len());

        let t = names(&conn, "table");
        for expected in ["hands", "player_hands", "players", "aliases", "VersionInfo", "hand_player_flags", "import_files", "player_notes"] {
            assert!(t.iter().any(|n| n == expected), "table {expected} missing");
        }
        assert!(!t.iter().any(|n| n == "config"), "config must be dropped");

        let hands = columns(&conn, "hands");
        for c in ["position", "structured_actions", "rake_per_player", "tournament_id", "button_seat"] {
            assert!(hands.iter().any(|n| n == c), "hands.{c} missing");
        }
        let players = columns(&conn, "players");
        for c in ["is_reg", "is_reg_forced", "room", "alias_id"] {
            assert!(players.iter().any(|n| n == c), "players.{c} missing");
        }
        let ph = columns(&conn, "player_hands");
        for c in ["ev_chips", "cev_contribution", "equity_river"] {
            assert!(ph.iter().any(|n| n == c), "player_hands.{c} missing");
        }
    }

    #[test]
    fn indexes_match_optimized_set() {
        let mut conn = Connection::open_in_memory().unwrap();
        run(&mut conn).unwrap();
        let idx = names(&conn, "index");
        assert!(idx.contains(&"idx_player_hands_name_hand_id".to_string()));
        assert!(idx.contains(&"idx_hands_date_player_count".to_string()));
        assert!(!idx.contains(&"idx_hands_date_time".to_string()));
        assert!(!idx.contains(&"idx_player_hands_player_name".to_string()));
    }

    #[test]
    fn rerun_is_a_noop() {
        let mut conn = Connection::open_in_memory().unwrap();
        run(&mut conn).unwrap();
        assert_eq!(run(&mut conn).unwrap(), 0);
    }

    #[test]
    fn legacy_database_is_recognised_and_upgraded() {
        // Database created by the former backend: only the first 5 migrations applied
        // (in FluentMigrator numeric order, 20260525001 comes before 202603151932).
        let mut conn = Connection::open_in_memory().unwrap();
        run(&mut conn).unwrap();
        conn.execute_batch(
            "DELETE FROM VersionInfo WHERE Version >= 202603151932;
             DROP TABLE aliases;
             DROP TABLE hand_player_flags;
             DROP TABLE import_files;
             DROP TABLE player_notes;
             ALTER TABLE players DROP COLUMN alias_id;
             ALTER TABLE players DROP COLUMN room;
             ALTER TABLE hands DROP COLUMN position;
             ALTER TABLE hands DROP COLUMN structured_actions;
             ALTER TABLE hands DROP COLUMN limit_type;
             ALTER TABLE hands DROP COLUMN game_variant;
             ALTER TABLE hands DROP COLUMN currency;
             ALTER TABLE hands DROP COLUMN button_seat;
             ALTER TABLE hands DROP COLUMN ante;
             ALTER TABLE hands DROP COLUMN tournament_id;
             ALTER TABLE hands DROP COLUMN tournament_name;
             ALTER TABLE hands DROP COLUMN tournament_level;
             ALTER TABLE hands DROP COLUMN buyin_currency;
             ALTER TABLE hands DROP COLUMN rake_per_player;
             INSERT INTO hands (id, room) VALUES ('h1', 'Winamax');
             INSERT INTO players (name) VALUES ('hero');
             INSERT INTO player_hands (hand_id, player_name) VALUES ('h1', 'hero');",
        )
        .unwrap();

        assert_eq!(run(&mut conn).unwrap(), 8);
        // Existing data survives and the `room` backfill runs.
        let room: Option<String> = conn
            .query_row("SELECT room FROM players WHERE name = 'hero'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(room.as_deref(), Some("Winamax"));
    }

    #[test]
    fn versions_are_unique() {
        let mut v: Vec<i64> = MIGRATIONS.iter().map(|m| m.version).collect();
        v.sort();
        v.dedup();
        assert_eq!(v.len(), MIGRATIONS.len());
    }
}
