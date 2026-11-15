//! How well the hero follows their own ranges: the stored comparison of every preflop decision,
//! its summaries, and the check of a single hand.
//!
//! The stored rows are derived data. Any change to the ranges clears them (`invalidate`) and the
//! next read recomputes what is missing (`ensure_computed`), so they never describe old ranges.

use std::collections::{HashMap, HashSet};

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, OptionalExtension, ToSql};
use serde_json::{json, Value};

use crate::engines::actions::stack_in_bb;
use crate::engines::range_check::{evaluate, ActionDef, Check, DecisionInput, RangeBook, Status};
use crate::engines::range_scenarios::{Candidate, DepthRule};
use crate::repos::hands_query::hero_resolution_sql;
use crate::services::analysis::{hands_for_analysis, opponent_is_reg, regular_players, AnalysisFilters, AnalysisHand};
use crate::services::user_ranges;
use crate::Result;

/// Deviations listed in the detail of a scenario.
const RECENT_DEVIATIONS: i64 = 20;
/// Hands per query when reading the other players' stacks.
const STACK_CHUNK: usize = 400;
/// Lines shown as "without a range".
const FREQUENT_LINES: i64 = 3;

/// Clears the stored comparisons: the ranges they were computed from changed.
pub fn invalidate(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM hand_range_checks", [])?;
    Ok(())
}

fn load_book(conn: &Connection) -> Result<RangeBook> {
    let mut book = RangeBook { rule: Some(DepthRule::parse(&user_ranges::setting(conn, "depth_rule").ok().flatten().unwrap_or_default())), ..Default::default() };
    {
        let mut stmt = conn.prepare("SELECT id, label, immediate, size_value, size_unit, response FROM range_actions")?;
        for row in stmt.query_map([], |r| {
            Ok(ActionDef { id: r.get(0)?, label: r.get(1)?, immediate: r.get(2)?, size_value: r.get(3)?, size_unit: r.get(4)?, response: r.get(5)? })
        })? {
            let action = row?;
            book.actions.insert(action.id, action);
        }
    }
    {
        let mut stmt = conn.prepare(
            "SELECT sc.id, sc.spot_id, sp.format, sp.line, sp.opponent, sc.stack_bb FROM range_scenarios sc JOIN range_spots sp ON sp.id = sc.spot_id",
        )?;
        for row in stmt.query_map([], |r| {
            Ok(Candidate { scenario_id: r.get(0)?, spot_id: r.get(1)?, format: r.get(2)?, line: r.get(3)?, opponent: r.get(4)?, stack_bb: r.get(5)? })
        })? {
            book.candidates.push(row?);
        }
    }
    let mut stmt = conn.prepare("SELECT scenario_id, hand, action_id FROM range_hands")?;
    for row in stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?)))? {
        let (scenario, hand, action) = row?;
        book.hands.entry(scenario).or_default().insert(hand, action);
    }
    Ok(book)
}

/// Stacks of every player in the given hands: hand id -> (player, stack).
pub(crate) fn stacks_of(conn: &Connection, ids: &[&str]) -> Result<HashMap<String, Vec<(String, f64)>>> {
    let mut out: HashMap<String, Vec<(String, f64)>> = HashMap::new();
    for chunk in ids.chunks(STACK_CHUNK) {
        let marks = vec!["?"; chunk.len()].join(",");
        let mut stmt = conn.prepare(&format!("SELECT hand_id, player_name, stack FROM player_hands WHERE hand_id IN ({marks})"))?;
        let binds: Vec<&dyn ToSql> = chunk.iter().map(|id| id as &dyn ToSql).collect();
        for row in stmt.query_map(&binds[..], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<f64>>(2)?.unwrap_or(0.0))))? {
            let (hand, player, stack) = row?;
            out.entry(hand).or_default().push((player, stack));
        }
    }
    Ok(out)
}

/// The stack that decides the depth: the hero's, capped by the deepest opponent's.
fn effective_stack_bb(hand: &AnalysisHand, players: &[(String, f64)]) -> Option<f64> {
    let hero = hand.hero_name.as_deref().unwrap_or_default();
    let deepest_opponent = players.iter().filter(|(name, _)| !name.eq_ignore_ascii_case(hero)).map(|(_, stack)| *stack).fold(0.0, f64::max);
    let stack = if deepest_opponent > 0.0 { hand.hero_stack.min(deepest_opponent) } else { hand.hero_stack };
    stack_in_bb(stack, &hand.blinds)
}

fn check_of(hand: &AnalysisHand, stack_bb: f64, regulars: &HashSet<String>, book: &RangeBook) -> Check {
    let hero = hand.hero_name.as_deref().unwrap_or_default();
    evaluate(
        &DecisionInput {
            preflop: &hand.preflop,
            positions: &hand.player_positions,
            hero_position: &hand.hero_position,
            hero_name: hero,
            cards: hand.hero_cards.as_deref(),
            stack_bb,
            blinds: &hand.blinds,
            opponent_is_reg: opponent_is_reg(regulars, hand, Some(hero)),
        },
        book,
    )
}

