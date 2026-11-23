//! The request interface end to end: import the Betclic samples, then call the routes the UI
//! calls and compare with the responses of the former HTTP API.

use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::OnceLock;

use serde_json::{json, Value};
use spintracker_core::api::Backend;

fn golden(name: &str) -> Value {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden/betclic").join(name);
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

fn backend() -> &'static Backend {
    static BACKEND: OnceLock<(tempfile::TempDir, Backend)> = OnceLock::new();
    &BACKEND
        .get_or_init(|| {
            let dir = tempfile::tempdir().unwrap();
            let backend = Backend::open(dir.path(), None).unwrap();
            for name in ["21793509_ExportHH_2026-1-2.txt", "21793509_ExportHH_2026-1-3.txt"] {
                let file = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/exemple-data/Betclic").join(name);
                backend.importer().import_file(&file, &AtomicBool::new(false), |_| {}).unwrap();
            }
            (dir, backend)
        })
        .1
}

/// Numbers compared as floats; `sessions_this_month` depends on today's date.
fn same(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => (x.as_f64().unwrap() - y.as_f64().unwrap()).abs() < 1e-6,
        (Value::Object(x), Value::Object(y)) => x.len() == y.len() && x.iter().all(|(k, v)| y.get(k).is_some_and(|w| same(v, w))),
        (Value::Array(x), Value::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(v, w)| same(v, w)),
        (Value::String(x), Value::String(y)) if x != y => {
            // A JSON document stored as text (structured actions).
            match (serde_json::from_str::<Value>(x), serde_json::from_str::<Value>(y)) {
                (Ok(p @ Value::Object(_)), Ok(q)) => same(&p, &q),
                _ => false,
            }
        }
        _ => a == b,
    }
}

#[test]
fn get_routes_read_their_query_string() {
    let b = backend();
    let hands = b.handle("GET", "/db/hands?limit=3", None);
    assert!(same(&hands.body, &golden("hands_default.json")));

    let mut dashboard = b.handle("GET", "/db/dashboard-stats?heroName=jmenfouu", None).body;
    let mut expected = golden("dashboard_hero.json");
    for v in [&mut dashboard, &mut expected] {
        v["data"].as_object_mut().unwrap().remove("sessions_this_month");
        // Added after the former backend: they have no counterpart in the golden files.
        for added in ["unpriced_tournaments", "total_ev_profit", "luck_profit", "main_room", "pool_ev_profit", "pool_ev_tournaments", "pool_ev_buy_ins", "pool_ev_roi", "rakeback_total"] {
            v["data"].as_object_mut().unwrap().remove(added);
        }
    }
    assert!(same(&dashboard, &expected));

    assert!(same(&b.handle("GET", "/db/buyins", None).body, &golden("buyins.json")));
    assert!(same(&b.handle("GET", "/db/session-history?limit=50", None).body, &golden("sessions_default.json")));
    assert!(same(&b.handle("GET", "/db/opponents?heroName=jmenfouu&limit=5", None).body, &golden("opponents.json")));
    assert!(same(&b.handle("GET", "/db/tournaments?limit=5", None).body, &golden("tournaments_default.json")));
    assert!(same(
        &b.handle("GET", "/analysis/replayer/01KE0SWZ3MWW23307PVSF796TN?heroName=jmenfouu", None).body,
        &golden("replayer.json")
    ));
}

#[test]
fn post_routes_read_their_body() {
    let b = backend();
    let hands = b.handle("POST", "/db/hands", Some(json!({"limit":4,"page":2,"position":"HU SB","result":"won","sortBy":"profit_desc","heroName":"jmenfouu","dateFrom":"2026-01-03"})));
    assert!(same(&hands.body, &golden("hands_filtered.json")));
    let tournaments = b.handle("POST", "/db/tournaments", Some(json!({"limit":5,"sortBy":"profit_desc","result":"won"})));
    assert!(same(&tournaments.body, &golden("tournaments_sorted.json")));
    let session = b.handle("POST", "/db/session-history", Some(json!({"limit":1,"heroName":"jmenfouu"})));
    assert!(same(&session.body, &golden("sessions_limit1.json")));
    let against = b.handle("POST", "/db/hands-against/bitos9233", Some(json!({"heroName":"jmenfouu","limit":3})));
    assert!(same(&against.body, &golden("hands_against.json")));
    let equity = b.handle("POST", "/equity", Some(json!({"heroCards":"Ah Kh","villainCards":"Qs Qd","board":"2h 7h 9c Js"})));
    assert!(same(&equity.body, &golden("equity.json")));
    let batch = b.handle("POST", "/equity/batch", Some(json!({"hands":[{"id":"a","heroCards":"Ah Ad","villainCards":"Kc Kd","board":"2c 7d 9h"},{"id":"b","heroCards":"Zz Ad","villainCards":"Kc Kd"}]})));
    assert!(same(&batch.body, &golden("equity_batch.json")));
}

#[test]
fn the_players_routes_and_the_detailed_stats_answer() {
    let b = backend();
    assert!(same(&b.handle("GET", "/db/players?limit=5", None).body, &golden("players.json")));
    let detailed = b.handle("GET", "/db/detailed-stats", None);
    assert_eq!(detailed.status, 200);
    assert_eq!(detailed.body["data"]["meta"]["players"], 503);
    assert_eq!(b.handle("POST", "/db/players/sync", Some(json!({}))).body["success"], true);
}

