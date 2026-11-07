//! End-to-end import of the sample hand histories into a real database.

use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use spintracker_core::db::Database;
use spintracker_core::engines::analytics::AnalyticsCalculator;
use spintracker_core::models::ImportProgress;
use spintracker_core::services::Importer;
use spintracker_core::stats::flags::Flag;
use spintracker_core::stats::store;

struct Fixture {
    _dir: tempfile::TempDir,
    db: Arc<Database>,
    importer: Importer,
}

fn fixture() -> Fixture {
    let dir = tempfile::tempdir().unwrap();
    let db = Arc::new(Database::open(dir.path().join("import.db")).unwrap());
    let importer = Importer::new(db.clone(), Arc::new(AnalyticsCalculator::default()));
    Fixture { _dir: dir, db, importer }
}

fn sample(room: &str, file: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/exemple-data").join(room).join(file)
}

fn count(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |r| r.get(0)).unwrap()
}

fn run(f: &Fixture, path: &Path) -> (spintracker_core::services::ImportSummary, Vec<ImportProgress>) {
    let events = Mutex::new(Vec::new());
    let summary = f.importer.import_file(path, &AtomicBool::new(false), |p| events.lock().unwrap().push(p)).unwrap();
    (summary, events.into_inner().unwrap())
}

#[test]
fn winamax_import_applies_summaries_and_is_idempotent() {
    let f = fixture();
    let file = sample("Winamax", "20260415_Expresso(1096047576)_real_holdem_no-limit.txt");

    let (summary, events) = run(&f, &file);
    assert_eq!((summary.imported, summary.skipped), (summary.total_found, 0));
    assert!(summary.imported > 5);

    let last = events.last().unwrap();
    assert!(last.success && last.percent == 100 && last.hands_imported == summary.imported, "{last:?}");
    assert_eq!(events.first().unwrap().message, "Initializing pipeline...");

    let conn = f.db.conn().unwrap();
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM hands") as usize, summary.imported);
    assert_eq!(
        count(&conn, "SELECT COUNT(*) FROM hand_player_flags"),
        count(&conn, "SELECT COUNT(*) FROM player_hands"),
        "one flag row per stored player"
    );
    assert!(count(&conn, "SELECT COUNT(*) FROM players") >= 3);

    // The summary file next to the history supplies position, prize pool and the multiplier.
    let (position, prize_pool, buy_in, multiplier): (i64, f64, f64, i64) = conn
        .query_row("SELECT position, prize_pool, buy_in, multiplier FROM hands LIMIT 1", [], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
        })
        .unwrap();
    assert_eq!((position, prize_pool, buy_in, multiplier), (2, 3.0, 1.0, 3));

    // Importing again replaces the rows: nothing is duplicated.
    drop(conn);
    let (again, _) = run(&f, &file);
    assert_eq!(again.imported, summary.imported);
    let conn = f.db.conn().unwrap();
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM hands") as usize, summary.imported);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM player_hands"), count(&conn, "SELECT COUNT(*) FROM hand_player_flags"));
}

