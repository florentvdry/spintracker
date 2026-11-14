//! The player's own preflop ranges: palette of actions, situations ("spots"), one range per stack
//! depth, programs and settings. SpinTracker ships no range: everything here is the player's data.
//!
//! The database does not enforce foreign keys, so every deletion cascades by hand inside one
//! transaction.

use std::collections::{BTreeMap, HashMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::engines::range_scenarios::{default_name, hand_classes, is_hand_class, parse_hex};
use crate::Error;

const FORMATS: [&str; 2] = ["3max", "hu"];
const POSITIONS_3MAX: [&str; 3] = ["BTN", "SB", "BB"];
const POSITIONS_HU: [&str; 2] = ["SB", "BB"];
const LINE_VERBS: [&str; 4] = ["fold", "call", "raise", "all-in"];
const IMMEDIATES: [&str; 8] = ["fold", "check", "call", "limp", "raise", "iso", "threebet", "allin"];
const SIZE_UNITS: [&str; 3] = ["bb", "x", "pct_stack"];
const RESPONSES: [&str; 4] = ["none", "fold", "call", "allin"];
const OPPONENTS: [&str; 2] = ["any", "reg"];
const MAX_LABEL_CHARS: usize = 40;
const MAX_NAME_CHARS: usize = 80;
const MAX_STACK_BB: f64 = 200.0;
const MAX_NEW_CARDS_PER_DAY: i64 = 500;
const MAX_DEFAULT_STACKS: usize = 20;

/// A failure the caller can tell apart: a bad request, a clash with existing data, a missing row.
#[derive(Debug)]
pub enum RangeError {
    Invalid(String),
    /// The data clashes with a row that exists; `existing_id` is that row when it is a spot.
    Conflict { message: String, existing_id: Option<i64> },
    NotFound,
    Other(Error),
}

impl From<Error> for RangeError {
    fn from(e: Error) -> Self {
        Self::Other(e)
    }
}

impl From<rusqlite::Error> for RangeError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Other(e.into())
    }
}

impl From<serde_json::Error> for RangeError {
    fn from(e: serde_json::Error) -> Self {
        Self::Other(e.into())
    }
}

pub type Res<T> = std::result::Result<T, RangeError>;

fn invalid<T>(message: impl Into<String>) -> Res<T> {
    Err(RangeError::Invalid(message.into()))
}

pub(crate) fn now() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

// ---------------------------------------------------------------------------------------------
// Actions (the palette)
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionInput {
    #[serde(default)]
    pub id: Option<i64>,
    pub label: String,
    pub color: String,
    pub immediate: String,
    #[serde(default)]
    pub size_value: Option<f64>,
    #[serde(default)]
    pub size_unit: Option<String>,
    #[serde(default = "default_response")]
    pub response: String,
}

fn default_response() -> String {
    "none".into()
}

pub(crate) fn validate_action(a: &ActionInput) -> Res<()> {
    let label = a.label.trim();
    if label.is_empty() || label.chars().count() > MAX_LABEL_CHARS {
        return invalid(format!("an action label has 1 to {MAX_LABEL_CHARS} characters"));
    }
    if parse_hex(&a.color).is_none() {
        return invalid("a colour is a hex value such as #5b8def");
    }
    if !IMMEDIATES.contains(&a.immediate.as_str()) {
        return invalid(format!("unknown immediate action: {}", a.immediate));
    }
    if !RESPONSES.contains(&a.response.as_str()) {
        return invalid(format!("unknown response: {}", a.response));
    }
    match (&a.size_value, &a.size_unit) {
        (None, None) => {}
        (Some(v), Some(u)) if *v > 0.0 && v.is_finite() && SIZE_UNITS.contains(&u.as_str()) => {}
        _ => return invalid("a size needs a positive value and a unit (bb, x or pct_stack)"),
    }
    Ok(())
}

pub fn list_actions(conn: &Connection) -> Res<Value> {
    let mut stmt = conn.prepare(
        "SELECT a.id, a.label, a.color, a.immediate, a.size_value, a.size_unit, a.response, a.sort_order,
                (SELECT COUNT(*) FROM range_hands h WHERE h.action_id = a.id)
         FROM range_actions a ORDER BY a.sort_order, a.id",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?, "label": r.get::<_, String>(1)?, "color": r.get::<_, String>(2)?,
                "immediate": r.get::<_, String>(3)?, "sizeValue": r.get::<_, Option<f64>>(4)?, "sizeUnit": r.get::<_, Option<String>>(5)?,
                "response": r.get::<_, String>(6)?, "sortOrder": r.get::<_, i64>(7)?, "usedHands": r.get::<_, i64>(8)?,
            }))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(Value::Array(rows))
}

