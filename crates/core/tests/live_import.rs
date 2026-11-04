//! Automatic import: a file written line by line gives the same result as a full import.

use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use rusqlite::types::ValueRef;
use rusqlite::Connection;
use spintracker_core::db::Database;
use spintracker_core::engines::analytics::AnalyticsCalculator;
use spintracker_core::services::{Importer, LiveMode};

const HISTORY: &str = "20260415_Expresso(1096047576)_real_holdem_no-limit.txt";
const SUMMARY: &str = "20260415_Expresso(1096047576)_real_holdem_no-limit_summary.txt";

fn fixture_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/exemple-data/Winamax")
}

fn importer() -> (tempfile::TempDir, Arc<Database>, Importer) {
    let dir = tempfile::tempdir().unwrap();
    let db = Arc::new(Database::open(dir.path().join("live.db")).unwrap());
    let importer = Importer::new(db.clone(), Arc::new(AnalyticsCalculator::default()));
    (dir, db, importer)
}

/// Every column of every row, minus the columns that depend on the clock.
fn dump(conn: &Connection, sql: &str) -> Vec<String> {
    let mut stmt = conn.prepare(sql).unwrap();
    let columns = stmt.column_count();
    let clock: Vec<bool> = stmt.column_names().iter().map(|c| matches!(*c, "created_at" | "updated_at")).collect();
    let rows = stmt
        .query_map([], |row| {
            let mut cells = Vec::new();
            for i in (0..columns).filter(|i| !clock[*i]) {
                cells.push(match row.get_ref(i)? {
                    ValueRef::Null => "null".to_string(),
                    ValueRef::Integer(v) => v.to_string(),
                    ValueRef::Real(v) => format!("{v:.6}"),
                    ValueRef::Text(t) => String::from_utf8_lossy(t).into_owned(),
                    ValueRef::Blob(b) => format!("blob{}", b.len()),
                });
            }
            Ok(cells.join("|"))
        })
        .unwrap();
    rows.map(|r| r.unwrap()).collect()
}

fn snapshot(db: &Database) -> Vec<Vec<String>> {
    let conn = db.conn().unwrap();
    vec![
        dump(&conn, "SELECT * FROM hands ORDER BY id"),
        dump(&conn, "SELECT * FROM player_hands ORDER BY hand_id, player_name"),
        dump(&conn, "SELECT * FROM hand_player_flags ORDER BY hand_id, player_name"),
        dump(&conn, "SELECT name, room, total_hands, total_profit, total_ev_profit, is_reg, is_reg_forced FROM players ORDER BY name"),
    ]
}

