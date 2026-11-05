//! Table HUD figures: same numbers as the Statistics page, per room, only hands the hero played.

use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use std::time::Instant;

use serde_json::{json, Value};
use spintracker_core::api::Backend;

/// The timing tests run one at a time: two of them sharing the processor would measure each other.
static TIMING: Mutex<()> = Mutex::new(());

/// Latency budgets with headroom for shared CI runners (a 58 ms run failed the former 50 ms limit);
/// they still catch a regression to a per-hand scan.
const SMALL_LAYOUT_BUDGET_MS: u128 = 200;
const FULL_GRID_BUDGET_MS: u128 = 400;

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

/// A database where one opponent played 10 000 hands against the hero, at every stack depth.
fn backend_with_ten_thousand_hands() -> (tempfile::TempDir, Backend) {
    let dir = tempfile::tempdir().unwrap();
    let backend = Backend::open(dir.path(), None).unwrap();
    {
        let mut conn = backend.database().conn().unwrap();
        let tx = conn.transaction().unwrap();
        for n in 0..10_000 {
            let id = format!("h{n}");
            tx.execute("INSERT INTO hands (id, room, player_count, blinds) VALUES (?1, 'Winamax', ?2, '20/40')", rusqlite::params![id, if n % 3 == 0 { 2 } else { 3 }]).unwrap();
            for (name, position) in [("hero", "BTN"), ("villain", if n % 2 == 0 { "SB" } else { "BB" })] {
                tx.execute(
                    "INSERT INTO player_hands (hand_id, player_name, position, stack) VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![id, name, position, 40 * (1 + n % 24)],
                )
                .unwrap();
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
    (dir, backend)
}

#[test]
fn a_player_with_ten_thousand_hands_is_answered_quickly() {
    let _alone = TIMING.lock().unwrap_or_else(|e| e.into_inner());
    let (_dir, backend) = backend_with_ten_thousand_hands();

    // A heads-up layout asked in one go: two stack-depth tables of eight figures over seven depths.
    let mut stats = vec![stat("preflop", "VPIP", Some("tot")), stat("postflop", "wtsd", None), stat("threeWayPreflop", "BTN RFI", None)];
    for bucket in ["13+", "11-13", "9-11", "7-9", "5-7", "3-5", "0-3"] {
        for column in ["sb_hu", "bb_hu"] {
            stats.push(stat_in("meta", "hands", Some(column), Some(bucket)));
            for label in ["Open Shove", "Iso Shove", "Call Shove"] {
                stats.push(stat_in("shove", label, Some(column), Some(bucket)));
            }
            for figure in ["cbet_flop", "fold_to_cbet_flop"] {
                stats.push(stat_in("postflop", figure, Some(column), Some(bucket)));
            }
            stats.push(stat_in("preflop", "VPIP", Some(column), Some(bucket)));
            stats.push(stat_in("preflop", "PFR", Some(column), Some(bucket)));
        }
    }
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
        assert!(cold_time.as_millis() < SMALL_LAYOUT_BUDGET_MS && warm_time.as_millis() < SMALL_LAYOUT_BUDGET_MS, "cold {cold_time:?}, warm {warm_time:?}");
    }
}

fn figure(answer: &Value, index: usize) -> (u64, u64) {
    counts(&answer["players"][0]["stats"][index])
}

#[test]
fn postflop_and_showdown_figures_equal_the_detailed_statistics() {
    let (_dir, backend) = backend_with_hands();
    for player in OPPONENTS {
        let detailed = detailed(&backend, player);
        let street = |stat: &str, street: &str| {
            let row = detailed["postflop"].as_array().unwrap().iter().find(|r| r["stat"] == stat).unwrap();
            counts(&row["samples"][street])
        };
        let showdown = |name: &str| counts(&detailed["showdown"]["samples"][name]);

        let asked = [
            stat("postflop", "cbet_flop", None),
            stat("postflop", "cbet_turn", None),
            stat("postflop", "fold_to_cbet_flop", None),
            stat("postflop", "donk_flop", None),
            stat("postflop", "wtsd", None),
            stat("postflop", "wsd", None),
            stat("postflop", "wwsf", None),
        ];
        let answer = hud(&backend, "Winamax", HERO, &[player], &asked);
        let expected = [
            street("C-Bet", "flop"),
            street("C-Bet", "turn"),
            street("Fold to CBet", "flop"),
            street("Donk Bet", "flop"),
            showdown("wtsd"),
            showdown("wsd"),
            showdown("wwsf"),
        ];
        for (i, want) in expected.iter().enumerate() {
            assert_eq!(figure(&answer, i), *want, "{player}: {}", asked[i]);
        }
    }
}

fn stat_in(section: &str, label: &str, column: Option<&str>, bucket: Option<&str>) -> Value {
    json!({ "section": section, "label": label, "column": column, "bucket": bucket })
}

#[test]
fn stack_depth_tables_partition_the_hands_and_formats_add_up() {
    let (_dir, backend) = backend_with_hands();
    let buckets: Vec<String> = backend.handle("GET", "/hud/catalog", None).body["data"]["buckets"]
        .as_array()
        .unwrap()
        .iter()
        .map(|b| b.as_str().unwrap().to_string())
        .collect();
    assert_eq!(buckets.len(), 7);

    let mut asked = vec![stat_in("meta", "hands", Some("tot"), None), stat_in("meta", "hands", Some("hu"), None), stat_in("meta", "hands", Some("three_way"), None)];
    asked.extend(buckets.iter().map(|b| stat_in("meta", "hands", Some("tot"), Some(b))));
    let answer = hud(&backend, "Winamax", HERO, &["riickyy777"], &asked);
    let hands = |i: usize| figure(&answer, i).0;

    assert!(hands(0) > 0);
    assert_eq!(hands(1) + hands(2), hands(0), "heads-up and three-handed hands make up all of them");
    let in_buckets: u64 = (3..asked.len()).map(hands).sum();
    assert_eq!(in_buckets, hands(0), "every hand falls in exactly one stack depth");

    let unknown = hud(&backend, "Winamax", HERO, &["riickyy777"], &[stat_in("meta", "hands", Some("tot"), Some("99+"))]);
    assert_eq!(unknown["players"][0]["stats"][0]["pct"], Value::Null);
}

#[test]
fn shove_figures_equal_the_push_fold_table() {
    let (_dir, backend) = backend_with_hands();
    for player in OPPONENTS {
        let detailed = detailed(&backend, player);
        let rows = detailed["pushFold"].as_array().unwrap();
        let sum = |key: &str| -> (u64, u64) {
            rows.iter().map(|r| counts(&r[key])).fold((0, 0), |(n, d), (rn, rd)| (n + rn, d + rd))
        };
        let asked = [
            stat_in("shove", "Open Shove", Some("tot"), None),
            stat_in("shove", "Iso Shove", Some("tot"), None),
            stat_in("shove", "Rejam", Some("tot"), None),
            stat_in("shove", "Call Shove", Some("tot"), None),
        ];
        let answer = hud(&backend, "Winamax", HERO, &[player], &asked);
        for (i, key) in ["open_shove_sample", "iso_shove_sample", "rejam_sample", "call_shove_sample"].iter().enumerate() {
            assert_eq!(figure(&answer, i), sum(key), "{player}: {key}");
        }
    }
}

#[test]
fn a_tournament_being_played_is_listed_with_the_seats_around_the_hero() {
    let (_dir, backend) = backend_with_hands();
    let tables = |room: &str, since: &str| -> Vec<Value> {
        let r = backend.handle("GET", &format!("/hud/tables?room={room}&since={since}"), None);
        assert_eq!(r.status, 200, "{:?}", r.body);
        r.body["data"].as_array().unwrap().clone()
    };

    // The fixtures have summaries, which end a tournament: with them imported nothing is live.
    assert!(tables("Winamax", "2000-01-01 00:00:00").is_empty());

    // The same tournaments before their summary arrived.
    let conn = backend.database().conn().unwrap();
    conn.execute("UPDATE hands SET position = 0", []).unwrap();
    drop(conn);
    let live = tables("Winamax", "2000-01-01 00:00:00");
    assert_eq!(live.len(), 2, "both imported tournaments are live without summaries");
    for table in &live {
        assert_eq!(table["hero"], HERO);
        let players = table["players"].as_array().unwrap();
        assert!(!players.is_empty() && players.len() <= 2);
        assert_eq!(players[0]["seat"], "+1");
        assert!(matches!(table["format"].as_str(), Some("threeMax" | "headsUp")));
        assert_eq!(players.len() + 1, if table["format"] == "headsUp" { 2 } else { 3 });
    }

    assert!(tables("Winamax", "2999-01-01 00:00:00").is_empty(), "hands older than `since` are not live");
    assert!(tables("Unibet", "2000-01-01 00:00:00").is_empty(), "other rooms are not mixed in");
    assert_eq!(backend.handle("GET", "/hud/tables?room=Winamax", None).status, 400);
}

#[test]
fn a_full_grid_layout_of_a_thousand_figures_is_answered_quickly() {
    let _alone = TIMING.lock().unwrap_or_else(|e| e.into_inner());
    let (_dir, backend) = backend_with_ten_thousand_hands();
    let buckets = ["13+", "11-13", "9-11", "7-9", "5-7", "3-5", "0-3"];
    let columns = ["sb_hu", "bb_hu", "btn", "sb_3w", "bb_3w"];
    // Seven depths, five columns, and about thirty figures per cell of the matrix.
    let figures = [
        ("preflop", "VPIP"), ("preflop", "PFR"), ("preflop", "Open Limp"), ("preflop", "3-Bet"), ("preflop", "Fold to 3-Bet"),
        ("preflop", "Limp-Fold"), ("preflop", "Iso Raise"), ("preflop", "Fold vs Raise"), ("shove", "Open Shove"),
        ("shove", "Call Shove"), ("shove", "Iso Shove"), ("postflop", "cbet_flop"), ("postflop", "fold_to_cbet_flop"),
        ("postflop", "donk_flop"), ("postflop", "wtsd"), ("meta", "hands"),
    ];
    let mut stats = Vec::new();
    for bucket in buckets {
        for column in columns {
            for (section, label) in figures {
                stats.push(stat_in(section, label, Some(column), Some(bucket)));
            }
        }
    }
    assert!(stats.len() > 500, "{} figures", stats.len());

    let started = Instant::now();
    let answer = hud(&backend, "Winamax", "hero", &["villain"], &stats);
    let cold = started.elapsed();
    assert_eq!(answer["players"][0]["stats"].as_array().unwrap().len(), stats.len());
    let started = Instant::now();
    hud(&backend, "Winamax", "hero", &["villain"], &stats);
    let warm = started.elapsed();
    println!("{} figures over 10k hands: cold {cold:?}, warm {warm:?}", stats.len());
    if !cfg!(debug_assertions) {
        assert!(cold.as_millis() < FULL_GRID_BUDGET_MS && warm.as_millis() < FULL_GRID_BUDGET_MS, "cold {cold:?}, warm {warm:?}");
    }

    // More than the limit is refused, not truncated.
    let too_many: Vec<Value> = (0..2049).map(|_| stat("preflop", "VPIP", Some("tot"))).collect();
    let refused = backend.handle("POST", "/hud/players", Some(json!({ "room": "Winamax", "heroName": "hero", "players": ["villain"], "stats": too_many })));
    assert_eq!(refused.status, 400);
}

#[test]
fn the_configured_hero_wins_over_the_player_with_known_cards() {
    let (_dir, backend) = backend_with_hands();
    backend.database().conn().unwrap().execute("UPDATE hands SET position = 0", []).unwrap();
    let tables = |heroes: Value| -> Vec<Value> {
        let body = json!({ "room": "Winamax", "since": "2000-01-01 00:00:00", "heroNames": heroes });
        let r = backend.handle("POST", "/hud/tables", Some(body));
        assert_eq!(r.status, 200, "{:?}", r.body);
        r.body["data"].as_array().unwrap().clone()
    };

    // Without a configured hero, the player whose cards are known most often is guessed.
    assert!(tables(json!([])).iter().all(|t| t["hero"] == HERO));
    // An alias that played is matched whatever its case, and an unknown name falls back to the guess.
    let others = tables(json!(["nobody", "MELIMELODYY"]));
    assert!(others.iter().any(|t| t["hero"] == "melimelodyy"), "{others:?}");
    // A configured hero who is no longer in the last hand has no table to show.
    assert!(others.iter().all(|t| t["hero"] == "melimelodyy" || t["hero"] == HERO), "{others:?}");
    assert!(tables(json!(["nobody"])).iter().all(|t| t["hero"] == HERO));
}

#[test]
fn more_simultaneous_requests_than_pool_connections_all_complete() {
    let (_dir, backend) = backend_with_hands();
    let stats = [stat("general", "VPIP", None)];
    let started = Instant::now();
    std::thread::scope(|scope| {
        for _ in 0..24 {
            scope.spawn(|| {
                let answer = hud(&backend, "Winamax", HERO, &OPPONENTS, &stats);
                assert_eq!(answer["players"].as_array().map(Vec::len), Some(OPPONENTS.len()));
            });
        }
    });
    // A request waiting for a connection that another one holds would run into the pool timeout.
    assert!(started.elapsed().as_secs() < 20, "took {:?}", started.elapsed());
}