/// Creates or updates the given actions; their order in the list becomes the palette order.
/// Actions left out of the list are kept (they are removed with `delete_action`).
pub fn save_actions(conn: &mut Connection, actions: &[ActionInput]) -> Res<Value> {
    for a in actions {
        validate_action(a)?;
    }
    let tx = conn.transaction()?;
    for (order, a) in actions.iter().enumerate() {
        let label = a.label.trim();
        let clash: Option<i64> =
            tx.query_row("SELECT id FROM range_actions WHERE label = ?1 AND id IS NOT ?2", params![label, a.id], |r| r.get(0)).optional()?;
        if clash.is_some() {
            return Err(RangeError::Conflict { message: format!("an action named {label} already exists"), existing_id: None });
        }
        let (size_value, size_unit) = (a.size_value, a.size_unit.as_deref());
        match a.id {
            Some(id) => {
                let changed = tx.execute(
                    "UPDATE range_actions SET label = ?1, color = ?2, immediate = ?3, size_value = ?4, size_unit = ?5, response = ?6, sort_order = ?7 WHERE id = ?8",
                    params![label, a.color, a.immediate, size_value, size_unit, a.response, order as i64, id],
                )?;
                if changed == 0 {
                    return Err(RangeError::NotFound);
                }
            }
            None => {
                tx.execute(
                    "INSERT INTO range_actions (label, color, immediate, size_value, size_unit, response, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![label, a.color, a.immediate, size_value, size_unit, a.response, order as i64],
                )?;
            }
        }
    }
    crate::services::range_adherence::invalidate(&tx)?;
    tx.commit()?;
    list_actions(conn)
}

/// Removes an action. When ranges use it, `replace_with` must name another action that takes over
/// their hands.
pub fn delete_action(conn: &mut Connection, id: i64, replace_with: Option<i64>) -> Res<()> {
    let tx = conn.transaction()?;
    let exists: bool = tx.query_row("SELECT COUNT(*) FROM range_actions WHERE id = ?1", [id], |r| r.get::<_, i64>(0))? > 0;
    if !exists {
        return Err(RangeError::NotFound);
    }
    let used: i64 = tx.query_row("SELECT COUNT(*) FROM range_hands WHERE action_id = ?1", [id], |r| r.get(0))?;
    if used > 0 {
        let Some(target) = replace_with.filter(|t| *t != id) else {
            return invalid(format!("{used} hands use this action: choose a replacement"));
        };
        let target_exists: bool = tx.query_row("SELECT COUNT(*) FROM range_actions WHERE id = ?1", [target], |r| r.get::<_, i64>(0))? > 0;
        if !target_exists {
            return invalid("the replacement action does not exist");
        }
        tx.execute("UPDATE range_hands SET action_id = ?1 WHERE action_id = ?2", params![target, id])?;
    }
    tx.execute("DELETE FROM range_actions WHERE id = ?1", [id])?;
    crate::services::range_adherence::invalidate(&tx)?;
    tx.commit()?;
    Ok(())
}

pub(crate) fn first_action(tx: &Transaction) -> Res<i64> {
    let id: Option<i64> = tx.query_row("SELECT id FROM range_actions ORDER BY sort_order, id LIMIT 1", [], |r| r.get(0)).optional()?;
    id.ok_or_else(|| RangeError::Invalid("the action palette is empty".into()))
}

// ---------------------------------------------------------------------------------------------
// Spots and scenarios
// ---------------------------------------------------------------------------------------------

/// Where the hands of a new range come from.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StartPoint {
    /// "empty" (every hand in the first action), "spot" (another spot's range) or "depth" (another
    /// depth of the same spot).
    pub kind: String,
    pub spot_id: Option<i64>,
    pub stack_bb: Option<f64>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SpotInput {
    pub id: Option<i64>,
    pub name: String,
    pub format: String,
    pub hero_position: String,
    pub line: String,
    pub line_sizes: Option<Value>,
    pub opponent: String,
    pub study_only: bool,
    /// Depths to create (new spots only; later depths go through `add_depth`).
    pub depths: Vec<f64>,
    pub start: StartPoint,
}

/// The line normalised to the form `engines::range_scenarios::canonical_line` produces
/// ("btn:fold,sb:call"), checked against the seats that speak before the hero.
pub(crate) fn normalize_line(format: &str, hero: &str, line: &str) -> Res<String> {
    let seats: &[&str] = if format == "hu" { &POSITIONS_HU } else { &POSITIONS_3MAX };
    let Some(hero_index) = seats.iter().position(|p| *p == hero) else {
        return invalid(format!("{hero} does not play {format}"));
    };
    let entries: Vec<&str> = line.split(',').map(str::trim).filter(|e| !e.is_empty()).collect();
    if entries.len() != hero_index {
        return invalid(format!("the line must hold the {hero_index} actions before the hero"));
    }
    let mut out = Vec::new();
    for (entry, seat) in entries.iter().zip(seats) {
        let Some((pos, verb)) = entry.split_once(':') else { return invalid(format!("bad line entry: {entry}")) };
        let (pos, verb) = (pos.trim().to_uppercase(), verb.trim().to_lowercase());
        if pos != *seat || !LINE_VERBS.contains(&verb.as_str()) {
            return invalid(format!("bad line entry: {entry}"));
        }
        out.push(format!("{}:{verb}", pos.to_lowercase()));
    }
    Ok(out.join(","))
}

pub(crate) fn validate_depth(stack: f64) -> Res<()> {
    if stack.is_finite() && stack > 0.0 && stack <= MAX_STACK_BB {
        Ok(())
    } else {
        invalid(format!("a depth is between 0 and {MAX_STACK_BB} bb"))
    }
}