fn assert_same(actual: &[Vec<String>], expected: &[Vec<String>]) {
    for (table, (a, e)) in actual.iter().zip(expected).enumerate() {
        assert_eq!(a.len(), e.len(), "table #{table}: row count");
        for (n, (ra, re)) in a.iter().zip(e).enumerate() {
            if ra != re {
                let at = ra.chars().zip(re.chars()).position(|(x, y)| x != y).unwrap_or(0);
                let window = |s: &str| s.chars().skip(at.saturating_sub(80)).take(200).collect::<String>();
                panic!("table #{table}, row {n} differs at char {at}:
 live: {}
 full: {}", window(ra), window(re));
            }
        }
    }
}

fn full_import_snapshot() -> Vec<Vec<String>> {
    let (_dir, db, importer) = importer();
    importer.import_file(&fixture_dir().join(HISTORY), &AtomicBool::new(false), |_| {}).unwrap();
    snapshot(&db)
}

struct Folder {
    dir: tempfile::TempDir,
    history: PathBuf,
    text: String,
}

impl Folder {
    fn new(with_summary: bool) -> Self {
        let dir = tempfile::tempdir().unwrap();
        if with_summary {
            std::fs::copy(fixture_dir().join(SUMMARY), dir.path().join(SUMMARY)).unwrap();
        }
        let history = dir.path().join(HISTORY);
        let text = std::fs::read_to_string(fixture_dir().join(HISTORY)).unwrap();
        Self { dir, history, text }
    }

    /// The history file as the room has written it so far: its first `len` bytes.
    fn write_prefix(&self, len: usize) {
        let mut end = len.min(self.text.len());
        while !self.text.is_char_boundary(end) {
            end -= 1;
        }
        std::fs::write(&self.history, &self.text.as_bytes()[..end]).unwrap();
    }
}

#[test]
fn a_file_written_in_pieces_gives_the_same_result_as_a_full_import() {
    let expected = full_import_snapshot();
    let folder = Folder::new(true);
    let (_dir, db, importer) = importer();

    // Cut points land everywhere, including in the middle of a hand and of a line.
    let step = folder.text.len() / 37 + 1;
    for len in (step..folder.text.len()).step_by(step) {
        folder.write_prefix(len);
        importer.import_live(&folder.history, LiveMode::Resume).unwrap();
    }
    folder.write_prefix(folder.text.len());
    let last = importer.import_live(&folder.history, LiveMode::Resume).unwrap();
    assert!(!last.pending, "the final hand is complete once the file is fully written");

    assert_same(&snapshot(&db), &expected);
    // Handling an unchanged file again changes nothing.
    let again = importer.import_live(&folder.history, LiveMode::Resume).unwrap();
    assert_eq!(again.imported, 0);
    assert_eq!(snapshot(&db), expected);
}

#[test]
fn a_hand_still_being_written_is_kept_back() {
    let folder = Folder::new(false);
    let (_dir, db, importer) = importer();
    let second_hand = folder.text.match_indices("Winamax Poker - Tournament").nth(1).unwrap().0;

    // The first hand is complete; the second one stops in the middle.
    folder.write_prefix(second_hand + 200);
    let first = importer.import_live(&folder.history, LiveMode::Resume).unwrap();
    assert_eq!((first.imported, first.pending), (1, true));
    let hands: i64 = db.conn().unwrap().query_row("SELECT COUNT(*) FROM hands", [], |r| r.get(0)).unwrap();
    assert_eq!(hands, 1);
}

#[test]
fn a_late_summary_completes_position_and_prize_pool() {
    let folder = Folder::new(false);
    let (_dir, db, importer) = importer();
    folder.write_prefix(folder.text.len());

    importer.import_live(&folder.history, LiveMode::Resume).unwrap();
    let before: (i64, f64) = db
        .conn()
        .unwrap()
        .query_row("SELECT position, prize_pool FROM hands LIMIT 1", [], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap();
    assert_eq!(before, (0, 0.0), "no summary yet");

    std::fs::copy(fixture_dir().join(SUMMARY), folder.dir.path().join(SUMMARY)).unwrap();
    importer.import_live(&folder.history, LiveMode::Finish).unwrap();
    let conn = db.conn().unwrap();
    let after: (i64, f64, i64) = conn
        .query_row("SELECT position, prize_pool, multiplier FROM hands LIMIT 1", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .unwrap();
    assert_eq!(after, (2, 3.0, 3));
    let incomplete: i64 = conn.query_row("SELECT COUNT(*) FROM hands WHERE prize_pool = 0", [], |r| r.get(0)).unwrap();
    assert_eq!(incomplete, 0, "every hand of the tournament is completed");
    assert_eq!(snapshot(&db), full_import_snapshot());
}

#[test]
fn startup_catch_up_only_picks_files_that_changed() {
    let folder = Folder::new(true);
    let (_dir, _db, importer) = importer();
    folder.write_prefix(folder.text.len());

    assert!(importer.needs_live_import(&folder.history).unwrap(), "never handled");
    importer.import_live(&folder.history, LiveMode::Resume).unwrap();
    assert!(!importer.needs_live_import(&folder.history).unwrap(), "unchanged since the last import");

    let mut grown = folder.text.clone();
    grown.push_str("
");
    std::fs::write(&folder.history, grown).unwrap();
    assert!(importer.needs_live_import(&folder.history).unwrap(), "the file grew");
}

#[test]
fn unsupported_files_are_recorded_and_not_imported() {
    let dir = tempfile::tempdir().unwrap();
    let betclic = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/exemple-data/Betclic/21793509_ExportHH_2026-1-3.txt");
    let copy = dir.path().join("export.txt");
    std::fs::copy(betclic, &copy).unwrap();
    let (_db_dir, db, importer) = importer();

    let outcome = importer.import_live(&copy, LiveMode::Resume).unwrap();
    assert!(!outcome.supported);
    let hands: i64 = db.conn().unwrap().query_row("SELECT COUNT(*) FROM hands", [], |r| r.get(0)).unwrap();
    assert_eq!(hands, 0);
    assert!(!importer.needs_live_import(&copy).unwrap());
}

#[test]
fn a_summary_reported_by_the_watcher_finishes_its_tournament_once() {
    let folder = Folder::new(false);
    let (_dir, db, importer) = importer();
    folder.write_prefix(folder.text.len());
    importer.import_path(&folder.history, true).unwrap();

    let summary = folder.dir.path().join(SUMMARY);
    std::fs::copy(fixture_dir().join(SUMMARY), &summary).unwrap();
    assert!(importer.needs_live_import(&summary).unwrap());
    let finished = importer.import_path(&summary, true).unwrap().expect("the history file exists");
    assert!(finished.imported > 0);
    assert!(!importer.needs_live_import(&summary).unwrap(), "the summary is remembered");
    assert_eq!(snapshot(&db), full_import_snapshot());
}

#[test]
fn a_unibet_file_written_in_pieces_gives_the_same_result_as_a_full_import() {
    let unibet = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/exemple-data/Unibet");
    let history = "H20260513 T83605156 €10 Power Spin €9.30 + €0.70 No Limit Holdem.txt";
    let summary = "TS20260513 T83605156 No Limit Holdem €9.30 + €0.70.txt";

    let expected = {
        let (_dir, db, importer) = importer();
        importer.import_file(&unibet.join(history), &AtomicBool::new(false), |_| {}).unwrap();
        snapshot(&db)
    };

    let dir = tempfile::tempdir().unwrap();
    std::fs::copy(unibet.join(summary), dir.path().join(summary)).unwrap();
    let text = std::fs::read_to_string(unibet.join(history)).unwrap();
    let target = dir.path().join(history);
    let (_db_dir, db, importer) = importer();

    let step = text.len() / 9 + 1;
    for len in (step..text.len()).step_by(step) {
        let mut end = len;
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        std::fs::write(&target, &text.as_bytes()[..end]).unwrap();
        importer.import_live(&target, LiveMode::Resume).unwrap();
    }
    std::fs::write(&target, &text).unwrap();
    let last = importer.import_live(&target, LiveMode::Resume).unwrap();
    assert!(!last.pending);
    assert_same(&snapshot(&db), &expected);
}

#[test]
fn equity_is_not_computed_while_a_table_is_open_and_is_completed_afterwards() {
    let folder = Folder::new(true);
    let (_dir, db, importer) = importer();
    folder.write_prefix(folder.text.len());

    let equity_rows = |db: &Database| -> i64 {
        db.conn().unwrap().query_row("SELECT COUNT(*) FROM player_hands WHERE ev_chips IS NOT NULL", [], |r| r.get(0)).unwrap()
    };

    importer.import_live_with(&folder.history, LiveMode::Resume, false).unwrap();
    assert_eq!(equity_rows(&db), 0, "no equity while a table is open");

    // Once the tables are closed the file is imported again, with equity.
    importer.import_live_with(&folder.history, LiveMode::Finish, true).unwrap();
    assert!(equity_rows(&db) > 0, "the all-in hands of the fixture get their equity");
    assert_same(&snapshot(&db), &full_import_snapshot());
}
