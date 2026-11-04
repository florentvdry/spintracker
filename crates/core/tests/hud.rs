//! Table HUD figures: same numbers as the Statistics page, per room, only hands the hero played.

use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::time::Instant;

use serde_json::{json, Value};
use spintracker_core::api::Backend;

const HERO: &str = "Nelfrot-YT";
const OPPONENTS: [&str; 2] = ["riickyy777", "CG_Boss2336"];

fn fixture(file: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/exemple-data/Winamax").join(file)
}

fn backend_with_hands() -> (tempfile::TempDir, Backend) {
    let dir = tempfile::tempdir().unwrap();
    let backend = Backend::open(dir.path(), None).unwrap();
    for file in ["20260415_Expresso(1096047576)_real_holdem_no-limit.txt", "20260415_Expresso(1096048521)_real_holdem_no-limit.txt"] {
        backend.importer().import_file(&fixture(file), &AtomicBool::new(false), |_| {}).unwrap();
    }
    (dir, backend)
}

fn stat(section: &str, label: &str, column: Option<&str>) -> Value {
    json!({ "section": section, "label": label, "column": column })
}

fn hud(backend: &Backend, room: &str, hero: &str, players: &[&str], stats: &[Value]) -> Value {
    let response = backend.handle("POST", "/hud/players", Some(json!({ "room": room, "heroName": hero, "players": players, "stats": stats })));
    assert_eq!(response.status, 200, "{:?}", response.body);
    response.body["data"].clone()
}

fn detailed(backend: &Backend, player: &str) -> Value {
    let url = format!("/db/detailed-stats?statsScope=player&opponentName={player}");
    backend.handle("GET", &url, None).body["data"].clone()
}

fn counts(value: &Value) -> (u64, u64) {
    (value["num"].as_u64().unwrap(), value["den"].as_u64().unwrap())
}

#[test]
fn hud_values_equal_the_detailed_statistics() {
    let (_dir, backend) = backend_with_hands();
    for player in OPPONENTS {
        let detailed = detailed(&backend, player);

        // Every figure of every section the HUD offers, read the way the Statistics page reads it.
        let mut asked = Vec::new();
        let mut expected = Vec::new();
        for row in detailed["preflop"].as_array().unwrap() {
            asked.push(stat("preflop", row["stat"].as_str().unwrap(), Some("tot")));
            expected.push(counts(&row["samples"]["tot"]));
        }
        for (key, section) in [("huSb", "huSb"), ("huBb", "huBb"), ("threeWayPreflop", "threeWayPreflop")] {
            for row in detailed[key].as_array().unwrap() {
                asked.push(stat(section, row["stat"].as_str().unwrap(), None));
                expected.push(counts(&row["sample"]));
            }
        }
        for row in detailed["steal"].as_array().unwrap() {
            for column in ["tot", "btn", "sb"] {
                if row["samples"][column]["den"].as_u64() == Some(0) && row[column] == "--" {
                    continue;
                }
                asked.push(stat("steal", row["stat"].as_str().unwrap(), Some(column)));
                expected.push(counts(&row["samples"][column]));
            }
        }
        for row in detailed["vsSteal"].as_array().unwrap() {
            for column in ["sb", "bb"] {
                asked.push(stat("vsSteal", row["stat"].as_str().unwrap(), Some(column)));
                expected.push(counts(&row["samples"][column]));
            }
        }

        let answer = hud(&backend, "Winamax", HERO, &[player], &asked);
        let figures = answer["players"][0]["stats"].as_array().unwrap();
        assert_eq!(figures.len(), expected.len());
        for ((asked, got), want) in asked.iter().zip(figures).zip(&expected) {
            assert_eq!(counts(got), *want, "{player}: {asked}");
        }
        assert_eq!(answer["players"][0]["hands"], detailed["meta"]["player_hands"], "{player}: hands counted");
    }
}

#[test]
fn only_hands_the_hero_played_count() {
    let (_dir, backend) = backend_with_hands();
    let vpip = [stat("preflop", "VPIP", Some("tot"))];

    let with_hero = hud(&backend, "Winamax", HERO, &["riickyy777"], &vpip);
    assert!(with_hero["players"][0]["hands"].as_u64().unwrap() > 0);

    let without = hud(&backend, "Winamax", "someone-else", &["riickyy777"], &vpip);
    assert_eq!(without["players"][0]["hands"], 0, "a hand without the hero is not counted");
    assert_eq!(without["players"][0]["stats"][0]["den"], 0);
}

#[test]
fn players_with_the_same_name_in_two_rooms_are_kept_apart() {
    let (_dir, backend) = backend_with_hands();
    let vpip = [stat("preflop", "VPIP", Some("tot"))];
    let all = hud(&backend, "Winamax", HERO, &["riickyy777"], &vpip)["players"][0]["hands"].as_u64().unwrap();
    assert!(all > 3);

    // Move some hands of that player to another room: the two rooms now hold different hands.
    let conn = backend.database().conn().unwrap();
    conn.execute("UPDATE hands SET room = 'Other' WHERE id IN (SELECT hand_id FROM player_hands WHERE player_name = 'riickyy777' LIMIT 3)", [])
        .unwrap();
    drop(conn);
    // The change was made behind the backend's back: tell it, as every write path does.
    backend.database().bump_data_version();

    let winamax = hud(&backend, "Winamax", HERO, &["riickyy777"], &vpip)["players"][0]["hands"].as_u64().unwrap();
    let other = hud(&backend, "Other", HERO, &["riickyy777"], &vpip)["players"][0]["hands"].as_u64().unwrap();
    assert_eq!((winamax, other), (all - 3, 3));
}