fn spot_exists_with_situation(tx: &Transaction, format: &str, hero: &str, line: &str, opponent: &str, except: Option<i64>) -> Res<Option<i64>> {
    Ok(tx
        .query_row(
            "SELECT id FROM range_spots WHERE format = ?1 AND hero_position = ?2 AND line = ?3 AND opponent = ?4 AND id IS NOT ?5",
            params![format, hero, line, opponent, except],
            |r| r.get(0),
        )
        .optional()?)
}

fn insert_scenario(tx: &Transaction, spot_id: i64, stack: f64, start: &StartPoint, own_spot: i64) -> Res<i64> {
    validate_depth(stack)?;
    let taken: bool = tx.query_row("SELECT COUNT(*) FROM range_scenarios WHERE spot_id = ?1 AND stack_bb = ?2", params![spot_id, stack], |r| r.get::<_, i64>(0))? > 0;
    if taken {
        return Err(RangeError::Conflict { message: format!("{stack} bb already exists for this scenario"), existing_id: Some(spot_id) });
    }
    tx.execute("INSERT INTO range_scenarios (spot_id, stack_bb, updated_at) VALUES (?1, ?2, ?3)", params![spot_id, stack, now()])?;
    let scenario_id = tx.last_insert_rowid();

    let source = match start.kind.as_str() {
        "spot" => start.spot_id.map(|s| closest_depth(tx, s, stack)).transpose()?.flatten(),
        "depth" => match start.stack_bb {
            Some(from) => tx
                .query_row("SELECT id FROM range_scenarios WHERE spot_id = ?1 AND stack_bb = ?2", params![own_spot, from], |r| r.get(0))
                .optional()?,
            None => None,
        },
        _ => None,
    };
    let fallback = first_action(tx)?;
    let mut hands: HashMap<String, i64> = HashMap::new();
    if let Some(source) = source {
        let mut stmt = tx.prepare("SELECT hand, action_id FROM range_hands WHERE scenario_id = ?1")?;
        for row in stmt.query_map([source], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))? {
            let (hand, action) = row?;
            hands.insert(hand, action);
        }
    } else if matches!(start.kind.as_str(), "spot" | "depth") {
        return invalid("the range to copy does not exist");
    }
    let mut insert = tx.prepare("INSERT INTO range_hands (scenario_id, hand, action_id, weight) VALUES (?1, ?2, ?3, 1.0)")?;
    for hand in hand_classes() {
        insert.execute(params![scenario_id, hand, hands.get(&hand).copied().unwrap_or(fallback)])?;
    }
    Ok(scenario_id)
}

/// The scenario of `spot_id` whose depth is the closest to `stack`.
fn closest_depth(tx: &Transaction, spot_id: i64, stack: f64) -> Res<Option<i64>> {
    Ok(tx
        .query_row(
            "SELECT id FROM range_scenarios WHERE spot_id = ?1 ORDER BY ABS(stack_bb - ?2), stack_bb LIMIT 1",
            params![spot_id, stack],
            |r| r.get(0),
        )
        .optional()?)
}

/// Creates a spot with one range per depth, or updates the situation of an existing spot.
/// Returns the spot id.
pub fn save_spot(conn: &mut Connection, input: &SpotInput) -> Res<i64> {
    if !FORMATS.contains(&input.format.as_str()) {
        return invalid(format!("unknown format: {}", input.format));
    }
    let hero = input.hero_position.to_uppercase();
    let line = normalize_line(&input.format, &hero, &input.line)?;
    let opponent = if input.opponent.is_empty() { "any" } else { input.opponent.as_str() };
    if !OPPONENTS.contains(&opponent) {
        return invalid(format!("unknown opponent: {opponent}"));
    }
    let name = match input.name.trim() {
        "" => default_name(&input.format, &hero, &line.to_lowercase(), opponent),
        n if n.chars().count() <= MAX_NAME_CHARS => n.to_string(),
        _ => return invalid(format!("a name has at most {MAX_NAME_CHARS} characters")),
    };
    let sizes = input.line_sizes.as_ref().filter(|v| !v.is_null()).map(Value::to_string);

    let tx = conn.transaction()?;
    if let Some(existing) = spot_exists_with_situation(&tx, &input.format, &hero, &line, opponent, input.id)? {
        return Err(RangeError::Conflict { message: "this scenario already exists".into(), existing_id: Some(existing) });
    }
    let name_clash: Option<i64> = tx.query_row("SELECT id FROM range_spots WHERE name = ?1 AND id IS NOT ?2", params![name, input.id], |r| r.get(0)).optional()?;
    if name_clash.is_some() {
        return Err(RangeError::Conflict { message: format!("a scenario named {name} already exists"), existing_id: name_clash });
    }

    let id = match input.id {
        Some(id) => {
            let changed = tx.execute(
                "UPDATE range_spots SET name = ?1, format = ?2, hero_position = ?3, line = ?4, line_sizes = ?5, opponent = ?6, study_only = ?7, updated_at = ?8 WHERE id = ?9",
                params![name, input.format, hero, line, sizes, opponent, input.study_only, now(), id],
            )?;
            if changed == 0 {
                return Err(RangeError::NotFound);
            }
            id
        }
        None => {
            if input.depths.is_empty() {
                return invalid("at least one depth is required");
            }
            let stamp = now();
            tx.execute(
                "INSERT INTO range_spots (name, format, hero_position, line, line_sizes, opponent, study_only, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
                params![name, input.format, hero, line, sizes, opponent, input.study_only, stamp],
            )?;
            let id = tx.last_insert_rowid();
            for depth in &input.depths {
                insert_scenario(&tx, id, *depth, &input.start, id)?;
            }
            id
        }
    };
    crate::services::range_adherence::invalidate(&tx)?;
    tx.commit()?;
    Ok(id)
}

