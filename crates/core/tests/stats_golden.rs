//! Hero statistics compared with the figures the former C# backend produced.
//!
//! `tests/golden/betclic/*.json` hold the responses of that backend, captured after importing the
//! two Betclic sample files. The Rust import of the same files must give the same answers.

use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, OnceLock};

use serde_json::Value;
use spintracker_core::db::Database;
use spintracker_core::engines::analytics::AnalyticsCalculator;
use spintracker_core::repos::stats::{self, ChartQuery, StatsQuery};
use spintracker_core::services::Importer;

fn golden(name: &str) -> Value {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden/betclic").join(name);
    let json: Value = serde_json::from_slice(&std::fs::read(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()))).unwrap();
    assert_eq!(json["success"], true, "{name}");
    json["data"].clone()
}

/// A database holding the Betclic samples, shared by the tests of this file.
fn database() -> &'static Database {
    static DB: OnceLock<(tempfile::TempDir, Database)> = OnceLock::new();
    &DB.get_or_init(|| {
        let dir = tempfile::tempdir().unwrap();
        let db = Arc::new(Database::open(dir.path().join("betclic.db")).unwrap());
        let importer = Importer::new(db.clone(), Arc::new(AnalyticsCalculator::default()));
        for name in ["21793509_ExportHH_2026-1-2.txt", "21793509_ExportHH_2026-1-3.txt"] {
            let file: PathBuf = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/exemple-data/Betclic").join(name);
            importer.import_file(&file, &AtomicBool::new(false), |_| {}).unwrap();
        }
        drop(importer);
        let db = Arc::try_unwrap(db).ok().expect("importer dropped");
        (dir, db)
    })
    .1
}

/// First difference between two JSON values, numbers compared as floats (the former backend wrote
/// `54`, serde writes `54.0`).
fn diff(path: &str, expected: &Value, actual: &Value) -> Option<String> {
    match (expected, actual) {
        (Value::Number(a), Value::Number(b)) => {
            let (a, b) = (a.as_f64().unwrap(), b.as_f64().unwrap());
            ((a - b).abs() > 1e-6).then(|| format!("{path}: expected {a}, got {b}"))
        }
        (Value::Object(a), Value::Object(b)) => {
            for key in a.keys().chain(b.keys()) {
                match (a.get(key), b.get(key)) {
                    (Some(x), Some(y)) => {
                        if let Some(d) = diff(&format!("{path}.{key}"), x, y) {
                            return Some(d);
                        }
                    }
                    (x, y) => return Some(format!("{path}.{key}: expected {x:?}, got {y:?}")),
                }
            }
            None
        }
        (Value::Array(a), Value::Array(b)) => {
            if a.len() != b.len() {
                return Some(format!("{path}: expected {} items, got {}", a.len(), b.len()));
            }
            a.iter().zip(b).enumerate().find_map(|(i, (x, y))| diff(&format!("{path}[{i}]"), x, y))
        }
        (Value::String(a), Value::String(b)) if a != b => {
            // A JSON document stored as text (structured actions): compare the documents.
            match (serde_json::from_str::<Value>(a), serde_json::from_str::<Value>(b)) {
                (Ok(x @ Value::Object(_)), Ok(y)) => diff(&format!("{path}<json>"), &x, &y),
                _ => Some(format!("{path}: expected {a:?}, got {b:?}")),
            }
        }
        (a, b) if a == b => None,
        (a, b) => Some(format!("{path}: expected {a}, got {b}")),
    }
}

/// Rewrites a golden file with the current output. Only for deliberate behaviour changes, after
/// reviewing the differences: `SPINTRACKER_BLESS=a.json,b.json cargo test --test stats_golden`.
fn bless(name: &str, actual: &Value) {
    // The variable lists the golden files to rewrite, so unrelated ones stay untouched.
    if !std::env::var("SPINTRACKER_BLESS").is_ok_and(|names| names.split(',').any(|n| n == name)) {
        return;
    }
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden/betclic").join(name);
    let body = serde_json::json!({ "success": true, "data": actual });
    std::fs::write(&path, serde_json::to_vec(&body).unwrap()).unwrap();
}

fn assert_same(name: &str, actual: Value) {
    bless(name, &actual);
    let expected = golden(name);
    if let Some(d) = diff(name, &expected, &actual) {
        panic!("{d}");
    }
}

fn dashboard(q: StatsQuery) -> Value {
    let mut v = stats::dashboard_stats(&database().conn().unwrap(), &q).unwrap();
    // Depends on today's date.
    v.as_object_mut().unwrap().remove("sessions_this_month");
    // Added after the former backend: it has no counterpart in the golden files.
    v.as_object_mut().unwrap().remove("unpriced_tournaments");
    v
}

