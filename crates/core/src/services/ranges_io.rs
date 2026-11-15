//! Saving and sharing the player's ranges: a versioned JSON file that is validated strictly and
//! reports what it had to ignore.

use std::collections::{BTreeMap, HashMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::engines::range_scenarios::{hand_classes, is_hand_class, HAND_CLASS_COUNT};
use crate::services::user_ranges::{self as ranges, ActionInput, RangeError, Res};

pub const FORMAT: &str = "spintracker-ranges";
pub const VERSION: i64 = 1;

/// How an imported file meets the ranges already stored.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImportMode {
    /// Everything stored is dropped first.
    Replace,
    /// Actions of the same label are reused and spots of the same name are replaced.
    Merge,
}

impl ImportMode {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "replace" => Some(Self::Replace),
            "merge" => Some(Self::Merge),
            _ => None,
        }
    }
}

fn ids_of(tx: &rusqlite::Transaction, sql: &str, id: i64) -> Res<Vec<i64>> {
    let mut stmt = tx.prepare(sql)?;
    let ids = stmt.query_map([id], |r| r.get(0))?.collect::<std::result::Result<Vec<i64>, _>>()?;
    Ok(ids)
}

// ---------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------

type SpotRow = (i64, String, String, String, String, Option<String>, String, bool);

/// The range data as the JSON file format. With `only`, just those scenarios (depths) are written,
/// with the spots, actions and programs they need.
pub fn export(conn: &Connection, only: Option<&HashSet<i64>>) -> Res<Value> {
    let mut labels: HashMap<i64, String> = HashMap::new();
    let mut actions = Vec::new();
    {
        let mut stmt = conn.prepare("SELECT id, label, color, immediate, size_value, size_unit, response FROM range_actions ORDER BY sort_order, id")?;
        for row in stmt.query_map([], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, Option<f64>>(4)?, r.get::<_, Option<String>>(5)?, r.get::<_, String>(6)?))
        })? {
            let (id, label, color, immediate, size_value, size_unit, response) = row?;
            actions.push(json!({ "label": label, "color": color, "immediate": immediate, "sizeValue": size_value, "sizeUnit": size_unit, "response": response }));
            labels.insert(id, label);
        }
    }

    let mut spot_names: HashMap<i64, String> = HashMap::new();
    let mut used_labels: HashSet<String> = HashSet::new();
    let mut spots = Vec::new();
    let spot_rows: Vec<SpotRow> = {
        let mut stmt = conn.prepare("SELECT id, name, format, hero_position, line, line_sizes, opponent, study_only FROM range_spots ORDER BY id")?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get::<_, i64>(7)? != 0)))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        rows
    };
    for (id, name, format, hero, line, sizes, opponent, study) in spot_rows {
        let depth_rows: Vec<(i64, f64)> = {
            let mut stmt = conn.prepare("SELECT id, stack_bb FROM range_scenarios WHERE spot_id = ?1 ORDER BY stack_bb DESC")?;
            let rows = stmt.query_map([id], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<std::result::Result<Vec<_>, _>>()?;
            rows
        };
        let mut scenarios = Vec::new();
        for (scenario_id, stack) in depth_rows.into_iter().filter(|(id, _)| only.map_or(true, |chosen| chosen.contains(id))) {
            let mut hands = BTreeMap::new();
            let mut hand_stmt = conn.prepare("SELECT hand, action_id FROM range_hands WHERE scenario_id = ?1")?;
            for row in hand_stmt.query_map([scenario_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))? {
                let (hand, action) = row?;
                let label = labels.get(&action).cloned().unwrap_or_default();
                used_labels.insert(label.clone());
                hands.insert(hand, label);
            }
            scenarios.push(json!({ "stackBb": stack, "hands": hands }));
        }
        if only.is_some() && scenarios.is_empty() {
            continue;
        }
        spots.push(json!({
            "name": name, "format": format, "heroPosition": hero, "line": line,
            "lineSizes": sizes.and_then(|s| serde_json::from_str::<Value>(&s).ok()), "opponent": opponent, "studyOnly": study, "scenarios": scenarios,
        }));
        spot_names.insert(id, name);
    }

    let programs: Vec<Value> = ranges::programs(conn)?
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|p| {
                    let names: Vec<Value> = p["spotIds"].as_array().into_iter().flatten().filter_map(Value::as_i64).filter_map(|id| spot_names.get(&id)).map(|n| json!(n)).collect();
                    (only.is_none() || !names.is_empty()).then(|| json!({ "name": p["name"], "spots": names }))
                })
                .collect()
        })
        .unwrap_or_default();

    if only.is_some() {
        actions.retain(|a| a["label"].as_str().is_some_and(|label| used_labels.contains(label)));
    }
    Ok(json!({ "format": FORMAT, "version": VERSION, "actions": actions, "spots": spots, "programs": programs }))
}

