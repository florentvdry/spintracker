//! Parses every hand history of `tests/fixtures/community/` (see its README).

use std::path::{Path, PathBuf};

use spintracker_core::parsers::get_parser;

fn files(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in std::fs::read_dir(dir).unwrap().flatten() {
        let path = entry.path();
        if path.is_dir() {
            files(&path, out);
        } else if path.extension().is_some_and(|e| e.eq_ignore_ascii_case("txt") || e.eq_ignore_ascii_case("xml")) {
            out.push(path);
        }
    }
}

#[test]
fn every_community_file_is_recognised_and_parses_into_consistent_hands() {
    let mut paths = Vec::new();
    files(&Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/community"), &mut paths);
    paths.sort();
    assert!(!paths.is_empty(), "the corpus is not empty");

    for path in paths {
        let name = path.file_name().unwrap().to_string_lossy().into_owned();
        let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{name}: {e}"));
        assert!(!regex::Regex::new(r"[\w.+-]+@[\w-]+\.[\w.]+").unwrap().is_match(&text), "{name}: an e-mail address is in the file");

        let parser = get_parser(&text).unwrap_or_else(|| panic!("{name}: no parser recognises this file"));
        let parsed = parser.parse_file(&text);
        assert!(parsed.count > 0, "{name}: no hand found");
        for hand in &parsed.hands {
            let id = hand.id.clone().unwrap_or_default();
            assert!(!hand.players.is_empty(), "{name} {id}: no player");
            assert!(hand.players.iter().any(|p| p.is_hero), "{name} {id}: no hero (a line `Dealt to ...` is missing)");
            let sum: f64 = hand.players.iter().map(|p| p.net_profit).sum();
            assert!(sum.abs() <= hand.rake + 1e-6, "{name} {id}: results add up to {sum}, more than the rake {}", hand.rake);
        }
    }
}