fn golden_dashboard(name: &str) -> Value {
    let mut v = golden(name);
    v.as_object_mut().unwrap().remove("sessions_this_month");
    v
}

fn assert_dashboard(name: &str, q: StatsQuery) {
    let (expected, actual) = (golden_dashboard(name), dashboard(q));
    if let Some(d) = diff(name, &expected, &actual) {
        panic!("{d}");
    }
}

#[test]
fn dashboard_matches_the_former_backend() {
    assert_dashboard("dashboard_default.json", StatsQuery::default());
    assert_dashboard("dashboard_hero.json", StatsQuery { hero_name: Some("jmenfouu".into()), ..Default::default() });
    assert_dashboard("dashboard_buyin2.json", StatsQuery { buy_in: Some(2.0), ..Default::default() });
    assert_dashboard(
        "dashboard_day3.json",
        StatsQuery {
            date_from: Some("2026-01-03 00:00:00".into()),
            date_to: Some("2026-01-03 23:59:59".into()),
            ..Default::default()
        },
    );
}

#[test]
fn session_history_matches_the_former_backend() {
    let conn = database().conn().unwrap();
    assert_same("sessions_default.json", Value::Array(stats::session_history(&conn, 50, &StatsQuery::default()).unwrap()));
    let one = stats::session_history(&conn, 1, &StatsQuery { hero_name: Some("jmenfouu".into()), ..Default::default() }).unwrap();
    assert_same("sessions_limit1.json", Value::Array(one));
}

#[test]
fn buy_ins_match_the_former_backend() {
    let buy_ins = stats::unique_buy_ins(&database().conn().unwrap()).unwrap();
    assert_same("buyins.json", serde_json::to_value(buy_ins).unwrap());
}

#[test]
fn multiplier_stats_match_the_former_backend() {
    let conn = database().conn().unwrap();
    let all = stats::multiplier_stats(&conn, &StatsQuery::default()).unwrap();
    assert_same("multiplier_default.json", serde_json::to_value(all).unwrap());
    let day = stats::multiplier_stats(
        &conn,
        &StatsQuery { date_from: Some("2026-01-03".into()), date_to: Some("2026-01-03".into()), ..Default::default() },
    )
    .unwrap();
    assert_same("multiplier_day3.json", serde_json::to_value(day).unwrap());
}

#[test]
fn winrate_chart_matches_the_former_backend() {
    let conn = database().conn().unwrap();
    let heads_up = stats::winrate_chart(
        &conn,
        &ChartQuery {
            position: Some("HU_SB".into()),
            date_from: Some("2026-01-03".into()),
            date_to: Some("2026-01-03".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_same("chart_husb_day3.json", Value::Array(heads_up));
    let big_blind = stats::winrate_chart(&conn, &ChartQuery { position: Some("3W_BB".into()), ..Default::default() }).unwrap();
    assert_same("chart_3wbb.json", Value::Array(big_blind));
}

/// Same reduction as the golden file: sample hands become "id|player" (top level) or a count.
fn digest(value: &Value, top: bool) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.iter().map(|v| digest(v, top)).collect()),
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| {
                    let reduced = match (k.as_str(), v) {
                        ("hands", Value::Array(hands)) if top => Value::Array(
                            hands
                                .iter()
                                .map(|h| Value::String(format!("{}|{}", h["id"].as_str().unwrap(), h["playerName"].as_str().unwrap())))
                                .collect(),
                        ),
                        ("hands", Value::Array(hands)) => Value::from(hands.len()),
                        _ => digest(v, top),
                    };
                    (k.clone(), reduced)
                })
                .collect(),
        ),
        other => other.clone(),
    }
}

/// Up to `limit` differences, to see the pattern of a failure at once.
fn all_diffs(path: &str, expected: &Value, actual: &Value, out: &mut Vec<String>, limit: usize) {
    if out.len() >= limit {
        return;
    }
    match (expected, actual) {
        (Value::Number(a), Value::Number(b)) => {
            if (a.as_f64().unwrap() - b.as_f64().unwrap()).abs() > 1e-6 {
                out.push(format!("{path}: expected {a}, got {b}"));
            }
        }
        (Value::Object(a), Value::Object(b)) => {
            for key in a.keys() {
                match b.get(key) {
                    Some(y) => all_diffs(&format!("{path}.{key}"), &a[key], y, out, limit),
                    None => out.push(format!("{path}.{key}: missing")),
                }
            }
        }
        (Value::Array(a), Value::Array(b)) => {
            if a.len() != b.len() {
                out.push(format!("{path}: expected {} items, got {}", a.len(), b.len()));
            }
            for (i, (x, y)) in a.iter().zip(b).enumerate() {
                all_diffs(&format!("{path}[{i}]"), x, y, out, limit);
            }
        }
        (a, b) if a == b => {}
        (a, b) => out.push(format!("{path}: expected {a}, got {b}")),
    }
}