#[test]
fn betclic_import_reproduces_the_expected_totals() {
    let f = fixture();
    for name in ["21793509_ExportHH_2026-1-2.txt", "21793509_ExportHH_2026-1-3.txt"] {
        let path = sample("Betclic", name);
        assert_eq!(f.importer.count_hands(&path).unwrap() > 0, true);
        run(&f, &path);
    }
    let conn = f.db.conn().unwrap();
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM hands"), 4416, "expected hand count");
    assert_eq!(count(&conn, "SELECT COUNT(DISTINCT game_id) FROM hands"), 300, "expected tournaments");

    let (won, net_expected): (f64, f64) = conn
        .query_row(
            "SELECT SUM(net_profit), SUM(net_won_adjusted) FROM player_hands WHERE player_name = 'jmenfouu'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(won.round() as i64, 28500, "chips won");
    assert!((net_expected.round() - 25786.0).abs() <= 2.0, "net expected chips won {net_expected}");

    let (hands, profit): (i64, f64) = conn
        .query_row("SELECT total_hands, total_profit FROM players WHERE name = 'jmenfouu'", [], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap();
    assert_eq!(hands, 4416);
    assert_eq!(profit.round() as i64, 28500);

    // The hero's flags are queryable: 4416 hands, a plausible VPIP.
    let vpip: i64 = count(
        &conn,
        &format!(
            "SELECT COUNT(*) FROM hand_player_flags WHERE player_name = 'jmenfouu' AND ({}) != 0",
            spintracker_core::stats::registry::flag_condition("hand_player_flags", Flag::Vpip)
        ),
    );
    assert!((1000..4416).contains(&vpip), "vpip hands {vpip}");
}

#[test]
fn unibet_import_detects_the_hero_and_reads_summaries() {
    let f = fixture();
    let file = sample("Unibet", "H20260512 T83498893 €10 Power Spin €9.30 + €0.70 No Limit Holdem.txt");
    let (summary, _) = run(&f, &file);
    assert!(summary.imported > 0);

    let conn = f.db.conn().unwrap();
    let (position, prize_pool, buy_in, multiplier): (i64, f64, f64, i64) = conn
        .query_row("SELECT position, prize_pool, buy_in, multiplier FROM hands LIMIT 1", [], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
        })
        .unwrap();
    assert_eq!((position, prize_pool, multiplier), (3, 30.0, 3));
    assert!((buy_in - 10.0).abs() < 1e-9, "the entry cost includes the fee");

    // The file's most frequently dealt player is the hero: every hand has hero analytics.
    let hero = "AA2Spew2Brok[Unibet_b3081becc3e7563f]";
    let hero_rows = count(&conn, &format!("SELECT COUNT(*) FROM player_hands WHERE player_name = '{hero}'"));
    assert_eq!(hero_rows as usize, summary.imported);
}

#[test]
fn counting_hands_and_unknown_files() {
    let f = fixture();
    let betclic = sample("Betclic", "21793509_ExportHH_2026-1-2.txt");
    let parsed = {
        use spintracker_core::parsers::{BetclicParser, HandParser};
        BetclicParser.parse_file(&String::from_utf8_lossy(&std::fs::read(&betclic).unwrap())).hands.len()
    };
    assert_eq!(f.importer.count_hands(&betclic).unwrap(), parsed);
    assert_eq!(f.importer.count_hands(Path::new("does-not-exist.txt")).unwrap(), 0);

    let junk = f._dir.path().join("junk.txt");
    std::fs::write(&junk, "this is not a hand history").unwrap();
    assert_eq!(f.importer.count_hands(&junk).unwrap(), 0);
    let err = f.importer.import_file(&junk, &AtomicBool::new(false), |_| {}).unwrap_err();
    assert!(err.to_string().contains("Could not detect hand history format"));
    assert!(f.importer.import_file(Path::new("does-not-exist.txt"), &AtomicBool::new(false), |_| {}).is_err());
}

#[test]
fn a_cancelled_import_writes_nothing_and_reports_it() {
    let f = fixture();
    let cancel = AtomicBool::new(true);
    let mut last = None;
    let summary = f
        .importer
        .import_file(&sample("Betclic", "21793509_ExportHH_2026-1-2.txt"), &cancel, |p| last = Some(p))
        .unwrap();
    assert!(summary.cancelled);
    assert_eq!(summary.imported, 0);
    assert_eq!(last.unwrap().message, "Import cancelled");
    assert_eq!(count(&f.db.conn().unwrap(), "SELECT COUNT(*) FROM hands"), 0);
}

#[test]
fn stale_winamax_rows_are_removed_before_an_import() {
    let f = fixture();
    {
        let conn = f.db.conn().unwrap();
        conn.execute("INSERT INTO hands (id, room, hand_id, date_time) VALUES ('stale', 'Winamax', '', '')", []).unwrap();
        conn.execute("INSERT INTO player_hands (hand_id, player_name) VALUES ('stale', 'ghost')", []).unwrap();
        store::backfill(&mut f.db.conn().unwrap(), |_, _| {}).unwrap();
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM hand_player_flags WHERE hand_id = 'stale'"), 1);
    }
    run(&f, &sample("Winamax", "20260415_Expresso(1096047576)_real_holdem_no-limit.txt"));
    let conn = f.db.conn().unwrap();
    for table in ["hands", "player_hands", "hand_player_flags"] {
        let column = if table == "hands" { "id" } else { "hand_id" };
        assert_eq!(count(&conn, &format!("SELECT COUNT(*) FROM {table} WHERE {column} = 'stale'")), 0, "{table}");
    }
}

#[test]
fn betclic_export_without_dashed_dividers_is_split_into_hands() {
    let f = fixture();
    let original = sample("Betclic", "21793509_ExportHH_2026-1-2.txt");
    let text = std::fs::read_to_string(&original).unwrap();
    assert!(text.lines().any(|l| l.starts_with("------------")), "the sample uses the dashed layout");

    // The current HandsExport layout: hands follow each other with no dashed line.
    let stripped: String = text.lines().filter(|l| !l.starts_with("------------")).map(|l| format!("{l}\n")).collect();
    let path = f._dir.path().join("Betclic_HandsExport_test.txt");
    std::fs::write(&path, stripped).unwrap();

    let expected = f.importer.count_hands(&original).unwrap();
    assert!(expected > 1);
    assert_eq!(f.importer.count_hands(&path).unwrap(), expected);
    let (summary, _) = run(&f, &path);
    assert_eq!(summary.imported, expected);
}
