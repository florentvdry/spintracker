//! Every sample in `fixtures/community` must be recognised by a parser and give at least one hand.
//! The folder starts empty: contributed samples are added through pull requests (see its README).

use std::fs;
use std::path::{Path, PathBuf};

use spintracker_core::parsers::get_parser;

fn corpus_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/community")
}

fn samples() -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = fs::read_dir(corpus_dir())
        .expect("the community corpus folder exists")
        .map(|entry| entry.expect("a readable directory entry").path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "txt"))
        .collect();
    files.sort();
    files
}

#[test]
fn every_community_sample_is_recognised_and_gives_hands() {
    for path in samples() {
        let content = fs::read_to_string(&path).unwrap_or_else(|err| panic!("{} is readable: {err}", path.display()));
        let parser = get_parser(&content).unwrap_or_else(|| panic!("no parser recognises {}", path.display()));
        let result = parser.parse_file(&content);
        assert!(result.success, "{} parses: {:?}", path.display(), result.error);
        assert!(!result.hands.is_empty(), "{} gives at least one hand", path.display());
    }
}

#[test]
fn the_corpus_folder_has_its_guide() {
    assert!(corpus_dir().join("README.md").is_file());
}