/// Removes ranges and everything that hangs off them.
pub(crate) fn purge_scenarios(tx: &Transaction, scenario_ids: &[i64]) -> Res<()> {
    for id in scenario_ids {
        tx.execute("DELETE FROM range_hands WHERE scenario_id = ?1", [id])?;
        tx.execute("DELETE FROM range_scenarios WHERE id = ?1", [id])?;
    }
    Ok(())
}

fn scenario_ids_of(tx: &Transaction, spot_id: i64) -> Res<Vec<i64>> {
    let mut stmt = tx.prepare("SELECT id FROM range_scenarios WHERE spot_id = ?1")?;
    let ids = stmt.query_map([spot_id], |r| r.get(0))?.collect::<std::result::Result<Vec<i64>, _>>()?;
    Ok(ids)
}

pub fn delete_spot(conn: &mut Connection, id: i64) -> Res<()> {
    let tx = conn.transaction()?;
    let exists: bool = tx.query_row("SELECT COUNT(*) FROM range_spots WHERE id = ?1", [id], |r| r.get::<_, i64>(0))? > 0;
    if !exists {
        return Err(RangeError::NotFound);
    }
    let scenarios = scenario_ids_of(&tx, id)?;
    purge_scenarios(&tx, &scenarios)?;
    tx.execute("DELETE FROM range_program_spots WHERE spot_id = ?1", [id])?;
    tx.execute("DELETE FROM range_spots WHERE id = ?1", [id])?;
    crate::services::range_adherence::invalidate(&tx)?;
    tx.commit()?;
    Ok(())
}

/// Copies a spot with every depth to the other opponent kind (a situation exists once per
/// opponent kind), or to `opponent` when given. Returns the new spot id.
pub fn duplicate_spot(conn: &mut Connection, id: i64, opponent: Option<&str>) -> Res<i64> {
    let spot = spot_row(conn, id)?.ok_or(RangeError::NotFound)?;
    let target = match opponent {
        Some(o) if OPPONENTS.contains(&o) => o.to_string(),
        Some(o) => return invalid(format!("unknown opponent: {o}")),
        None => if spot.opponent == "reg" { "any" } else { "reg" }.to_string(),
    };
    let depths: Vec<f64> = {
        let mut stmt = conn.prepare("SELECT stack_bb FROM range_scenarios WHERE spot_id = ?1 ORDER BY stack_bb DESC")?;
        let rows = stmt.query_map([id], |r| r.get(0))?.collect::<std::result::Result<Vec<f64>, _>>()?;
        rows
    };
    let input = SpotInput {
        id: None,
        name: default_name(&spot.format, &spot.hero_position, &spot.line.to_lowercase(), &target),
        format: spot.format,
        hero_position: spot.hero_position,
        line: spot.line,
        line_sizes: spot.line_sizes.and_then(|s| serde_json::from_str(&s).ok()),
        opponent: target,
        study_only: spot.study_only,
        depths,
        start: StartPoint { kind: "spot".into(), spot_id: Some(id), stack_bb: None },
    };
    save_spot(conn, &input)
}

struct SpotRow {
    format: String,
    hero_position: String,
    line: String,
    line_sizes: Option<String>,
    opponent: String,
    study_only: bool,
}

fn spot_row(conn: &Connection, id: i64) -> Res<Option<SpotRow>> {
    Ok(conn
        .query_row("SELECT format, hero_position, line, line_sizes, opponent, study_only FROM range_spots WHERE id = ?1", [id], |r| {
            Ok(SpotRow {
                format: r.get(0)?,
                hero_position: r.get(1)?,
                line: r.get(2)?,
                line_sizes: r.get(3)?,
                opponent: r.get(4)?,
                study_only: r.get::<_, i64>(5)? != 0,
            })
        })
        .optional()?)
}

/// Adds a depth to a spot.
pub fn add_depth(conn: &mut Connection, spot_id: i64, stack: f64, start: &StartPoint) -> Res<i64> {
    let tx = conn.transaction()?;
    if spot_row(&tx, spot_id)?.is_none() {
        return Err(RangeError::NotFound);
    }
    let id = insert_scenario(&tx, spot_id, stack, start, spot_id)?;
    crate::services::range_adherence::invalidate(&tx)?;
    tx.commit()?;
    Ok(id)
}

