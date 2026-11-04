//! User-defined stats through the API: saving, computing over the history, the HUD and the
//! Statistics page.

use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

use serde_json::{json, Value};
use spintracker_core::api::Backend;

const HERO: &str = "Nelfrot-YT";
const OPPONENT: &str = "riickyy777";
const FILES: [&str; 2] = ["20260415_Expresso(1096047576)_real_holdem_no-limit.txt", "20260415_Expresso(1096048521)_real_holdem_no-limit.txt"];

fn fixture(file: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/exemple-data/Winamax").join(file)
}

fn import(backend: &Backend, file: &str) {
    backend.importer().import_file(&fixture(file), &AtomicBool::new(false), |_| {}).unwrap();
}

fn vpip_definition(name: &str) -> Value {
    json!({ "schema": 1, "name": name, "numerator": { "type": "flag", "name": "Vpip" } })
}

fn create(backend: &Backend, definition: Value) -> i64 {
    let response = backend.handle("POST", "/custom-stats", Some(definition));
    assert_eq!(response.status, 200, "{:?}", response.body);
    response.body["data"]["id"].as_i64().unwrap()
}

fn hud_figure(backend: &Backend, section: &str, label: &str) -> Value {
    let stat = json!({ "section": section, "label": label, "column": "tot" });
    let body = json!({ "room": "Winamax", "heroName": HERO, "players": [OPPONENT], "stats": [stat] });
    let response = backend.handle("POST", "/hud/players", Some(body));
    assert_eq!(response.status, 200, "{:?}", response.body);
    response.body["data"]["players"][0]["stats"][0].clone()
}

#[test]
fn a_custom_stat_equals_the_builtin_one_it_copies() {
    let dir = tempfile::tempdir().unwrap();
    let backend = Backend::open(dir.path(), None).unwrap();
    for file in FILES {
        import(&backend, file);
    }

    let id = create(&backend, vpip_definition("My VPIP"));
    let label = id.to_string();

    // Pending until the history is computed: no figure rather than a wrong one.
    assert!(hud_figure(&backend, "custom", &label)["pct"].is_null());
    let status = backend.handle("GET", "/custom-stats/status", None).body["data"].clone();
    assert_eq!(status["pending"], 1);

    let done = backend.handle("POST", "/custom-stats/recompute", None);
    assert_eq!(done.status, 200);
    assert_eq!(backend.handle("GET", "/custom-stats/status", None).body["data"]["pending"], 0);

    let custom = hud_figure(&backend, "custom", &label);
    let builtin = hud_figure(&backend, "preflop", "VPIP");
    assert!(custom["den"].as_u64().unwrap() > 0);
    assert_eq!((&custom["num"], &custom["den"]), (&builtin["num"], &builtin["den"]));

    // The catalog offers it under its name.
    let catalog = backend.handle("GET", "/hud/catalog", None).body["data"]["stats"].clone();
    let entry = catalog.as_array().unwrap().iter().find(|s| s["id"] == format!("custom:{id}")).unwrap();
    assert_eq!((entry["name"].as_str(), entry["label"].as_str(), entry["ready"].as_bool()), (Some("My VPIP"), Some(label.as_str()), Some(true)));

    // The Statistics page lists it, over the same hands as its own figures.
    let url = format!("/db/detailed-stats?statsScope=player&opponentName={OPPONENT}");
    let detailed = backend.handle("GET", &url, None).body["data"].clone();
    let row = detailed["customStats"].as_array().unwrap().iter().find(|s| s["id"] == id).unwrap();
    assert_eq!((&row["num"], &row["den"]), (&builtin["num"], &builtin["den"]));
}

#[test]
fn hands_imported_after_the_definition_are_counted_once() {
    let dir = tempfile::tempdir().unwrap();
    let backend = Backend::open(dir.path(), None).unwrap();
    import(&backend, FILES[0]);
    let id = create(&backend, vpip_definition("My VPIP"));
    backend.handle("POST", "/custom-stats/recompute", None);
    let before = hud_figure(&backend, "custom", &id.to_string())["den"].as_u64().unwrap();

    import(&backend, FILES[1]);
    let after = hud_figure(&backend, "custom", &id.to_string());
    assert_eq!(after["den"], hud_figure(&backend, "preflop", "VPIP")["den"]);
    assert!(after["den"].as_u64().unwrap() >= before);

    // Importing the same file again creates no duplicate hits.
    import(&backend, FILES[1]);
    assert_eq!(hud_figure(&backend, "custom", &id.to_string())["den"], after["den"]);
}

#[test]
fn invalid_definitions_are_refused_and_edits_recompute() {
    let dir = tempfile::tempdir().unwrap();
    let backend = Backend::open(dir.path(), None).unwrap();
    import(&backend, FILES[0]);

    let bad = json!({ "schema": 1, "name": "Bad", "numerator": { "type": "flag", "name": "NoSuchFlag" } });
    assert_eq!(backend.handle("POST", "/custom-stats", Some(bad)).status, 400);
    assert_eq!(backend.handle("POST", "/custom-stats", Some(json!({ "name": "x" }))).status, 400);

    let id = create(&backend, vpip_definition("Mine"));
    assert_eq!(backend.handle("POST", "/custom-stats", Some(vpip_definition("mine"))).status, 400, "names are unique");
    backend.handle("POST", "/custom-stats/recompute", None);

    let pfr = json!({ "schema": 1, "name": "Mine", "numerator": { "type": "flag", "name": "Pfr" } });
    assert_eq!(backend.handle("PUT", &format!("/custom-stats/{id}"), Some(pfr)).status, 200);
    assert!(hud_figure(&backend, "custom", &id.to_string())["pct"].is_null(), "an edited stat waits for its recomputation");
    backend.handle("POST", "/custom-stats/recompute", None);
    assert_eq!(hud_figure(&backend, "custom", &id.to_string())["num"], hud_figure(&backend, "preflop", "PFR")["num"]);

    assert_eq!(backend.handle("PUT", "/custom-stats/9999", Some(vpip_definition("Other"))).status, 404);
    assert_eq!(backend.handle("DELETE", &format!("/custom-stats/{id}"), None).status, 200);
    assert_eq!(backend.handle("DELETE", &format!("/custom-stats/{id}"), None).status, 404);
    assert!(backend.handle("GET", "/custom-stats", None).body["data"].as_array().unwrap().is_empty());
}

#[test]
fn the_preview_does_not_store_anything() {
    let dir = tempfile::tempdir().unwrap();
    let backend = Backend::open(dir.path(), None).unwrap();
    import(&backend, FILES[0]);
    let response = backend.handle("POST", "/custom-stats/preview", Some(json!({ "definition": vpip_definition("Draft"), "heroName": HERO })));
    assert_eq!(response.status, 200, "{:?}", response.body);
    assert!(response.body["data"]["den"].as_u64().unwrap() > 0);
    assert!(backend.handle("GET", "/custom-stats", None).body["data"].as_array().unwrap().is_empty());
    let invalid = backend.handle("POST", "/custom-stats/preview", Some(json!({ "definition": { "schema": 2 } })));
    assert_eq!(invalid.status, 400);
}
