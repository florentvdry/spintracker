//! Opening a database created by the former C# backend (opt-in: needs a copy of one).
//!
//! `SPINTRACKER_LEGACY_DB=<poker_tracker.db> cargo test -p spintracker-core --test legacy_upgrade -- --ignored --nocapture`

use std::path::Path;

use spintracker_core::api::Backend;

#[test]
#[ignore]
fn a_database_of_the_former_backend_is_upgraded_and_answers() {
    let source = std::env::var("SPINTRACKER_LEGACY_DB").expect("SPINTRACKER_LEGACY_DB is not set");
    let dir = tempfile::tempdir().unwrap();
    let copy = dir.path().join("poker_tracker.db");
    for suffix in ["", "-wal", "-shm"] {
        let from = format!("{source}{suffix}");
        if Path::new(&from).exists() {
            std::fs::copy(&from, format!("{}{suffix}", copy.display())).unwrap();
        }
    }

    let backend = Backend::open(dir.path(), Some(&copy)).unwrap();
    let mut batches = 0;
    let processed = backend.backfill_flags(|_, _| batches += 1).unwrap();
    println!("{processed} hands brought up to date in {batches} batches");
    assert!(processed > 0, "a legacy database has no stat flags yet");
    assert_eq!(backend.backfill_flags(|_, _| {}).unwrap(), 0);

    let dashboard = backend.handle("GET", "/db/dashboard-stats", None).body;
    println!("{}", dashboard["data"]);
    assert_eq!(dashboard["data"]["total_hands"], processed as i64);
    let detailed = backend.handle("GET", "/db/detailed-stats", None).body;
    assert!(detailed["data"]["meta"]["player_hands"].as_i64().unwrap() > 0);
}