/// Removes one depth; the last depth of a spot goes with the spot (`delete_spot`).
pub fn remove_depth(conn: &mut Connection, scenario_id: i64) -> Res<()> {
    let tx = conn.transaction()?;
    let spot: Option<i64> = tx.query_row("SELECT spot_id FROM range_scenarios WHERE id = ?1", [scenario_id], |r| r.get(0)).optional()?;
    let Some(spot) = spot else { return Err(RangeError::NotFound) };
    let siblings: i64 = tx.query_row("SELECT COUNT(*) FROM range_scenarios WHERE spot_id = ?1", [spot], |r| r.get(0))?;
    if siblings <= 1 {
        return invalid("a scenario keeps at least one depth: delete the scenario instead");
    }
    purge_scenarios(&tx, &[scenario_id])?;
    crate::services::range_adherence::invalidate(&tx)?;
    tx.commit()?;
    Ok(())
}

/// One range with its stored hands (hand -> action id).
pub fn scenario(conn: &Connection, id: i64) -> Res<Value> {
    let head: Option<(i64, f64)> = conn.query_row("SELECT spot_id, stack_bb FROM range_scenarios WHERE id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).optional()?;
    let Some((spot_id, stack)) = head else { return Err(RangeError::NotFound) };
    let mut hands = BTreeMap::new();
    let mut stmt = conn.prepare("SELECT hand, action_id FROM range_hands WHERE scenario_id = ?1")?;
    for row in stmt.query_map([id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))? {
        let (hand, action) = row?;
        hands.insert(hand, action);
    }
    Ok(json!({ "id": id, "spotId": spot_id, "stackBb": stack, "hands": hands }))
}

/// Stores painted hands (hand -> action id); the other hands keep their action.
pub fn save_hands(conn: &mut Connection, scenario_id: i64, hands: &BTreeMap<String, i64>) -> Res<()> {
    for hand in hands.keys() {
        if !is_hand_class(hand) {
            return invalid(format!("unknown hand: {hand}"));
        }
    }
    let tx = conn.transaction()?;
    let exists: bool = tx.query_row("SELECT COUNT(*) FROM range_scenarios WHERE id = ?1", [scenario_id], |r| r.get::<_, i64>(0))? > 0;
    if !exists {
        return Err(RangeError::NotFound);
    }
    let known: HashSet<i64> = {
        let mut stmt = tx.prepare("SELECT id FROM range_actions")?;
        let ids = stmt.query_map([], |r| r.get(0))?.collect::<std::result::Result<HashSet<i64>, _>>()?;
        ids
    };
    for (hand, action) in hands {
        if !known.contains(action) {
            return invalid(format!("unknown action for {hand}"));
        }
        tx.execute(
            "INSERT INTO range_hands (scenario_id, hand, action_id, weight) VALUES (?1, ?2, ?3, 1.0)
             ON CONFLICT(scenario_id, hand) DO UPDATE SET action_id = excluded.action_id",
            params![scenario_id, hand, action],
        )?;
    }
    tx.execute("UPDATE range_scenarios SET updated_at = ?1 WHERE id = ?2", params![now(), scenario_id])?;
    crate::services::range_adherence::invalidate(&tx)?;
    tx.commit()?;
    Ok(())
}

/// Every spot with its depths, and the programs.
pub fn tree(conn: &Connection) -> Res<Value> {
    let mut depths: HashMap<i64, Vec<Value>> = HashMap::new();
    {
        let mut stmt = conn.prepare("SELECT id, spot_id, stack_bb FROM range_scenarios ORDER BY stack_bb DESC")?;
        for row in stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, f64>(2)?)))? {
            let (id, spot, stack) = row?;
            depths.entry(spot).or_default().push(json!({ "id": id, "stackBb": stack }));
        }
    }
    let mut stmt = conn.prepare("SELECT id, name, format, hero_position, line, line_sizes, opponent, study_only FROM range_spots ORDER BY id")?;
    let spots = stmt
        .query_map([], |r| {
            let id: i64 = r.get(0)?;
            let sizes: Option<String> = r.get(5)?;
            Ok((id, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?, sizes, r.get::<_, String>(6)?, r.get::<_, i64>(7)? != 0))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let spots: Vec<Value> = spots
        .into_iter()
        .map(|(id, name, format, hero, line, sizes, opponent, study)| {
            json!({
                "id": id, "name": name, "format": format, "heroPosition": hero, "line": line,
                "lineSizes": sizes.and_then(|s| serde_json::from_str::<Value>(&s).ok()), "opponent": opponent, "studyOnly": study,
                "scenarios": depths.remove(&id).unwrap_or_default(),
            })
        })
        .collect();
    Ok(json!({ "spots": spots, "programs": programs(conn)? }))
}

// ---------------------------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ProgramInput {
    pub id: Option<i64>,
    pub name: String,
    pub spot_ids: Vec<i64>,
}