fn played_at(hand: &AnalysisHand) -> String {
    hand.date.format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn ev_bb(hand: &AnalysisHand) -> Option<f64> {
    let bb = crate::engines::actions::big_blind(&hand.blinds) as f64;
    (bb > 0.0).then(|| hand.ev_chips.unwrap_or(hand.profit) / bb)
}

/// Computes the comparison of the hero's hands that have none yet. Returns how many were computed.
/// Without any scenario there is nothing to compare with and nothing is stored.
pub fn ensure_computed(conn: &mut Connection, hero: &str) -> Result<usize> {
    if hero.trim().is_empty() {
        return Ok(0);
    }
    let book = load_book(conn)?;
    if book.candidates.is_empty() {
        return Ok(0);
    }
    let all = hands_for_analysis(conn, &AnalysisFilters { hero_name: Some(hero.to_string()), ..Default::default() })?;
    let known: HashSet<String> = {
        let mut stmt = conn.prepare("SELECT hand_id FROM hand_range_checks")?;
        let ids = stmt.query_map([], |r| r.get(0))?.collect::<std::result::Result<HashSet<String>, _>>()?;
        ids
    };
    let missing: Vec<&AnalysisHand> = all.iter().filter(|h| !known.contains(&h.hand_id)).collect();
    if missing.is_empty() {
        return Ok(0);
    }
    let regulars = regular_players(conn)?;
    let ids: Vec<&str> = missing.iter().map(|h| h.hand_id.as_str()).collect();
    let stacks = stacks_of(conn, &ids)?;

    let tx = conn.transaction()?;
    {
        let mut insert = tx.prepare(
            "INSERT OR REPLACE INTO hand_range_checks
               (hand_id, hero_name, played_at, scenario_id, hand_class, cards, format, hero_position, line, expected_action_id,
                played_immediate, played_response, status, deviation_kind, depth_used_bb, stack_bb, ev_bb, computed_at, vs_reg)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
        )?;
        let now = user_ranges::now();
        for hand in &missing {
            let players = stacks.get(&hand.hand_id).map(Vec::as_slice).unwrap_or_default();
            let stack_bb = effective_stack_bb(hand, players);
            let check = match stack_bb {
                Some(stack) => check_of(hand, stack, &regulars, &book),
                None => skipped_check(),
            };
            insert.execute(params![
                hand.hand_id,
                hand.hero_name,
                played_at(hand),
                check.scenario_id,
                check.hand_class,
                hand.hero_cards,
                check.format,
                check.hero_position,
                check.line,
                check.expected_action_id,
                check.played_immediate,
                check.played_response,
                check.status.as_str(),
                check.deviation_kind,
                check.depth_used_bb,
                stack_bb,
                ev_bb(hand),
                now,
                opponent_is_reg(&regulars, hand, hand.hero_name.as_deref())
            ])?;
        }
    }
    tx.commit()?;
    Ok(missing.len())
}

/// A hand with no usable stack has no decision to compare.
fn skipped_check() -> Check {
    evaluate(&DecisionInput { preflop: "", positions: "", hero_position: "", hero_name: "", cards: None, stack_bb: 0.0, blinds: "", opponent_is_reg: false }, &RangeBook::default())
}

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

/// A date bound as the stored rows write it: the app's filters send "2026-11-01 00:00:00" while
/// `played_at` keeps the ISO "T", and the two only compare correctly in one format.
fn stored_bound(bound: &str) -> String {
    bound.replacen(' ', "T", 1)
}

/// Period and hero of a read: the SQL conditions on the stored rows and their parameters.
struct Scope {
    clauses: Vec<String>,
    binds: Vec<(String, SqlValue)>,
}

impl Scope {
    fn new(hero: &str, from: Option<&str>, to: Option<&str>) -> Self {
        let mut clauses = vec![format!("c.hero_name IN {}", hero_resolution_sql("@hero")), "c.status != 'skipped'".to_string()];
        let mut binds = vec![("@hero".to_string(), SqlValue::Text(hero.to_string()))];
        if let Some(from) = from.filter(|f| !f.is_empty()) {
            clauses.push("c.played_at >= @from".into());
            binds.push(("@from".into(), SqlValue::Text(stored_bound(from))));
        }
        if let Some(to) = to.filter(|t| !t.is_empty()) {
            let to = if to.len() == 10 { format!("{to}T23:59:59") } else { stored_bound(to) };
            clauses.push("c.played_at <= @to".into());
            binds.push(("@to".into(), SqlValue::Text(to)));
        }
        Self { clauses, binds }
    }

    fn and(mut self, clause: &str, name: &str, value: SqlValue) -> Self {
        self.clauses.push(clause.to_string());
        self.binds.push((name.to_string(), value));
        self
    }

    fn and_clause(mut self, clause: &str) -> Self {
        self.clauses.push(clause.to_string());
        self
    }

    fn where_sql(&self) -> String {
        self.clauses.join(" AND ")
    }

    fn params(&self) -> Vec<(&str, &dyn ToSql)> {
        self.binds.iter().map(|(n, v)| (n.as_str(), v as &dyn ToSql)).collect()
    }
}

/// The opponent filter of a read: "any" (fish), "reg", or none for both.
fn opponent_clause(opponent: Option<&str>) -> Option<&'static str> {
    match opponent {
        Some("any") => Some("c.vs_reg = 0"),
        Some("reg") => Some("c.vs_reg = 1"),
        _ => None,
    }
}