#[test]
fn figures_follow_the_data_and_notes_are_returned() {
    let (_dir, backend) = backend_with_hands();
    let vpip = [stat("preflop", "VPIP", Some("tot"))];
    assert!(hud(&backend, "Winamax", HERO, &["riickyy777"], &vpip)["players"][0]["hands"].as_u64().unwrap() > 0);

    let saved = backend.handle("PUT", "/hud/notes", Some(json!({ "room": "Winamax", "playerName": "riickyy777", "note": "shoves wide", "tag": "red" })));
    assert_eq!(saved.status, 200);
    let player = &hud(&backend, "Winamax", HERO, &["riickyy777"], &vpip)["players"][0];
    assert_eq!((player["note"].as_str(), player["tag"].as_str()), (Some("shoves wide"), Some("red")));

    // The cache must not outlive the data it was built from.
    assert_eq!(backend.handle("POST", "/db/delete-all", Some(json!({}))).status, 200);
    assert_eq!(hud(&backend, "Winamax", HERO, &["riickyy777"], &vpip)["players"][0]["hands"], 0);
}

#[test]
fn invalid_requests_are_rejected() {
    let (_dir, backend) = backend_with_hands();
    let ask = |body: Value| backend.handle("POST", "/hud/players", Some(body)).status;
    assert_eq!(ask(json!({ "room": "", "heroName": HERO, "players": [], "stats": [] })), 400);
    assert_eq!(ask(json!({ "room": "Winamax", "heroName": "", "players": [], "stats": [] })), 400);
    let many: Vec<String> = (0..13).map(|i| format!("p{i}")).collect();
    assert_eq!(ask(json!({ "room": "Winamax", "heroName": HERO, "players": many, "stats": [] })), 400);

    let note = |body: Value| backend.handle("PUT", "/hud/notes", Some(body)).status;
    assert_eq!(note(json!({ "room": "Winamax", "playerName": "x", "tag": "fish" })), 400);
    assert_eq!(note(json!({ "room": "Winamax", "playerName": "x", "note": "a".repeat(2001) })), 400);

    // An unknown stat or column is reported as such, not as an error.
    let unknown = hud(&backend, "Winamax", HERO, &["riickyy777"], &[stat("preflop", "Nope", None), stat("preflop", "VPIP", Some("moon"))]);
    assert_eq!(unknown["players"][0]["stats"][0]["pct"], Value::Null);
    assert_eq!(unknown["players"][0]["stats"][1]["pct"], Value::Null);
    assert_eq!(backend.handle("GET", "/hud/catalog", None).status, 200);
}

#[test]
fn a_player_with_ten_thousand_hands_is_answered_quickly() {
    let dir = tempfile::tempdir().unwrap();
    let backend = Backend::open(dir.path(), None).unwrap();
    {
        let mut conn = backend.database().conn().unwrap();
        let tx = conn.transaction().unwrap();
        for n in 0..10_000 {
            let id = format!("h{n}");
            tx.execute("INSERT INTO hands (id, room, player_count) VALUES (?1, 'Winamax', 3)", [&id]).unwrap();
            for (name, position) in [("hero", "BTN"), ("villain", if n % 2 == 0 { "SB" } else { "BB" })] {
                tx.execute("INSERT INTO player_hands (hand_id, player_name, position) VALUES (?1, ?2, ?3)", [&id, name, position]).unwrap();
                tx.execute(
                    "INSERT INTO hand_player_flags (hand_id, player_name, flags_version, flags_0, flags_1) VALUES (?1, ?2, 1, ?3, 0)",
                    rusqlite::params![id, name, n % 7],
                )
                .unwrap();
            }
        }
        tx.execute("INSERT INTO players (name, room) VALUES ('hero', 'Winamax'), ('villain', 'Winamax')", []).unwrap();
        tx.commit().unwrap();
    }
    backend.database().bump_data_version();

    let stats = [stat("preflop", "VPIP", Some("tot")), stat("preflop", "PFR", Some("tot")), stat("threeWayPreflop", "BTN RFI", None)];
    let started = Instant::now();
    let cold = hud(&backend, "Winamax", "hero", &["villain"], &stats);
    let cold_time = started.elapsed();
    assert_eq!(cold["players"][0]["hands"], 10_000);

    let started = Instant::now();
    hud(&backend, "Winamax", "hero", &["villain"], &stats);
    let warm_time = started.elapsed();
    println!("10k hands: cold {cold_time:?}, warm {warm_time:?}");
    // The target applies to optimised builds, which is how the tests are run (see AGENTS.md).
    if !cfg!(debug_assertions) {
        assert!(cold_time.as_millis() < 50 && warm_time.as_millis() < 50, "cold {cold_time:?}, warm {warm_time:?}");
    }
}