pub fn programs(conn: &Connection) -> Res<Value> {
    let mut members: HashMap<i64, Vec<i64>> = HashMap::new();
    {
        let mut stmt = conn.prepare("SELECT program_id, spot_id FROM range_program_spots ORDER BY sort_order, spot_id")?;
        for row in stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))? {
            let (program, spot) = row?;
            members.entry(program).or_default().push(spot);
        }
    }
    let mut stmt = conn.prepare("SELECT id, name, sort_order FROM range_programs ORDER BY sort_order, id")?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?)))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(Value::Array(
        rows.into_iter().map(|(id, name, order)| json!({ "id": id, "name": name, "sortOrder": order, "spotIds": members.remove(&id).unwrap_or_default() })).collect(),
    ))
}

/// Creates or renames a program and sets its scenarios, in the given order. Returns its id.
pub fn save_program(conn: &mut Connection, input: &ProgramInput) -> Res<i64> {
    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > MAX_NAME_CHARS {
        return invalid(format!("a program name has 1 to {MAX_NAME_CHARS} characters"));
    }
    let tx = conn.transaction()?;
    let clash: Option<i64> = tx.query_row("SELECT id FROM range_programs WHERE name = ?1 AND id IS NOT ?2", params![name, input.id], |r| r.get(0)).optional()?;
    if clash.is_some() {
        return Err(RangeError::Conflict { message: format!("a program named {name} already exists"), existing_id: None });
    }
    let id = match input.id {
        Some(id) => {
            if tx.execute("UPDATE range_programs SET name = ?1 WHERE id = ?2", params![name, id])? == 0 {
                return Err(RangeError::NotFound);
            }
            id
        }
        None => {
            let next: i64 = tx.query_row("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM range_programs", [], |r| r.get(0))?;
            tx.execute("INSERT INTO range_programs (name, sort_order) VALUES (?1, ?2)", params![name, next])?;
            tx.last_insert_rowid()
        }
    };
    tx.execute("DELETE FROM range_program_spots WHERE program_id = ?1", [id])?;
    let mut seen = HashSet::new();
    for (order, spot) in input.spot_ids.iter().filter(|s| seen.insert(**s)).enumerate() {
        let exists: bool = tx.query_row("SELECT COUNT(*) FROM range_spots WHERE id = ?1", [spot], |r| r.get::<_, i64>(0))? > 0;
        if !exists {
            return invalid(format!("unknown scenario: {spot}"));
        }
        tx.execute("INSERT INTO range_program_spots (program_id, spot_id, sort_order) VALUES (?1, ?2, ?3)", params![id, spot, order as i64])?;
    }
    tx.commit()?;
    Ok(id)
}

pub fn delete_program(conn: &mut Connection, id: i64) -> Res<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM range_program_spots WHERE program_id = ?1", [id])?;
    if tx.execute("DELETE FROM range_programs WHERE id = ?1", [id])? == 0 {
        return Err(RangeError::NotFound);
    }
    tx.commit()?;
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

/// A raw setting, or its default when the row is missing.
pub fn setting(conn: &Connection, key: &str) -> Res<Option<String>> {
    Ok(conn.query_row("SELECT value FROM range_settings WHERE key = ?1", [key], |r| r.get(0)).optional()?)
}

pub fn settings(conn: &Connection) -> Res<Value> {
    let stacks: Value = setting(conn, "default_stacks")?.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_else(|| json!([25, 20, 15, 10, 7]));
    let rule = setting(conn, "depth_rule")?.unwrap_or_else(|| "nearest".into());
    let cards: i64 = setting(conn, "new_cards_per_day")?.and_then(|s| s.parse().ok()).unwrap_or(20);
    let borderline = setting(conn, "prioritize_borderline")?.map_or(true, |s| s == "1");
    Ok(json!({ "defaultStacks": stacks, "depthRule": rule, "newCardsPerDay": cards, "prioritizeBorderline": borderline }))
}

fn put_setting(tx: &Transaction, key: &str, value: &str) -> Res<()> {
    tx.execute("INSERT INTO range_settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", params![key, value])?;
    Ok(())
}