#[test]
fn export_summary_counts_the_hands_the_list_returns() {
    let b = backend();
    let listed = b.handle("GET", "/db/hands?limit=100000", None).body["data"]["total"].as_i64().unwrap();
    let summary = b.handle("GET", "/db/export-summary", None).body;
    let buckets = summary["data"].as_array().unwrap();
    assert!(!buckets.is_empty());
    assert_eq!(buckets.iter().map(|x| x["hands"].as_i64().unwrap()).sum::<i64>(), listed);
    assert!(buckets.iter().all(|x| x["day"].as_str().is_some_and(|d| d.len() == 10) && x["bytes"].as_i64().unwrap() > 0));
}

#[test]
fn pool_ev_follows_the_saved_multiplier_tables() {
    use serde_json::json;
    let b = backend();
    // The settings route only accepts known keys.
    assert_eq!(b.handle("PUT", "/settings/not_a_setting", Some(json!({}))).status, 404);

    let table = json!({ "betclic": [{ "multiplier": 2, "weight": 50 }, { "multiplier": 4, "weight": 50 }] });
    assert_eq!(b.handle("PUT", "/settings/pool_ev_tables", Some(table.clone())).status, 200);
    assert_eq!(b.handle("GET", "/settings/pool_ev_tables", None).body["data"], table);

    let data = b.handle("GET", "/db/dashboard-stats?heroName=jmenfouu", None).body["data"].clone();
    let covered = data["pool_ev_tournaments"].as_i64().unwrap();
    assert!(covered > 0, "the Betclic tournaments use the saved table");
    // Mean x3 and a win chance of about one third: the buy-ins come back almost exactly.
    let roi = data["pool_ev_roi"].as_f64().unwrap();
    assert!(roi.abs() < 100.0, "evROI stays a plausible percentage, got {roi}");

    // Rakeback: 10% of the 7% rake of every Betclic buy-in, in the dashboard and the chart.
    assert_eq!(b.handle("PUT", "/settings/rakeback", Some(json!({ "betclic": 10 }))).status, 200);
    let after = b.handle("GET", "/db/dashboard-stats?heroName=jmenfouu", None).body["data"].clone();
    let rakeback = after["rakeback_total"].as_f64().unwrap();
    assert!(rakeback > 0.0);
    let chart = b.handle("POST", "/db/winrate-chart", Some(json!({ "heroName": "jmenfouu" }))).body["data"].clone();
    let last = chart.as_array().unwrap().last().unwrap();
    let chart_total = last["pool_ev_profit"].as_f64().unwrap();
    let dashboard_total = data["pool_ev_profit"].as_f64().unwrap();
    assert!((chart_total - dashboard_total).abs() < 0.05, "chart {chart_total} and dashboard {dashboard_total} agree");
    assert!((last["rakeback"].as_f64().unwrap() - rakeback).abs() < 0.05);
}

#[test]
fn cev_breakdown_route_returns_every_section() {
    use serde_json::json;
    let b = backend();
    let body = json!({ "heroName": "jmenfouu", "following": 3, "minEquityPercent": 60, "mode": "big_pot" });
    let data = b.handle("POST", "/db/cev-breakdown", Some(body)).body["data"].clone();
    let multiplier_tournaments: i64 = data["by_multiplier"].as_array().unwrap().iter().map(|m| m["tournaments"].as_i64().unwrap()).sum();
    assert_eq!(multiplier_tournaments, 300, "every Betclic tournament of the fixtures has a multiplier bucket");
    let progress: i64 = data["by_session_progress"].as_array().unwrap().iter().map(|m| m["tournaments"].as_i64().unwrap()).sum();
    assert_eq!(progress, 300);
    let composed_hands: i64 = data["by_composition"].as_object().unwrap().values().map(|b| b["hands"].as_i64().unwrap()).sum();
    assert_eq!(composed_hands, 4416, "every hand lands in one composition");
    assert!(data["after_bad_beat"]["avg_all"].is_number());
}

#[test]
fn time_stats_route_counts_every_tournament_and_saves_goals() {
    use serde_json::json;
    let b = backend();
    assert_eq!(b.handle("PUT", "/settings/volume_goals", Some(json!({ "weekly": 40, "monthly": 150 }))).status, 200);
    let data = b.handle("GET", "/db/time-stats?heroName=jmenfouu", None).body["data"].clone();
    assert_eq!(data["tournaments"], 300);
    let in_cells: i64 = data["cells"].as_array().unwrap().iter().map(|c| c["tournaments"].as_i64().unwrap()).sum();
    assert_eq!(in_cells, 300);
    let by_hour: i64 = data["by_hour"].as_array().unwrap().iter().map(|c| c.as_i64().unwrap()).sum();
    assert_eq!(by_hour, 300);
    assert!(data["hours_played"].as_f64().unwrap() > 0.0);
    assert_eq!(data["week"]["target"], 40);
    assert_eq!(data["month"]["target"], 150);
}