/// Counts of the stored rows by status.
#[derive(Default, Clone, Copy)]
struct Tally {
    matches: i64,
    deviations: i64,
    no_range: i64,
}

impl Tally {
    fn add(&mut self, status: &str, n: i64) {
        match status {
            "match" => self.matches += n,
            "deviation" => self.deviations += n,
            _ => self.no_range += n,
        }
    }

    fn json(self) -> Value {
        json!({ "compared": self.matches + self.deviations, "matches": self.matches, "deviations": self.deviations, "noRange": self.no_range })
    }
}

/// Seat order of the report: 3-handed first, then heads-up.
fn position_rank(format: &str, position: &str) -> usize {
    let seats = ["BTN", "SB", "BB"];
    let seat = seats.iter().position(|s| *s == position).unwrap_or(seats.len());
    (usize::from(format == "hu") * seats.len()) + seat
}

/// The palette action that stands for what was played, if the player has one.
fn played_action_id(book: &RangeBook, played: &str, response: Option<&str>) -> Option<i64> {
    let families: &[&str] = match played {
        "fold" => &["fold"],
        "check" => &["check"],
        "call" => &["call", "limp"],
        "limp" => &["limp", "call"],
        "raise" => &["raise", "iso", "threebet"],
        "allin" => &["allin"],
        _ => return None,
    };
    let mut actions: Vec<&ActionDef> = book.actions.values().collect();
    actions.sort_by_key(|a| a.id);
    // Several actions can share an immediate play (LIMP/FOLD, LIMP/CALL...): the answer tells them apart.
    families.iter().find_map(|family| {
        let same_play = || actions.iter().filter(|a| a.immediate == *family);
        let by_answer = response.and_then(|answer| same_play().find(|a| a.response == answer));
        by_answer.or_else(|| same_play().next()).map(|a| a.id)
    })
}

fn action_json(book: &RangeBook, conn: &Connection, id: i64) -> Value {
    let color: Option<String> = conn.query_row("SELECT color FROM range_actions WHERE id = ?1", [id], |r| r.get(0)).optional().ok().flatten();
    match book.actions.get(&id) {
        Some(action) => json!({ "id": id, "label": action.label, "color": color }),
        None => Value::Null,
    }
}