/// Updates the settings present in `patch` (camelCase keys) and returns all of them.
pub fn update_settings(conn: &mut Connection, patch: &Value) -> Res<Value> {
    let tx = conn.transaction()?;
    if let Some(stacks) = patch.get("defaultStacks") {
        let mut list: Vec<f64> = match stacks.as_array() {
            Some(items) => items.iter().filter_map(Value::as_f64).collect(),
            None => return invalid("defaultStacks must be a list of numbers"),
        };
        if list.len() > MAX_DEFAULT_STACKS {
            return invalid(format!("at most {MAX_DEFAULT_STACKS} default depths"));
        }
        for stack in &list {
            validate_depth(*stack)?;
        }
        list.sort_by(|a, b| b.total_cmp(a));
        list.dedup();
        put_setting(&tx, "default_stacks", &serde_json::to_string(&list)?)?;
    }
    if let Some(rule) = patch.get("depthRule") {
        match rule.as_str() {
            Some(r @ ("nearest" | "below")) => put_setting(&tx, "depth_rule", r)?,
            _ => return invalid("depthRule is nearest or below"),
        }
    }
    if let Some(cards) = patch.get("newCardsPerDay") {
        match cards.as_i64() {
            Some(n) if (0..=MAX_NEW_CARDS_PER_DAY).contains(&n) => put_setting(&tx, "new_cards_per_day", &n.to_string())?,
            _ => return invalid(format!("newCardsPerDay is between 0 and {MAX_NEW_CARDS_PER_DAY}")),
        }
    }
    if let Some(flag) = patch.get("prioritizeBorderline") {
        match flag.as_bool() {
            Some(b) => put_setting(&tx, "prioritize_borderline", if b { "1" } else { "0" })?,
            None => return invalid("prioritizeBorderline is a boolean"),
        }
    }
    crate::services::range_adherence::invalidate(&tx)?;
    tx.commit()?;
    settings(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;

    fn db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations::run(&mut conn).unwrap();
        conn
    }

    fn spot(line: &str, hero: &str, opponent: &str, depths: &[f64]) -> SpotInput {
        SpotInput {
            format: "3max".into(),
            hero_position: hero.into(),
            line: line.into(),
            opponent: opponent.into(),
            depths: depths.to_vec(),
            start: StartPoint { kind: "empty".into(), ..Default::default() },
            ..Default::default()
        }
    }

    fn count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn a_new_database_holds_the_base_actions_and_no_scenario() {
        let conn = db();
        assert_eq!(count(&conn, "range_actions"), 6);
        assert_eq!(count(&conn, "range_spots"), 0);
        assert_eq!(settings(&conn).unwrap()["defaultStacks"], json!([25, 20, 15, 10, 7]));
    }

    #[test]
    fn creating_a_spot_fills_every_depth_with_the_first_action() {
        let mut conn = db();
        let id = save_spot(&mut conn, &spot("BTN:fold,SB:call", "BB", "reg", &[20.0, 10.0])).unwrap();
        assert_eq!(count(&conn, "range_scenarios"), 2);
        assert_eq!(count(&conn, "range_hands"), 2 * 169);
        let name: String = conn.query_row("SELECT name FROM range_spots WHERE id = ?1", [id], |r| r.get(0)).unwrap();
        assert_eq!(name, "BB vs SB limp · Reg");
        let fold: i64 = conn.query_row("SELECT id FROM range_actions WHERE label = 'Fold'", [], |r| r.get(0)).unwrap();
        assert_eq!(conn.query_row("SELECT COUNT(*) FROM range_hands WHERE action_id = ?1", [fold], |r| r.get::<_, i64>(0)).unwrap(), 2 * 169);
    }

    #[test]
    fn a_situation_exists_once_per_opponent_kind() {
        let mut conn = db();
        let first = save_spot(&mut conn, &spot("", "BTN", "any", &[15.0])).unwrap();
        match save_spot(&mut conn, &spot("", "BTN", "any", &[10.0])) {
            Err(RangeError::Conflict { existing_id, .. }) => assert_eq!(existing_id, Some(first)),
            other => panic!("expected a conflict, got {other:?}"),
        }
        save_spot(&mut conn, &spot("", "BTN", "reg", &[15.0])).expect("the reg variant coexists");
    }

    #[test]
    fn the_line_must_match_the_seats_before_the_hero() {
        let mut conn = db();
        assert!(matches!(save_spot(&mut conn, &spot("BTN:fold", "BB", "any", &[10.0])), Err(RangeError::Invalid(_))));
        assert!(matches!(save_spot(&mut conn, &spot("SB:fold,BTN:fold", "BB", "any", &[10.0])), Err(RangeError::Invalid(_))));
        assert!(matches!(save_spot(&mut conn, &spot("", "BTN", "any", &[])), Err(RangeError::Invalid(_))));
        let mut hu = spot("SB:call", "BB", "any", &[10.0]);
        hu.format = "hu".into();
        save_spot(&mut conn, &hu).expect("heads-up line");
    }

    #[test]
    fn deleting_a_spot_removes_its_ranges_hands_and_program_links() {
        let mut conn = db();
        let id = save_spot(&mut conn, &spot("", "BTN", "any", &[15.0, 10.0])).unwrap();
        let other = save_spot(&mut conn, &spot("", "BTN", "reg", &[15.0])).unwrap();
        save_program(&mut conn, &ProgramInput { name: "Week 1".into(), spot_ids: vec![id, other], ..Default::default() }).unwrap();
        delete_spot(&mut conn, id).unwrap();
        assert_eq!(count(&conn, "range_spots"), 1);
        assert_eq!(count(&conn, "range_scenarios"), 1);
        assert_eq!(count(&conn, "range_hands"), 169);
        assert_eq!(count(&conn, "range_program_spots"), 1);
        assert!(matches!(delete_spot(&mut conn, id), Err(RangeError::NotFound)));
    }

    #[test]
    fn an_action_in_use_needs_a_replacement() {
        let mut conn = db();
        save_spot(&mut conn, &spot("", "BTN", "any", &[15.0])).unwrap();
        let ids: Vec<i64> = conn.prepare("SELECT id FROM range_actions ORDER BY sort_order").unwrap().query_map([], |r| r.get(0)).unwrap().map(|r| r.unwrap()).collect();
        let (fold, call) = (ids[0], ids[2]);
        assert!(matches!(delete_action(&mut conn, fold, None), Err(RangeError::Invalid(_))));
        assert!(matches!(delete_action(&mut conn, fold, Some(fold)), Err(RangeError::Invalid(_))));
        delete_action(&mut conn, fold, Some(call)).unwrap();
        assert_eq!(conn.query_row("SELECT COUNT(*) FROM range_hands WHERE action_id = ?1", [call], |r| r.get::<_, i64>(0)).unwrap(), 169);
        delete_action(&mut conn, ids[5], None).expect("an unused action goes without a replacement");
    }

    #[test]
    fn painting_a_range_keeps_the_other_hands() {
        let mut conn = db();
        save_spot(&mut conn, &spot("", "BTN", "any", &[15.0])).unwrap();
        let scenario_id: i64 = conn.query_row("SELECT id FROM range_scenarios", [], |r| r.get(0)).unwrap();
        let raise: i64 = conn.query_row("SELECT id FROM range_actions WHERE label = 'Raise'", [], |r| r.get(0)).unwrap();
        save_hands(&mut conn, scenario_id, &BTreeMap::from([("AKs".to_string(), raise)])).unwrap();
        let range = scenario(&conn, scenario_id).unwrap();
        assert_eq!(range["hands"]["AKs"], raise);
        assert_eq!(range["hands"].as_object().unwrap().len(), 169);
        assert!(matches!(save_hands(&mut conn, scenario_id, &BTreeMap::from([("KAs".to_string(), raise)])), Err(RangeError::Invalid(_))));
        assert!(matches!(save_hands(&mut conn, scenario_id, &BTreeMap::from([("AKs".to_string(), 999)])), Err(RangeError::Invalid(_))));
    }

    #[test]
    fn a_new_depth_can_copy_another_depth_of_the_spot() {
        let mut conn = db();
        let spot_id = save_spot(&mut conn, &spot("", "BTN", "any", &[15.0])).unwrap();
        let first: i64 = conn.query_row("SELECT id FROM range_scenarios", [], |r| r.get(0)).unwrap();
        let raise: i64 = conn.query_row("SELECT id FROM range_actions WHERE label = 'Raise'", [], |r| r.get(0)).unwrap();
        save_hands(&mut conn, first, &BTreeMap::from([("72o".to_string(), raise)])).unwrap();
        let second = add_depth(&mut conn, spot_id, 12.5, &StartPoint { kind: "depth".into(), stack_bb: Some(15.0), ..Default::default() }).unwrap();
        assert_eq!(scenario(&conn, second).unwrap()["hands"]["72o"], raise);
        assert!(matches!(add_depth(&mut conn, spot_id, 15.0, &StartPoint::default()), Err(RangeError::Conflict { .. })));
        remove_depth(&mut conn, second).unwrap();
        assert!(matches!(remove_depth(&mut conn, first), Err(RangeError::Invalid(_))), "the last depth stays");
    }

    #[test]
    fn duplicating_a_spot_creates_the_other_opponent_variant() {
        let mut conn = db();
        let id = save_spot(&mut conn, &spot("BTN:fold,SB:call", "BB", "any", &[20.0, 10.0])).unwrap();
        let copy = duplicate_spot(&mut conn, id, None).unwrap();
        let (opponent, name): (String, String) = conn.query_row("SELECT opponent, name FROM range_spots WHERE id = ?1", [copy], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!((opponent.as_str(), name.as_str()), ("reg", "BB vs SB limp · Reg"));
        assert_eq!(count(&conn, "range_scenarios"), 4);
        assert!(matches!(duplicate_spot(&mut conn, id, None), Err(RangeError::Conflict { .. })));
    }

    #[test]
    fn settings_are_validated_and_stored() {
        let mut conn = db();
        let updated = update_settings(&mut conn, &json!({ "defaultStacks": [10, 25, 15, 25], "depthRule": "below", "newCardsPerDay": 30, "prioritizeBorderline": false })).unwrap();
        assert_eq!(updated["defaultStacks"], json!([25.0, 15.0, 10.0]));
        assert_eq!(updated["depthRule"], "below");
        assert!(matches!(update_settings(&mut conn, &json!({ "depthRule": "closest" })), Err(RangeError::Invalid(_))));
        assert!(matches!(update_settings(&mut conn, &json!({ "newCardsPerDay": -1 })), Err(RangeError::Invalid(_))));
    }

    #[test]
    fn actions_are_validated_and_labels_stay_unique() {
        let mut conn = db();
        let action = |label: &str| ActionInput {
            id: None,
            label: label.into(),
            color: "#a07cf0".into(),
            immediate: "iso".into(),
            size_value: Some(3.0),
            size_unit: Some("x".into()),
            response: "fold".into(),
        };
        save_actions(&mut conn, &[action("Iso 3x")]).unwrap();
        assert!(matches!(save_actions(&mut conn, &[action("Iso 3x")]), Err(RangeError::Conflict { .. })));
        assert!(matches!(save_actions(&mut conn, &[ActionInput { color: "purple".into(), ..action("Bad") }]), Err(RangeError::Invalid(_))));
        assert!(matches!(save_actions(&mut conn, &[ActionInput { size_unit: None, ..action("Bad size") }]), Err(RangeError::Invalid(_))));
        assert_eq!(count(&conn, "range_actions"), 7);
    }
}