#[test]
fn detailed_stats_match_the_former_backend() {
    let conn = database().conn().unwrap();
    let actual = spintracker_core::repos::detailed_stats::detailed_stats(&conn, &Default::default()).unwrap();
    let actual = digest(&actual, true);
    // Stack depths carry sample counts only.
    let mut actual = actual;
    let depths = actual["stackDepths"].clone();
    actual["stackDepths"] = digest(&depths, false);
    bless("detailed_population_digest.json", &actual);
    let expected = golden("detailed_population_digest.json");
    // The comparison must not be vacuous: spot-check figures seen in the original response.
    assert_eq!(expected["preflop"].as_array().unwrap().len(), 41);
    assert_eq!(expected["postflop"].as_array().unwrap().len(), 10, "postflop sections are part of the comparison");
    assert!(expected["showdown"]["samples"]["wtsd"]["den"].as_u64().unwrap() > 1000);
    assert_eq!(actual["preflop"][0]["samples"]["tot"]["num"], 6218);
    assert_eq!(actual["preflop"][0]["samples"]["tot"]["den"], 11130);
    assert_eq!(actual["meta"]["players"], 503);
    assert_eq!(actual["preflop"][0]["samples"]["tot"]["hands"].as_array().unwrap().len(), 20);

    let mut diffs = Vec::new();
    all_diffs("detailed", &expected, &actual, &mut diffs, 40);
    assert!(diffs.is_empty(), "{} differences (first shown):\n{}", diffs.len(), diffs.join("\n"));
}

// --- Hands, tournaments, players ------------------------------------------------------------

use spintracker_core::repos::hands_query::{self, HandsAgainstQuery, HandsQuery};
use spintracker_core::repos::player_queries::{self, PlayersQuery};
use spintracker_core::repos::{heatmap, tournaments};

#[test]
fn hands_match_the_former_backend() {
    let conn = database().conn().unwrap();
    assert_same("hands_default.json", hands_query::get_hands(&conn, &HandsQuery { limit: 3, ..Default::default() }).unwrap());

    let filtered: HandsQuery = serde_json::from_str(
        r#"{"limit":4,"page":2,"position":"HU SB","result":"won","sortBy":"profit_desc","heroName":"jmenfouu","dateFrom":"2026-01-03"}"#,
    )
    .unwrap();
    assert_same("hands_filtered.json", hands_query::get_hands(&conn, &filtered).unwrap());
}

#[test]
fn a_single_hand_matches_the_former_backend() {
    let conn = database().conn().unwrap();
    let id = "01KE0SWZ3MWW23307PVSF796TN";
    assert_same("hand_by_id.json", hands_query::get_hand_by_id(&conn, id, Some("jmenfouu")).unwrap().unwrap());
    assert_same("hand_by_id_nohero.json", hands_query::get_hand_by_id(&conn, id, None).unwrap().unwrap());
    assert!(hands_query::get_hand_by_id(&conn, "does-not-exist", None).unwrap().is_none());
}

#[test]
fn tournament_hands_and_hands_against_match_the_former_backend() {
    let conn = database().conn().unwrap();
    let hands = hands_query::get_tournament_hands(&conn, "01KE0SKJPHF0AV4NS1Y32NA0HM", Some("jmenfouu")).unwrap();
    assert_same("tournament_hands.json", Value::Array(hands));
    let against = hands_query::get_hands_against(
        &conn,
        "bitos9233",
        &HandsAgainstQuery { hero_name: Some("jmenfouu".into()), limit: 3, page: 1 },
    )
    .unwrap();
    assert_same("hands_against.json", against);
}

#[test]
fn tournaments_match_the_former_backend() {
    let conn = database().conn().unwrap();
    let plain = tournaments::get_tournaments(&conn, &HandsQuery { limit: 5, ..Default::default() }).unwrap();
    assert_same("tournaments_default.json", serde_json::to_value(plain).unwrap());
    let sorted = tournaments::get_tournaments(
        &conn,
        &HandsQuery { limit: 5, sort_by: Some("profit_desc".into()), result: Some("won".into()), ..Default::default() },
    )
    .unwrap();
    assert_same("tournaments_sorted.json", serde_json::to_value(sorted).unwrap());
}