/// Totals, "without a range" lines and the table by scenario.
pub fn adherence(conn: &Connection, hero: &str, from: Option<&str>, to: Option<&str>, opponent: Option<&str>) -> Result<Value> {
    let book = load_book(conn)?;
    let mut scope = Scope::new(hero, from, to);
    if let Some(clause) = opponent_clause(opponent) {
        scope = scope.and_clause(clause);
    }
    let period = Scope::new(hero, from, to);

    // Fish and regulars, whatever the opponent filter: they are the switch of the report.
    let mut by_kind = [Tally::default(), Tally::default()];
    {
        let mut stmt = conn.prepare(&format!("SELECT c.vs_reg, c.status, COUNT(*) FROM hand_range_checks c WHERE {} GROUP BY c.vs_reg, c.status", period.where_sql()))?;
        for row in stmt.query_map(&period.params()[..], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?)))? {
            let (vs_reg, status, n) = row?;
            by_kind[usize::from(vs_reg != 0)].add(&status, n);
        }
    }

    let mut by_position: Vec<(String, String, Tally)> = Vec::new();
    {
        let mut stmt = conn.prepare(&format!(
            "SELECT COALESCE(c.format, ''), COALESCE(c.hero_position, ''), c.status, COUNT(*) FROM hand_range_checks c WHERE {} GROUP BY c.format, c.hero_position, c.status",
            scope.where_sql()
        ))?;
        for row in stmt.query_map(&scope.params()[..], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)?)))? {
            let (format, position, status, n) = row?;
            if format.is_empty() || position.is_empty() {
                continue;
            }
            match by_position.iter_mut().find(|(f, p, _)| *f == format && *p == position) {
                Some((_, _, tally)) => tally.add(&status, n),
                None => {
                    let mut tally = Tally::default();
                    tally.add(&status, n);
                    by_position.push((format, position, tally));
                }
            }
        }
    }
    by_position.sort_by_key(|(format, position, _)| position_rank(format, position));

    let (mut matches, mut deviations, mut response_deviations, mut no_range) = (0_i64, 0_i64, 0_i64, 0_i64);
    {
        let mut stmt = conn.prepare(&format!(
            "SELECT c.status, c.deviation_kind, COUNT(*) FROM hand_range_checks c WHERE {} GROUP BY c.status, c.deviation_kind",
            scope.where_sql()
        ))?;
        for row in stmt.query_map(&scope.params()[..], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, i64>(2)?)))? {
            let (status, kind, n) = row?;
            match status.as_str() {
                "match" => matches += n,
                "deviation" => {
                    deviations += n;
                    if kind.as_deref() == Some("response") {
                        response_deviations += n;
                    }
                }
                _ => no_range += n,
            }
        }
    }

    let frequent_lines: Vec<Value> = {
        let mut stmt = conn.prepare(&format!(
            "SELECT c.format, c.hero_position, c.line, COUNT(*) AS n FROM hand_range_checks c WHERE {} AND c.status = 'no_range'
             GROUP BY c.format, c.hero_position, c.line ORDER BY n DESC LIMIT {FREQUENT_LINES}",
            scope.where_sql()
        ))?;
        let rows = stmt
            .query_map(&scope.params()[..], |r| Ok(json!({ "format": r.get::<_, String>(0)?, "heroPosition": r.get::<_, String>(1)?, "line": r.get::<_, String>(2)?, "count": r.get::<_, i64>(3)? })))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        rows
    };

    // The most frequent deviation of every scenario.
    let mut top: HashMap<i64, (i64, Value)> = HashMap::new();
    {
        let mut stmt = conn.prepare(&format!(
            "SELECT c.scenario_id, c.expected_action_id, c.played_immediate, c.played_response, c.deviation_kind, COUNT(*) FROM hand_range_checks c
             WHERE {} AND c.status = 'deviation' GROUP BY c.scenario_id, c.expected_action_id, c.played_immediate, c.played_response, c.deviation_kind",
            scope.where_sql()
        ))?;
        for row in stmt.query_map(&scope.params()[..], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, String>(2)?, r.get::<_, Option<String>>(3)?, r.get::<_, Option<String>>(4)?, r.get::<_, i64>(5)?))
        })? {
            let (scenario, expected, played, response, kind, n) = row?;
            if top.get(&scenario).map_or(true, |(best, _)| n > *best) {
                top.insert(
                    scenario,
                    (n, json!({ "expectedActionId": expected, "playedImmediate": played, "playedActionId": played_action_id(&book, &played, response.as_deref()), "playedResponse": response, "kind": kind, "count": n })),
                );
            }
        }
    }

    let scenarios: Vec<Value> = {
        let mut stmt = conn.prepare(&format!(
            "SELECT c.scenario_id, sp.id, sp.name, sp.format, sp.hero_position, sp.line, sp.opponent, sc.stack_bb, COUNT(*),
                    SUM(c.status = 'match'), AVG(CASE WHEN c.status = 'match' THEN c.ev_bb END), AVG(CASE WHEN c.status = 'deviation' THEN c.ev_bb END)
             FROM hand_range_checks c JOIN range_scenarios sc ON sc.id = c.scenario_id JOIN range_spots sp ON sp.id = sc.spot_id
             WHERE {} AND c.status IN ('match', 'deviation') GROUP BY c.scenario_id ORDER BY COUNT(*) DESC",
            scope.where_sql()
        ))?;
        let rows = stmt
            .query_map(&scope.params()[..], |r| {
                let scenario: i64 = r.get(0)?;
                let (decisions, followed): (i64, i64) = (r.get(8)?, r.get(9)?);
                Ok(json!({
                    "scenarioId": scenario, "spotId": r.get::<_, i64>(1)?, "name": r.get::<_, String>(2)?, "format": r.get::<_, String>(3)?,
                    "heroPosition": r.get::<_, String>(4)?, "line": r.get::<_, String>(5)?, "opponent": r.get::<_, String>(6)?, "stackBb": r.get::<_, f64>(7)?,
                    "decisions": decisions, "matches": followed, "respect": if decisions > 0 { followed as f64 / decisions as f64 } else { 0.0 },
                    "evMatch": r.get::<_, Option<f64>>(10)?, "evDeviation": r.get::<_, Option<f64>>(11)?,
                }))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        rows
    };
    let scenarios: Vec<Value> = scenarios
        .into_iter()
        .map(|mut s| {
            let id = s["scenarioId"].as_i64().unwrap_or(-1);
            s["topDeviation"] = top.remove(&id).map_or(Value::Null, |(_, v)| v);
            s
        })
        .collect();

    let compared = matches + deviations;
    Ok(json!({
        "compared": compared, "matches": matches, "deviations": deviations, "responseDeviations": response_deviations, "noRange": no_range,
        "respect": if compared > 0 { Some(matches as f64 / compared as f64) } else { None },
        "noRangeShare": if compared + no_range > 0 { Some(no_range as f64 / (compared + no_range) as f64) } else { None },
        "frequentLines": frequent_lines, "scenarios": scenarios,
        "byOpponent": { "any": by_kind[0].json(), "reg": by_kind[1].json() },
        "byPosition": by_position.into_iter().map(|(format, position, tally)| {
            let mut entry = tally.json();
            entry["format"] = json!(format);
            entry["heroPosition"] = json!(position);
            entry
        }).collect::<Vec<_>>(),
    }))
}

/// The grid, the stacks the hands were played at and the latest deviations of one range.
pub fn scenario_detail(conn: &Connection, scenario_id: i64, hero: &str, from: Option<&str>, to: Option<&str>) -> Result<Option<Value>> {
    let head: Option<(i64, String, String, String, String, String, f64)> = conn
        .query_row(
            "SELECT sp.id, sp.name, sp.format, sp.hero_position, sp.line, sp.opponent, sc.stack_bb FROM range_scenarios sc JOIN range_spots sp ON sp.id = sc.spot_id WHERE sc.id = ?1",
            [scenario_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)),
        )
        .optional()?;
    let Some((spot_id, name, format, hero_position, line, opponent, stack_bb)) = head else { return Ok(None) };
    let book = load_book(conn)?;
    let scope = Scope::new(hero, from, to).and("c.scenario_id = @scenario", "@scenario", SqlValue::Integer(scenario_id));

    let mut hand_stats: HashMap<String, (i64, i64)> = HashMap::new();
    let (mut min_stack, mut max_stack) = (f64::MAX, f64::MIN);
    {
        let mut stmt = conn.prepare(&format!("SELECT c.hand_class, c.status, COUNT(*), MIN(c.stack_bb), MAX(c.stack_bb) FROM hand_range_checks c WHERE {} GROUP BY c.hand_class, c.status", scope.where_sql()))?;
        for row in stmt.query_map(&scope.params()[..], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?, r.get::<_, Option<f64>>(3)?, r.get::<_, Option<f64>>(4)?))
        })? {
            let (hand, status, n, lo, hi) = row?;
            let entry = hand_stats.entry(hand).or_default();
            if status == "deviation" {
                entry.1 += n;
            } else {
                entry.0 += n;
            }
            min_stack = min_stack.min(lo.unwrap_or(f64::MAX));
            max_stack = max_stack.max(hi.unwrap_or(f64::MIN));
        }
    }
    // What was played instead of the plan, per hand: the most frequent first.
    let mut played_by_hand: HashMap<String, Vec<Value>> = HashMap::new();
    {
        let mut stmt = conn.prepare(&format!(
            "SELECT c.hand_class, c.played_immediate, c.played_response, c.deviation_kind, COUNT(*) AS n FROM hand_range_checks c WHERE {} AND c.status = 'deviation' GROUP BY c.hand_class, c.played_immediate, c.played_response, c.deviation_kind ORDER BY n DESC",
            scope.where_sql()
        ))?;
        for row in stmt.query_map(&scope.params()[..], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, Option<String>>(3)?, r.get::<_, i64>(4)?)))? {
            let (hand, played, response, kind, count) = row?;
            played_by_hand.entry(hand).or_default().push(json!({
                "playedImmediate": played, "playedActionId": played_action_id(&book, &played, response.as_deref()), "playedResponse": response, "kind": kind, "count": count,
            }));
        }
    }
    let stats: serde_json::Map<String, Value> = hand_stats
        .into_iter()
        .map(|(hand, (m, d))| {
            let played = played_by_hand.remove(&hand).unwrap_or_default();
            (hand, json!({ "matches": m, "deviations": d, "played": played }))
        })
        .collect();

    let range: HashMap<String, i64> = book.hands.get(&scenario_id).cloned().unwrap_or_default();
    let deviation_scope = Scope::new(hero, from, to).and("c.scenario_id = @scenario", "@scenario", SqlValue::Integer(scenario_id)).and_clause("c.status = 'deviation'");
    let total: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM hand_range_checks c WHERE {}", deviation_scope.where_sql()), &deviation_scope.params()[..], |r| r.get(0))?;
    let deviations: Vec<Value> = {
        let mut stmt = conn.prepare(&format!(
            "SELECT c.hand_id, c.played_at, c.cards, c.hand_class, c.expected_action_id, c.played_immediate, c.played_response, c.deviation_kind
             FROM hand_range_checks c WHERE {} ORDER BY c.played_at DESC LIMIT {RECENT_DEVIATIONS}",
            deviation_scope.where_sql()
        ))?;
        let rows = stmt
            .query_map(&deviation_scope.params()[..], |r| {
                let played: String = r.get(5)?;
                let response: Option<String> = r.get(6)?;
                Ok(json!({
                    "handId": r.get::<_, String>(0)?, "playedAt": r.get::<_, Option<String>>(1)?, "cards": r.get::<_, Option<String>>(2)?, "handClass": r.get::<_, String>(3)?,
                    "expectedActionId": r.get::<_, Option<i64>>(4)?, "playedImmediate": played, "playedActionId": played_action_id(&book, &played, response.as_deref()),
                    "playedResponse": response, "kind": r.get::<_, Option<String>>(7)?,
                }))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        rows
    };

    Ok(Some(json!({
        "scenarioId": scenario_id, "spotId": spot_id, "name": name, "format": format, "heroPosition": hero_position, "line": line, "opponent": opponent, "stackBb": stack_bb,
        "observedMinBb": (min_stack != f64::MAX).then_some(min_stack), "observedMaxBb": (max_stack != f64::MIN).then_some(max_stack),
        "hands": range, "handStats": stats, "deviations": deviations, "deviationTotal": total,
    })))
}

/// The comparison of one hand (the replayer's card); `None` when there is no decision to compare.
pub fn hand_check(conn: &Connection, hero: &str, hand_id: &str) -> Result<Option<Value>> {
    if hero.trim().is_empty() {
        return Ok(None);
    }
    let book = load_book(conn)?;
    if book.candidates.is_empty() {
        return Ok(None);
    }
    let hands = hands_for_analysis(conn, &AnalysisFilters { hero_name: Some(hero.to_string()), hand_id: Some(hand_id.to_string()), ..Default::default() })?;
    let Some(hand) = hands.first() else { return Ok(None) };
    let players = stacks_of(conn, &[hand.hand_id.as_str()])?;
    let Some(stack_bb) = effective_stack_bb(hand, players.get(&hand.hand_id).map(Vec::as_slice).unwrap_or_default()) else { return Ok(None) };
    let regulars = regular_players(conn)?;
    let check = check_of(hand, stack_bb, &regulars, &book);
    if check.status == Status::Skipped {
        return Ok(None);
    }
    let spot: Option<(i64, String)> = match check.scenario_id {
        Some(id) => conn.query_row("SELECT sp.id, sp.name FROM range_scenarios sc JOIN range_spots sp ON sp.id = sc.spot_id WHERE sc.id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).optional()?,
        None => None,
    };
    let played_id = played_action_id(&book, &check.played_immediate, check.played_response.as_deref());
    Ok(Some(json!({
        "status": check.status.as_str(), "scenarioId": check.scenario_id, "spotId": spot.as_ref().map(|s| s.0), "scenarioName": spot.map(|s| s.1),
        "expectedAction": check.expected_action_id.map_or(Value::Null, |id| action_json(&book, conn, id)),
        "playedAction": played_id.map_or(Value::Null, |id| action_json(&book, conn, id)),
        "playedImmediate": check.played_immediate, "playedResponse": check.played_response, "deviationKind": check.deviation_kind,
        "depthUsedBb": check.depth_used_bb, "stackBb": stack_bb, "handClass": check.hand_class, "format": check.format, "heroPosition": check.hero_position, "line": check.line,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;
    use crate::services::user_ranges::{save_hands, save_spot, SpotInput, StartPoint};
    use std::collections::BTreeMap;

    fn db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations::run(&mut conn).unwrap();
        conn
    }

    /// A 3-handed hand where the hero (BB) saw "BTN fold, SB limp" with `cards` and `hero_acts`.
    fn insert_hand(conn: &Connection, id: &str, cards: &str, hero_acts: &str, sb_name: &str) {
        let preflop = format!("Btn: Folds\n{sb_name}: Calls 10\n{hero_acts}");
        conn.execute(
            "INSERT INTO hands (id, room, date_time, blinds, player_count, preflop_action) VALUES (?1, 'Winamax', '2026-11-10 20:00:00', '10/20', 3, ?2)",
            params![id, preflop],
        )
        .unwrap();
        for (name, position, hand_cards, stack) in [("Btn", "BTN", None, 200.0), (sb_name, "SB", None, 200.0), ("Hero", "BB", Some(cards), 200.0)] {
            conn.execute(
                "INSERT INTO player_hands (hand_id, player_name, position, cards, stack, net_profit) VALUES (?1, ?2, ?3, ?4, ?5, 0)",
                params![id, name, position, hand_cards, stack],
            )
            .unwrap();
        }
        conn.execute("INSERT OR IGNORE INTO players (name) VALUES ('Hero')", []).unwrap();
    }

    fn range_with(conn: &mut Connection, opponent: &str, paint: &[(&str, &str)]) -> i64 {
        let spot = SpotInput {
            format: "3max".into(),
            hero_position: "BB".into(),
            line: "btn:fold,sb:call".into(),
            opponent: opponent.into(),
            depths: vec![10.0],
            start: StartPoint { kind: "empty".into(), ..Default::default() },
            ..Default::default()
        };
        save_spot(conn, &spot).unwrap();
        let scenario: i64 = conn.query_row("SELECT sc.id FROM range_scenarios sc JOIN range_spots sp ON sp.id = sc.spot_id WHERE sp.opponent = ?1", [opponent], |r| r.get(0)).unwrap();
        let mut hands = BTreeMap::new();
        for (hand, label) in paint {
            let id: i64 = conn.query_row("SELECT id FROM range_actions WHERE label = ?1", [label], |r| r.get(0)).unwrap();
            hands.insert(hand.to_string(), id);
        }
        save_hands(conn, scenario, &hands).unwrap();
        scenario
    }

    #[test]
    fn every_status_is_stored_and_summarised() {
        let mut conn = db();
        // Range: AKo = Raise, everything else = Fold. The hero checks in the BB.
        range_with(&mut conn, "any", &[("AKo", "Raise")]);
        insert_hand(&conn, "h_match", "7h 2c", "Hero: Checks", "Sb");
        insert_hand(&conn, "h_dev", "Ah Kc", "Hero: Checks", "Sb");
        conn.execute("INSERT INTO hands (id, room, date_time, blinds, player_count, preflop_action) VALUES ('h_none', 'Winamax', '2026-11-10 21:00:00', '10/20', 3, 'Btn: Raises 40 to 60\nSb: Folds\nHero: Folds')", []).unwrap();
        for (name, position, cards) in [("Btn", "BTN", None), ("Sb", "SB", None), ("Hero", "BB", Some("9h 3c"))] {
            conn.execute("INSERT INTO player_hands (hand_id, player_name, position, cards, stack, net_profit) VALUES ('h_none', ?1, ?2, ?3, 200, 0)", params![name, position, cards]).unwrap();
        }
        // The planned play is Fold for 72o: checking is a deviation too, so paint it as Check.
        let check: i64 = conn.query_row("SELECT id FROM range_actions WHERE label = 'Check'", [], |r| r.get(0)).unwrap();
        let scenario: i64 = conn.query_row("SELECT id FROM range_scenarios", [], |r| r.get(0)).unwrap();
        save_hands(&mut conn, scenario, &BTreeMap::from([("72o".to_string(), check)])).unwrap();

        assert_eq!(ensure_computed(&mut conn, "Hero").unwrap(), 3);
        assert_eq!(ensure_computed(&mut conn, "Hero").unwrap(), 0, "nothing is computed twice");
        let status = |id: &str| -> (String, Option<String>) { conn.query_row("SELECT status, deviation_kind FROM hand_range_checks WHERE hand_id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).unwrap() };
        assert_eq!(status("h_match").0, "match");
        assert_eq!(status("h_dev"), ("deviation".to_string(), Some("immediate".to_string())));
        assert_eq!(status("h_none").0, "no_range");

        let summary = adherence(&conn, "Hero", None, None, None).unwrap();
        assert_eq!((summary["compared"].as_i64(), summary["matches"].as_i64(), summary["deviations"].as_i64(), summary["noRange"].as_i64()), (Some(2), Some(1), Some(1), Some(1)));
        assert_eq!(summary["respect"], 0.5);
        assert_eq!(summary["scenarios"][0]["topDeviation"]["playedImmediate"], "check");
        assert_eq!(summary["frequentLines"][0]["line"], "btn:raise,sb:fold");

        let detail = scenario_detail(&conn, scenario, "Hero", None, None).unwrap().unwrap();
        assert_eq!(detail["deviationTotal"], 1);
        assert_eq!(detail["handStats"]["AKo"]["deviations"], 1);
        let played = &detail["handStats"]["AKo"]["played"][0];
        assert_eq!((played["playedImmediate"].as_str(), played["kind"].as_str(), played["count"].as_i64()), (Some("check"), Some("immediate"), Some(1)));
        assert_eq!(detail["handStats"]["72o"]["played"], json!([]), "a followed hand lists nothing played instead");
        assert_eq!(detail["deviations"][0]["handId"], "h_dev");
    }

    #[test]
    fn a_period_given_as_the_app_filters_write_it_selects_the_same_day() {
        let mut conn = db();
        range_with(&mut conn, "any", &[("72o", "Check")]);
        insert_hand(&conn, "h1", "7h 2c", "Hero: Checks", "Sb");
        ensure_computed(&mut conn, "Hero").unwrap();
        let compared = |from: Option<&str>, to: Option<&str>| adherence(&conn, "Hero", from, to, None).unwrap()["compared"].as_i64();
        // The hand was played on 2026-11-10 at 20:00.
        assert_eq!(compared(Some("2026-11-10 00:00:00"), Some("2026-11-10 23:59:59")), Some(1));
        assert_eq!(compared(Some("2026-11-10 20:30:00"), None), Some(0));
        assert_eq!(compared(None, Some("2026-11-10 19:00:00")), Some(0));
        assert_eq!(compared(Some("2026-11-10"), Some("2026-11-10")), Some(1));
    }

    #[test]
    fn a_range_change_triggers_a_recompute() {
        let mut conn = db();
        let scenario = range_with(&mut conn, "any", &[("72o", "Check")]);
        insert_hand(&conn, "h1", "7h 2c", "Hero: Checks", "Sb");
        ensure_computed(&mut conn, "Hero").unwrap();
        let status = |conn: &Connection| -> String { conn.query_row("SELECT status FROM hand_range_checks WHERE hand_id = 'h1'", [], |r| r.get(0)).unwrap() };
        assert_eq!(status(&conn), "match");

        let fold: i64 = conn.query_row("SELECT id FROM range_actions WHERE label = 'Fold'", [], |r| r.get(0)).unwrap();
        save_hands(&mut conn, scenario, &BTreeMap::from([("72o".to_string(), fold)])).unwrap();
        assert_eq!(conn.query_row("SELECT COUNT(*) FROM hand_range_checks", [], |r| r.get::<_, i64>(0)).unwrap(), 0, "the stale rows are gone");
        assert_eq!(ensure_computed(&mut conn, "Hero").unwrap(), 1);
        assert_eq!(status(&conn), "deviation");
    }

    #[test]
    fn the_reg_variant_is_chosen_only_against_a_reg() {
        let mut conn = db();
        range_with(&mut conn, "any", &[("72o", "Check")]);
        let reg_scenario = range_with(&mut conn, "reg", &[("72o", "Fold")]);
        insert_hand(&conn, "vs_fish", "7h 2c", "Hero: Checks", "Fish");
        insert_hand(&conn, "vs_reg", "7h 2c", "Hero: Checks", "Villain");
        conn.execute("INSERT INTO players (name, is_reg) VALUES ('Villain', 1)", []).unwrap();
        ensure_computed(&mut conn, "Hero").unwrap();
        let scenario_of = |id: &str| -> i64 { conn.query_row("SELECT scenario_id FROM hand_range_checks WHERE hand_id = ?1", [id], |r| r.get(0)).unwrap() };
        assert_eq!(scenario_of("vs_reg"), reg_scenario);
        assert_ne!(scenario_of("vs_fish"), reg_scenario);
    }

    #[test]
    fn the_report_splits_fish_and_regulars_and_positions() {
        let mut conn = db();
        range_with(&mut conn, "any", &[("72o", "Check")]);
        insert_hand(&conn, "vs_fish", "7h 2c", "Hero: Checks", "Fish");
        insert_hand(&conn, "vs_fish_dev", "9h 3c", "Hero: Raises 40 to 60", "Fish");
        insert_hand(&conn, "vs_reg", "7h 2c", "Hero: Checks", "Villain");
        conn.execute("INSERT INTO players (name, is_reg) VALUES ('Villain', 1)", []).unwrap();
        ensure_computed(&mut conn, "Hero").unwrap();

        let all = adherence(&conn, "Hero", None, None, None).unwrap();
        assert_eq!(all["byOpponent"]["any"]["compared"], 2);
        assert_eq!(all["byOpponent"]["reg"]["compared"], 1, "a hand against a regular counts on its side only");
        assert_eq!(all["byOpponent"]["any"]["matches"], 1);
        assert_eq!(all["byPosition"][0]["format"], "3max");
        assert_eq!(all["byPosition"][0]["heroPosition"], "BB");
        assert_eq!(all["byPosition"][0]["compared"], all["compared"]);

        // The switch keeps both sides visible while the rest follows the filter.
        let fish = adherence(&conn, "Hero", None, None, Some("any")).unwrap();
        assert_eq!(fish["compared"], 2);
        assert_eq!(fish["byOpponent"]["reg"]["compared"], 1);
        let reg = adherence(&conn, "Hero", None, None, Some("reg")).unwrap();
        assert_eq!(reg["compared"], 1);
    }

    #[test]
    fn one_hand_is_checked_without_storing_anything() {
        let mut conn = db();
        range_with(&mut conn, "any", &[("72o", "Check")]);
        insert_hand(&conn, "h1", "7h 2c", "Hero: Checks", "Sb");
        let check = hand_check(&conn, "Hero", "h1").unwrap().unwrap();
        assert_eq!(check["status"], "match");
        assert_eq!(check["expectedAction"]["label"], "Check");
        assert_eq!(check["scenarioName"], "BB vs SB limp");
        assert_eq!(conn.query_row("SELECT COUNT(*) FROM hand_range_checks", [], |r| r.get::<_, i64>(0)).unwrap(), 0);
        assert!(hand_check(&conn, "Hero", "missing").unwrap().is_none());
        let _ = ensure_computed(&mut conn, "Nobody");
    }
}
