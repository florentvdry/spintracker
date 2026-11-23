//! The rooms that only have synthetic samples (see `tests/fixtures/synthetic/README.md`): the whole
//! import chain accepts them and an import can be repeated.

use std::path::Path;
use std::sync::atomic::AtomicBool;

use serde_json::json;
use spintracker_core::api::Backend;
use spintracker_core::parsers::get_parser;

fn fixture(name: &str) -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/synthetic").join(name)
}

fn hands_of(backend: &Backend, room: &str) -> i64 {
    let body = backend.handle("POST", "/db/hands", Some(json!({ "limit": 100 }))).body;
    body["data"]["hands"].as_array().map_or(0, |hands| hands.iter().filter(|h| h["room"] == room).count() as i64)
}

#[test]
fn each_synthetic_file_is_detected_by_its_room_and_imported_once() {
    let cases = [("pokerstars_spin_and_go.txt", "PokerStars"), ("ggpoker_spin_gold.txt", "GGPoker")];
    for (file, room) in cases {
        let text = std::fs::read_to_string(fixture(file)).unwrap();
        assert_eq!(get_parser(&text).map(|p| p.room_name()), Some(room), "{file}");

        let dir = tempfile::tempdir().unwrap();
        let backend = Backend::open(dir.path(), None).unwrap();
        let first = backend.importer().import_file(&fixture(file), &AtomicBool::new(false), |_| {}).unwrap();
        assert_eq!(first.imported, 1, "{file}");
        // Importing the same file again creates no duplicate.
        backend.importer().import_file(&fixture(file), &AtomicBool::new(false), |_| {}).unwrap();
        assert_eq!(hands_of(&backend, room), 1, "{file}: re-import stays idempotent");
    }
}