#[test]
fn heatmap_and_players_match_the_former_backend() {
    let conn = database().conn().unwrap();
    assert_same("heatmap.json", heatmap::range_heatmap(&conn, &Default::default()).unwrap());
    assert_same("players.json", Value::Array(player_queries::players_overview(&conn, &PlayersQuery { limit: Some(5), ..Default::default() }).unwrap()));
    let filtered = PlayersQuery { min_hands: Some(50), is_reg_filter: Some("fish".into()), limit: Some(4) };
    assert_same("players_filtered.json", Value::Array(player_queries::players_overview(&conn, &filtered).unwrap()));
    assert_same("opponents.json", Value::Array(player_queries::opponents_for_hero(&conn, "jmenfouu", Some(5)).unwrap()));
}

// --- Analysis, replayer, equity ------------------------------------------------------------

use spintracker_core::engines::equity::calculate as calculate_equity;
use spintracker_core::services::analysis::{self, AnalysisFilters, AnalysisHandsRequest};

/// The profit curve is long: it is reduced to its length and its ends, in the golden files too.
fn reduce_graph(mut stats: Value) -> Value {
    let graph = stats["graphData"].as_array().cloned().unwrap_or_default();
    let n = graph.len();
    stats["graphData"] = serde_json::json!({
        "len": n,
        "first": graph.iter().take(5).collect::<Vec<_>>(),
        "last": graph[n.saturating_sub(5)..].to_vec(),
    });
    stats
}

#[test]
fn analysis_stats_match_the_former_backend() {
    let conn = database().conn().unwrap();
    let cases: [(&str, &str); 5] = [
        ("analysis_stats_hero.json", r#"{"heroName":"jmenfouu"}"#),
        ("analysis_stats_rfi.json", r#"{"heroName":"jmenfouu","positions":["BTN"],"playerCount":3,"situationId":"rfi"}"#),
        ("analysis_stats_seq.json", r#"{"heroName":"jmenfouu","actionSequence":["BTN:raise"],"opponentType":"fish"}"#),
        ("analysis_stats_street.json", r#"{"heroName":"jmenfouu","preflopBtnAction":"raise","preflopSbAction":"fold"}"#),
        ("analysis_stats_action.json", r#"{"heroName":"jmenfouu","action":"bet","situation":"flop","minStackBB":10,"maxStackBB":30}"#),
    ];
    for (file, body) in cases {
        let filters: AnalysisFilters = serde_json::from_str(body).unwrap();
        let actual = reduce_graph(analysis::analysis_stats(&conn, &filters).unwrap());
        assert_same(file, actual);
    }
}

#[test]
fn analysis_hands_and_ranges_match_the_former_backend() {
    let conn = database().conn().unwrap();
    let request: AnalysisHandsRequest =
        serde_json::from_str(r#"{"heroName":"jmenfouu","positions":["SB"],"playerCount":2,"sortBy":"profit_desc","limit":3,"page":2}"#).unwrap();
    assert_same("analysis_hands.json", analysis::analysis_hands(&conn, &request).unwrap());

    let filters: AnalysisFilters =
        serde_json::from_str(r#"{"heroName":"jmenfouu","positions":["BTN"],"playerCount":3,"situation":"preflop","situationId":"rfi"}"#).unwrap();
    assert_same("analysis_range.json", analysis::range_breakdown(&conn, &filters).unwrap());
}

#[test]
fn replayer_and_placeholder_range_match_the_former_backend() {
    let conn = database().conn().unwrap();
    let replay = analysis::hand_replay(&conn, "01KE0SWZ3MWW23307PVSF796TN", Some("jmenfouu")).unwrap().unwrap();
    assert_same("replayer.json", replay);
    assert!(analysis::hand_replay(&conn, "missing", None).unwrap().is_none());
}

#[test]
fn equity_matches_the_former_backend() {
    let result = calculate_equity("Ah Kh", "Qs Qd", "2h 7h 9c Js", None).unwrap();
    let actual = serde_json::json!({
        "heroEquity": result.hero_equity, "villainEquity": result.villain_equity, "tieEquity": result.tie_equity,
    });
    assert_same("equity.json", actual);
    let aces = calculate_equity("Ah Ad", "Kc Kd", "2c 7d 9h", None).unwrap();
    assert!((aces.hero_equity - 91.61616161616162).abs() < 1e-9);
    assert_eq!(calculate_equity("Zz Ad", "Kc Kd", "", None).unwrap_err().to_string(), "Invalid card rank: 'Z'");
}