// ---------------------------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileSpot {
    name: String,
    format: String,
    hero_position: String,
    line: String,
    #[serde(default)]
    line_sizes: Option<Value>,
    #[serde(default)]
    opponent: Option<String>,
    #[serde(default)]
    study_only: bool,
    #[serde(default)]
    scenarios: Vec<FileScenario>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileScenario {
    stack_bb: f64,
    #[serde(default)]
    hands: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct FileProgram {
    name: String,
    #[serde(default)]
    spots: Vec<String>,
}

fn items<T: for<'de> Deserialize<'de>>(file: &Value, key: &str, warnings: &mut Vec<String>) -> Vec<T> {
    let Some(list) = file.get(key).and_then(Value::as_array) else { return Vec::new() };
    list.iter()
        .enumerate()
        .filter_map(|(i, item)| match serde_json::from_value::<T>(item.clone()) {
            Ok(v) => Some(v),
            Err(e) => {
                warnings.push(format!("{key} #{}: unreadable ({e})", i + 1));
                None
            }
        })
        .collect()
}

/// Imports a file. Problems with the file as a whole (not JSON, wrong format or version, no usable
/// action) reject it and change nothing; problems with one item are listed in the report and the
/// item is skipped or repaired. A dry run builds the same report and leaves the data untouched.
pub fn import(conn: &mut Connection, content: &str, mode: ImportMode, dry_run: bool) -> Res<Value> {
    let file: Value = serde_json::from_str(content).map_err(|e| RangeError::Invalid(format!("not a valid JSON file: {e}")))?;
    if file.get("format").and_then(Value::as_str) != Some(FORMAT) {
        return Err(RangeError::Invalid("not a SpinTracker ranges file".into()));
    }
    if file.get("version").and_then(Value::as_i64) != Some(VERSION) {
        return Err(RangeError::Invalid(format!("unsupported file version (expected {VERSION})")));
    }

    let mut warnings = Vec::new();
    let file_actions: Vec<ActionInput> = items(&file, "actions", &mut warnings);
    let mut valid_actions = Vec::new();
    for action in file_actions {
        match ranges::validate_action(&action) {
            Ok(()) => valid_actions.push(action),
            Err(RangeError::Invalid(message)) => warnings.push(format!("action {}: {message}", action.label)),
            Err(e) => return Err(e),
        }
    }
    let file_spots: Vec<FileSpot> = items(&file, "spots", &mut warnings);
    let file_programs: Vec<FileProgram> = items(&file, "programs", &mut warnings);

    if mode == ImportMode::Replace && valid_actions.is_empty() {
        return Err(RangeError::Invalid("the file holds no usable action".into()));
    }
    let tx = conn.transaction()?;
    if mode == ImportMode::Replace {
        let all: Vec<i64> = {
            let mut stmt = tx.prepare("SELECT id FROM range_scenarios")?;
            let ids = stmt.query_map([], |r| r.get(0))?.collect::<std::result::Result<Vec<i64>, _>>()?;
            ids
        };
        ranges::purge_scenarios(&tx, &all)?;
        for table in ["range_program_spots", "range_programs", "range_spots", "range_actions"] {
            tx.execute(&format!("DELETE FROM {table}"), [])?;
        }
    }

    // Actions: a label already stored is reused as it is.
    let mut action_ids: HashMap<String, i64> = HashMap::new();
    let mut created_actions = 0;
    for action in &valid_actions {
        let label = action.label.trim().to_string();
        if action_ids.contains_key(&label) {
            warnings.push(format!("action {label}: duplicated in the file"));
            continue;
        }
        let existing: Option<i64> = tx.query_row("SELECT id FROM range_actions WHERE label = ?1", [&label], |r| r.get(0)).optional()?;
        let id = match existing {
            Some(id) => id,
            None => {
                let order: i64 = tx.query_row("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM range_actions", [], |r| r.get(0))?;
                tx.execute(
                    "INSERT INTO range_actions (label, color, immediate, size_value, size_unit, response, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![label, action.color, action.immediate, action.size_value, action.size_unit, action.response, order],
                )?;
                created_actions += 1;
                tx.last_insert_rowid()
            }
        };
        action_ids.insert(label, id);
    }
    let fallback = ranges::first_action(&tx)?;
    let fallback_label: String = tx.query_row("SELECT label FROM range_actions WHERE id = ?1", [fallback], |r| r.get(0))?;
    // Labels of the stored palette resolve too, so a merge can point at actions the file does not define.
    {
        let mut stmt = tx.prepare("SELECT label, id FROM range_actions")?;
        for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))? {
            let (label, id) = row?;
            action_ids.entry(label).or_insert(id);
        }
    }

    let (mut spot_count, mut scenario_count) = (0, 0);
    let mut spot_ids: HashMap<String, i64> = HashMap::new();
    for spot in file_spots {
        let name = spot.name.trim().to_string();
        let hero = spot.hero_position.to_uppercase();
        let line = match ranges::normalize_line(&spot.format, &hero, &spot.line) {
            Ok(line) if matches!(spot.format.as_str(), "3max" | "hu") => line,
            _ => {
                warnings.push(format!("scenario {name}: unreadable situation, ignored"));
                continue;
            }
        };
        let opponent = spot.opponent.as_deref().filter(|o| !o.is_empty()).unwrap_or("any").to_string();
        if !matches!(opponent.as_str(), "any" | "reg") || name.is_empty() || spot.scenarios.is_empty() {
            warnings.push(format!("scenario {name}: invalid, ignored"));
            continue;
        }
        if mode == ImportMode::Merge {
            let same_name: Option<i64> = tx.query_row("SELECT id FROM range_spots WHERE name = ?1", [&name], |r| r.get(0)).optional()?;
            if let Some(id) = same_name {
                let scenarios = ids_of(&tx, "SELECT id FROM range_scenarios WHERE spot_id = ?1", id)?;
                ranges::purge_scenarios(&tx, &scenarios)?;
                tx.execute("DELETE FROM range_program_spots WHERE spot_id = ?1", [id])?;
                tx.execute("DELETE FROM range_spots WHERE id = ?1", [id])?;
            }
        }
        let clash: Option<String> = tx
            .query_row(
                "SELECT name FROM range_spots WHERE format = ?1 AND hero_position = ?2 AND line = ?3 AND opponent = ?4",
                params![spot.format, hero, line, opponent],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(other) = clash {
            warnings.push(format!("scenario {name}: same situation as {other}, ignored"));
            continue;
        }
        let sizes = spot.line_sizes.as_ref().filter(|v| !v.is_null()).map(Value::to_string);
        let stamp = ranges::now();
        tx.execute(
            "INSERT INTO range_spots (name, format, hero_position, line, line_sizes, opponent, study_only, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
            params![name, spot.format, hero, line, sizes, opponent, spot.study_only, stamp],
        )?;
        let spot_id = tx.last_insert_rowid();

        let mut seen_depths = HashSet::new();
        for scenario in spot.scenarios {
            if ranges::validate_depth(scenario.stack_bb).is_err() || !seen_depths.insert(scenario.stack_bb.to_bits()) {
                warnings.push(format!("scenario {name}: depth {} ignored", scenario.stack_bb));
                continue;
            }
            tx.execute("INSERT INTO range_scenarios (spot_id, stack_bb, updated_at) VALUES (?1, ?2, ?3)", params![spot_id, scenario.stack_bb, stamp])?;
            let scenario_id = tx.last_insert_rowid();
            let mut chosen: HashMap<String, i64> = HashMap::new();
            for (hand, label) in &scenario.hands {
                if !is_hand_class(hand) {
                    warnings.push(format!("{name} {}: unknown hand {hand}, ignored", scenario.stack_bb));
                    continue;
                }
                match action_ids.get(label.trim()) {
                    Some(id) => {
                        chosen.insert(hand.clone(), *id);
                    }
                    None => warnings.push(format!("{name} {}: unknown action {label} for {hand} -> replaced by {fallback_label}", scenario.stack_bb)),
                }
            }
            let known_hands = scenario.hands.keys().filter(|h| is_hand_class(h)).count();
            if known_hands < HAND_CLASS_COUNT {
                warnings.push(format!("incomplete range: {name} {} ({known_hands}/{HAND_CLASS_COUNT})", scenario.stack_bb));
            }
            for hand in hand_classes() {
                let action = chosen.get(&hand).copied().unwrap_or(fallback);
                tx.execute("INSERT INTO range_hands (scenario_id, hand, action_id, weight) VALUES (?1, ?2, ?3, 1.0)", params![scenario_id, hand, action])?;
            }
            scenario_count += 1;
        }
        if seen_depths.is_empty() {
            tx.execute("DELETE FROM range_spots WHERE id = ?1", [spot_id])?;
            warnings.push(format!("scenario {name}: no usable depth, ignored"));
        } else {
            spot_ids.insert(name.clone(), spot_id);
            spot_count += 1;
        }
    }

    let mut program_count = 0;
    for program in file_programs {
        let name = program.name.trim().to_string();
        if name.is_empty() {
            warnings.push("program without a name, ignored".into());
            continue;
        }
        let existing: Option<i64> = tx.query_row("SELECT id FROM range_programs WHERE name = ?1", [&name], |r| r.get(0)).optional()?;
        let id = match existing {
            Some(id) => {
                tx.execute("DELETE FROM range_program_spots WHERE program_id = ?1", [id])?;
                id
            }
            None => {
                let order: i64 = tx.query_row("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM range_programs", [], |r| r.get(0))?;
                tx.execute("INSERT INTO range_programs (name, sort_order) VALUES (?1, ?2)", params![name, order])?;
                tx.last_insert_rowid()
            }
        };
        let mut linked = HashSet::new();
        for spot_name in &program.spots {
            let spot_id = match spot_ids.get(spot_name) {
                Some(id) => Some(*id),
                None => tx.query_row("SELECT id FROM range_spots WHERE name = ?1", [spot_name], |r| r.get(0)).optional()?,
            };
            match spot_id {
                Some(spot_id) if linked.insert(spot_id) => {
                    let order = linked.len() as i64 - 1;
                    tx.execute("INSERT INTO range_program_spots (program_id, spot_id, sort_order) VALUES (?1, ?2, ?3)", params![id, spot_id, order])?;
                }
                Some(_) => {}
                None => warnings.push(format!("program {name}: unknown scenario {spot_name}, ignored")),
            }
        }
        program_count += 1;
    }
    if dry_run {
        tx.rollback()?;
    } else {
        crate::services::range_adherence::invalidate(&tx)?;
        tx.commit()?;
    }
    Ok(json!({ "actions": created_actions, "spots": spot_count, "scenarios": scenario_count, "programs": program_count, "warnings": warnings }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;

    const FIXTURE: &str = include_str!("../../tests/fixtures/ranges_v1.json");

    fn db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations::run(&mut conn).unwrap();
        conn
    }

    fn count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn export_import_export_is_identical() {
        let mut conn = db();
        let report = import(&mut conn, FIXTURE, ImportMode::Replace, false).unwrap();
        assert_eq!(report["warnings"], json!([]), "the fixture is a complete, valid file");
        assert_eq!((report["spots"].as_i64(), report["scenarios"].as_i64(), report["programs"].as_i64()), (Some(3), Some(4), Some(1)));
        let first = export(&conn, None).unwrap();

        let mut other = db();
        import(&mut other, &first.to_string(), ImportMode::Replace, false).unwrap();
        assert_eq!(export(&other, None).unwrap(), first);
        assert_eq!(first["actions"].as_array().unwrap().len(), 4);
        assert_eq!(count(&conn, "range_hands"), 4 * 169);
    }

    #[test]
    fn exporting_chosen_depths_keeps_only_what_they_need() {
        let mut conn = db();
        import(&mut conn, FIXTURE, ImportMode::Replace, false).unwrap();
        let first: i64 = conn.query_row("SELECT id FROM range_scenarios ORDER BY id LIMIT 1", [], |r| r.get(0)).unwrap();
        let chosen = HashSet::from([first]);
        let file = export(&conn, Some(&chosen)).unwrap();

        let spots = file["spots"].as_array().unwrap();
        assert_eq!(spots.len(), 1, "only the spot of the chosen depth");
        assert_eq!(spots[0]["scenarios"].as_array().unwrap().len(), 1);
        let kept = file["actions"].as_array().unwrap().len();
        assert!(kept >= 1 && kept < 4, "only the actions the chosen hands use, got {kept}");
        for program in file["programs"].as_array().unwrap() {
            assert_eq!(program["spots"].as_array().unwrap().len(), 1, "a program lists only exported spots");
        }

        let mut other = db();
        let report = import(&mut other, &file.to_string(), ImportMode::Replace, false).unwrap();
        assert_eq!(report["warnings"], json!([]));
        assert_eq!(export(&other, None).unwrap(), file);
    }

    #[test]
    fn exporting_no_depth_at_all_gives_an_empty_file() {
        let mut conn = db();
        import(&mut conn, FIXTURE, ImportMode::Replace, false).unwrap();
        let file = export(&conn, Some(&HashSet::new())).unwrap();
        assert_eq!((file["spots"].as_array().unwrap().len(), file["programs"].as_array().unwrap().len()), (0, 0));
    }

    #[test]
    fn a_dry_run_reports_without_changing_anything() {
        let mut conn = db();
        let report = import(&mut conn, FIXTURE, ImportMode::Replace, true).unwrap();
        assert_eq!(report["spots"], 3);
        assert_eq!(count(&conn, "range_spots"), 0);
        assert_eq!(count(&conn, "range_actions"), 6, "the base palette is untouched");
    }

    #[test]
    fn merging_reuses_actions_with_the_same_label() {
        let mut conn = db();
        import(&mut conn, FIXTURE, ImportMode::Replace, false).unwrap();
        let before = count(&conn, "range_actions");
        let report = import(&mut conn, FIXTURE, ImportMode::Merge, false).unwrap();
        assert_eq!(count(&conn, "range_actions"), before);
        assert_eq!(report["actions"], 0);
        assert_eq!(count(&conn, "range_spots"), 3, "spots of the same name are replaced, not added");
        assert_eq!(count(&conn, "range_programs"), 1);
        assert_eq!(count(&conn, "range_program_spots"), 2);
    }

    #[test]
    fn unknown_hands_and_actions_are_reported_and_nothing_breaks() {
        let mut file: Value = serde_json::from_str(FIXTURE).unwrap();
        file["spots"][0]["scenarios"][0]["hands"]["ZZs"] = json!("Fold");
        file["spots"][0]["scenarios"][0]["hands"]["AKs"] = json!("Missing action");
        file["spots"][0]["scenarios"][0]["hands"].as_object_mut().unwrap().remove("72o");
        let mut conn = db();
        let report = import(&mut conn, &file.to_string(), ImportMode::Replace, false).unwrap();
        let warnings: Vec<String> = report["warnings"].as_array().unwrap().iter().map(|w| w.as_str().unwrap().to_string()).collect();
        assert!(warnings.iter().any(|w| w.contains("unknown hand ZZs")), "{warnings:?}");
        assert!(warnings.iter().any(|w| w.contains("unknown action Missing action")), "{warnings:?}");
        assert!(warnings.iter().any(|w| w.contains("incomplete range")), "{warnings:?}");
        assert_eq!(count(&conn, "range_hands"), 4 * 169, "every range stays complete");
    }

    #[test]
    fn a_file_that_is_not_ours_changes_nothing() {
        let mut conn = db();
        import(&mut conn, FIXTURE, ImportMode::Replace, false).unwrap();
        for bad in ["not json", r#"{"format":"other","version":1}"#, r#"{"format":"spintracker-ranges","version":2}"#, r#"{"format":"spintracker-ranges","version":1}"#] {
            assert!(matches!(import(&mut conn, bad, ImportMode::Replace, false), Err(RangeError::Invalid(_))), "{bad}");
        }
        assert_eq!(count(&conn, "range_spots"), 3);
    }

    #[test]
    fn a_spot_with_a_broken_situation_is_skipped() {
        let mut file: Value = serde_json::from_str(FIXTURE).unwrap();
        file["spots"][1]["line"] = json!("BTN:dance");
        let mut conn = db();
        let report = import(&mut conn, &file.to_string(), ImportMode::Replace, false).unwrap();
        assert_eq!(report["spots"], 2);
        assert!(report["warnings"].as_array().unwrap().iter().any(|w| w.as_str().unwrap().contains("unreadable situation")));
        assert_eq!(count(&conn, "range_program_spots"), 1, "the program keeps only the spots that exist");
    }
}
