//! The range quiz: drawing a question from the player's own ranges and checking the answer.
//!
//! The reference is the player's strategy. "Wrong" only means "not what your range says".

use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::engines::actions::{big_blind, parse_actions, ActionKind};
use crate::engines::preflop_line::player_positions;
use crate::engines::quiz::{actions_of_line, borderline_neighbor, build_table, QuizTable, SeatAction};
use crate::engines::range_scenarios::hand_classes;
use crate::repos::hands_query::hero_resolution_sql;
use crate::services::analysis::{hands_for_analysis, AnalysisFilters, AnalysisHand};
use crate::services::range_adherence::stacks_of;
use crate::services::user_ranges::{self, RangeError, Res};
use crate::util::eq_ic;

const SUITS: [char; 4] = ['s', 'h', 'd', 'c'];
/// With the borderline priority on, one draw in this many is a borderline hand.
const BORDERLINE_ONE_IN: usize = 2;

/// A small deterministic generator: the caller owns the seed, so a draw can be replayed in tests.
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self(seed | 1)
    }

    fn next(&mut self) -> u64 {
        // xorshift64*
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        self.0.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    pub fn below(&mut self, n: usize) -> usize {
        (self.next() % n.max(1) as u64) as usize
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct QuestionRequest {
    /// "scenario", "program" or "deviation".
    pub source: String,
    pub spot_id: Option<i64>,
    pub program_id: Option<i64>,
    /// Restricts the deviation source to one range.
    pub scenario_id: Option<i64>,
    pub hero_name: Option<String>,
    /// Overrides the stored setting.
    pub prioritize_borderline: Option<bool>,
    pub seed: u64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AnswerRequest {
    pub scenario_id: i64,
    pub hand_class: String,
    pub source: String,
    pub hand_id: Option<String>,
    /// The palette action chosen.
    pub answer_action_id: i64,
    /// "fold", "call" or "allin", when the chosen action plans a response.
    pub answer_response: Option<String>,
}

struct Palette {
    list: Vec<Value>,
    response_of: HashMap<i64, String>,
}

fn load_palette(conn: &Connection) -> Res<Palette> {
    let mut stmt = conn.prepare("SELECT id, label, color, immediate, size_value, size_unit, response FROM range_actions ORDER BY sort_order, id")?;
    let mut list = Vec::new();
    let mut response_of = HashMap::new();
    for row in stmt.query_map([], |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, Option<f64>>(4)?, r.get::<_, Option<String>>(5)?, r.get::<_, String>(6)?))
    })? {
        let (id, label, color, immediate, size_value, size_unit, response) = row?;
        list.push(json!({ "actionId": id, "label": label, "color": color, "immediate": immediate, "sizeValue": size_value, "sizeUnit": size_unit, "response": response }));
        response_of.insert(id, response);
    }
    Ok(Palette { list, response_of })
}

fn range_of(conn: &Connection, scenario_id: i64) -> Res<HashMap<String, i64>> {
    let mut stmt = conn.prepare("SELECT hand, action_id FROM range_hands WHERE scenario_id = ?1")?;
    let rows = stmt.query_map([scenario_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?.collect::<std::result::Result<HashMap<_, _>, _>>()?;
    Ok(rows)
}

struct ScenarioInfo {
    id: i64,
    spot_id: i64,
    name: String,
    format: String,
    hero_position: String,
    line: String,
    line_sizes: HashMap<String, f64>,
    opponent: String,
    stack_bb: f64,
}

fn scenario_info(conn: &Connection, scenario_id: i64) -> Res<Option<ScenarioInfo>> {
    Ok(conn
        .query_row(
            "SELECT sc.id, sp.id, sp.name, sp.format, sp.hero_position, sp.line, sp.line_sizes, sp.opponent, sc.stack_bb
             FROM range_scenarios sc JOIN range_spots sp ON sp.id = sc.spot_id WHERE sc.id = ?1",
            [scenario_id],
            |r| {
                let sizes: Option<String> = r.get(6)?;
                Ok(ScenarioInfo {
                    id: r.get(0)?,
                    spot_id: r.get(1)?,
                    name: r.get(2)?,
                    format: r.get(3)?,
                    hero_position: r.get(4)?,
                    line: r.get(5)?,
                    line_sizes: sizes.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default(),
                    opponent: r.get(7)?,
                    stack_bb: r.get(8)?,
                })
            },
        )
        .optional()?)
}

/// Two cards of a hand class with random suits.
fn cards_of(hand: &str, rng: &mut Rng) -> [String; 2] {
    let (first, second) = (&hand[0..1], &hand[1..2]);
    let a = SUITS[rng.below(4)];
    let b = if hand.ends_with('s') {
        a
    } else {
        let others: Vec<char> = SUITS.iter().copied().filter(|s| *s != a).collect();
        others[rng.below(3)]
    };
    [format!("{first}{a}"), format!("{second}{b}")]
}

fn table_json(table: &QuizTable) -> Value {
    json!({
        "potBb": table.pot_bb,
        "seats": table.seats.iter().map(|s| json!({ "position": s.position, "isHero": s.is_hero, "stackBb": s.stack_bb, "action": s.action, "betBb": s.bet_bb })).collect::<Vec<_>>(),
    })
}

/// The actions in front of the hero in a real hand, with their real sizes.
fn real_actions(hand: &AnalysisHand, hero_seat: &str) -> Vec<SeatAction> {
    let seats = player_positions(&hand.player_positions);
    let bb = big_blind(&hand.blinds) as f64;
    let mut out = Vec::new();
    for action in parse_actions(&hand.preflop) {
        if action.kind == ActionKind::Post {
            continue;
        }
        let Some(position) = seats.get(&action.player.to_lowercase()) else { continue };
        if position == hero_seat {
            break;
        }
        let verb = match (action.kind, action.is_all_in) {
            (_, true) => "allin",
            (ActionKind::Fold, _) => "fold",
            (ActionKind::Call, _) => "call",
            (ActionKind::Raise | ActionKind::Bet, _) => "raise",
            _ => continue,
        };
        let bet_bb = (verb == "raise" && bb > 0.0).then(|| action.amount_to.unwrap_or(0.0) / bb).filter(|b| *b > 0.0);
        out.push(SeatAction { position: position.clone(), verb: verb.into(), bet_bb });
    }
    out
}

/// A question about one hand of a range.
#[allow(clippy::too_many_arguments)]
fn question_json(info: &ScenarioInfo, hands: &HashMap<String, i64>, palette: &Palette, hand_class: &str, cards: [String; 2], table: &QuizTable, source: &str, hand_id: Option<&str>) -> Value {
    let used: Vec<i64> = hands.values().copied().collect();
    let choices: Vec<&Value> = palette.list.iter().filter(|a| used.contains(&a["actionId"].as_i64().unwrap_or(-1))).collect();
    json!({
        "scenarioId": info.id, "spotId": info.spot_id, "name": info.name, "format": info.format, "heroPosition": info.hero_position, "line": info.line,
        "opponent": info.opponent, "stackBb": info.stack_bb, "handClass": hand_class, "cards": cards, "choices": choices, "table": table_json(table),
        "source": source, "handId": hand_id,
    })
}

fn prioritize(conn: &Connection, request: &QuestionRequest) -> Res<bool> {
    Ok(match request.prioritize_borderline {
        Some(flag) => flag,
        None => user_ranges::setting(conn, "prioritize_borderline")?.map_or(true, |v| v == "1"),
    })
}

/// A scenario of a spot for the quiz: study-only spots never come up.
fn pick_scenario(conn: &Connection, spot_ids: &[i64], rng: &mut Rng) -> Res<Option<i64>> {
    let mut pool = Vec::new();
    for spot in spot_ids {
        let mut stmt = conn.prepare("SELECT sc.id FROM range_scenarios sc JOIN range_spots sp ON sp.id = sc.spot_id WHERE sp.id = ?1 AND sp.study_only = 0")?;
        let ids = stmt.query_map([spot], |r| r.get(0))?.collect::<std::result::Result<Vec<i64>, _>>()?;
        pool.extend(ids);
    }
    Ok((!pool.is_empty()).then(|| pool[rng.below(pool.len())]))
}

fn pick_hand(hands: &HashMap<String, i64>, borderline_first: bool, rng: &mut Rng) -> String {
    let all = hand_classes();
    if borderline_first && rng.below(BORDERLINE_ONE_IN) == 0 {
        let edge: Vec<&String> = all.iter().filter(|h| borderline_neighbor(hands, h).is_some()).collect();
        if !edge.is_empty() {
            return edge[rng.below(edge.len())].clone();
        }
    }
    all[rng.below(all.len())].clone()
}

/// Draws the next question; `None` when the source holds nothing to ask.
pub fn next_question(conn: &Connection, request: &QuestionRequest) -> Res<Option<Value>> {
    let mut rng = Rng::new(request.seed);
    let palette = load_palette(conn)?;
    if request.source == "deviation" {
        return deviation_question(conn, request, &palette, &mut rng);
    }

    let spots: Vec<i64> = match request.source.as_str() {
        "scenario" => request.spot_id.into_iter().collect(),
        "program" => {
            let Some(program) = request.program_id else { return Err(RangeError::Invalid("programId is required".into())) };
            let mut stmt = conn.prepare("SELECT spot_id FROM range_program_spots WHERE program_id = ?1 ORDER BY sort_order")?;
            let ids = stmt.query_map([program], |r| r.get(0))?.collect::<std::result::Result<Vec<i64>, _>>()?;
            ids
        }
        other => return Err(RangeError::Invalid(format!("unknown source: {other}"))),
    };
    let Some(scenario_id) = pick_scenario(conn, &spots, &mut rng)? else { return Ok(None) };
    let info = scenario_info(conn, scenario_id)?.ok_or(RangeError::NotFound)?;
    let hands = range_of(conn, scenario_id)?;
    let hand = pick_hand(&hands, prioritize(conn, request)?, &mut rng);
    let table = build_table(&info.format, &info.hero_position, &actions_of_line(&info.line, &info.line_sizes), &HashMap::new(), info.stack_bb);
    let cards = cards_of(&hand, &mut rng);
    Ok(Some(question_json(&info, &hands, &palette, &hand, cards, &table, &request.source, None)))
}

/// A hand where the hero left their range, on the real table.
fn deviation_question(conn: &Connection, request: &QuestionRequest, palette: &Palette, rng: &mut Rng) -> Res<Option<Value>> {
    let Some(hero) = request.hero_name.as_deref().filter(|h| !h.is_empty()) else { return Err(RangeError::Invalid("heroName is required".into())) };
    let filter = "c.status = 'deviation' AND c.hero_name IN ".to_string()
        + &hero_resolution_sql("@hero")
        + " AND c.scenario_id IN (SELECT sc.id FROM range_scenarios sc JOIN range_spots sp ON sp.id = sc.spot_id WHERE sp.study_only = 0)"
        + " AND (@scenario IS NULL OR c.scenario_id = @scenario)";
    let named = |extra: &mut Vec<(&str, rusqlite::types::Value)>| {
        extra.push(("@hero", rusqlite::types::Value::Text(hero.to_string())));
        extra.push(("@scenario", request.scenario_id.map_or(rusqlite::types::Value::Null, rusqlite::types::Value::Integer)));
    };
    let mut binds = Vec::new();
    named(&mut binds);
    let params: Vec<(&str, &dyn rusqlite::ToSql)> = binds.iter().map(|(n, v)| (*n, v as &dyn rusqlite::ToSql)).collect();
    let total: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM hand_range_checks c WHERE {filter}"), &params[..], |r| r.get(0))?;
    if total == 0 {
        return Ok(None);
    }
    let offset = rng.below(total as usize) as i64;
    let row: (String, i64, String, Option<String>) = conn.query_row(
        &format!("SELECT c.hand_id, c.scenario_id, c.hand_class, c.cards FROM hand_range_checks c WHERE {filter} ORDER BY c.played_at DESC LIMIT 1 OFFSET {offset}"),
        &params[..],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    )?;
    let (hand_id, scenario_id, hand_class, raw_cards) = row;
    let info = scenario_info(conn, scenario_id)?.ok_or(RangeError::NotFound)?;
    let hands = range_of(conn, scenario_id)?;

    let real = hands_for_analysis(conn, &AnalysisFilters { hero_name: Some(hero.to_string()), hand_id: Some(hand_id.clone()), ..Default::default() })?;
    let table = match real.first() {
        Some(hand) => {
            let bb = big_blind(&hand.blinds) as f64;
            let seats = player_positions(&hand.player_positions);
            let mut stacks = HashMap::new();
            if bb > 0.0 {
                for (name, stack) in stacks_of(conn, &[hand.hand_id.as_str()])?.remove(&hand.hand_id).unwrap_or_default() {
                    if let Some(position) = seats.get(&name.to_lowercase()) {
                        stacks.insert(position.clone(), stack / bb);
                    }
                }
            }
            let hero_name = hand.hero_name.as_deref().unwrap_or(hero);
            let hero_seat = seats.iter().find(|(name, _)| eq_ic(name, hero_name)).map_or(info.hero_position.clone(), |(_, p)| p.clone());
            build_table(&info.format, &info.hero_position, &real_actions(hand, &hero_seat), &stacks, info.stack_bb)
        }
        None => build_table(&info.format, &info.hero_position, &actions_of_line(&info.line, &info.line_sizes), &HashMap::new(), info.stack_bb),
    };
    let cards = raw_cards.map(|c| c.split_whitespace().map(str::to_string).collect::<Vec<_>>()).filter(|c| c.len() == 2).map(|c| [c[0].clone(), c[1].clone()]).unwrap_or_else(|| cards_of(&hand_class, rng));
    Ok(Some(question_json(&info, &hands, palette, &hand_class, cards, &table, "deviation", Some(&hand_id))))
}

/// Checks an answer against the range and records the attempt. A compound answer (action, then
/// answer to a raise) is right only when both parts are.
pub fn check_answer(conn: &Connection, request: &AnswerRequest, now: &str) -> Res<Value> {
    let hands = range_of(conn, request.scenario_id)?;
    let Some(expected_id) = hands.get(&request.hand_class).copied() else { return Err(RangeError::NotFound) };
    let palette = load_palette(conn)?;
    let planned = palette.response_of.get(&expected_id).filter(|r| r.as_str() != "none").cloned();

    let immediate_correct = request.answer_action_id == expected_id;
    // The answer to a raise only counts once the action itself is right.
    let response_correct = match (&planned, immediate_correct) {
        (Some(expected), true) => Some(request.answer_response.as_deref() == Some(expected.as_str())),
        _ => None,
    };
    let correct = immediate_correct && response_correct.unwrap_or(true);
    let neighbor = borderline_neighbor(&hands, &request.hand_class);

    conn.execute(
        "INSERT INTO training_attempts (scenario_id, hand_class, source, hand_id, answer_immediate, answer_response, correct, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![request.scenario_id, request.hand_class, request.source, request.hand_id, request.answer_action_id.to_string(), request.answer_response, correct, now],
    )?;
    Ok(json!({
        "correct": correct, "immediateCorrect": immediate_correct, "responseCorrect": response_correct,
        "expectedActionId": expected_id, "expectedResponse": planned, "answeredActionId": request.answer_action_id,
        "handClass": request.hand_class, "scenarioId": request.scenario_id, "hands": hands,
        "borderline": neighbor.is_some(), "neighbor": neighbor,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;
    use crate::services::range_adherence::ensure_computed;
    use crate::services::user_ranges::{save_actions, save_hands, save_program, save_spot, ActionInput, ProgramInput, SpotInput, StartPoint};
    use std::collections::BTreeMap;

    fn db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations::run(&mut conn).unwrap();
        conn
    }

    fn action_id(conn: &Connection, label: &str) -> i64 {
        conn.query_row("SELECT id FROM range_actions WHERE label = ?1", [label], |r| r.get(0)).unwrap()
    }

    /// BB vs "SB limp": AKo = ISO (fold if raised), everything else = Check.
    fn spot(conn: &mut Connection, study_only: bool, line: &str, hero: &str) -> (i64, i64) {
        let input = SpotInput {
            format: "3max".into(),
            hero_position: hero.into(),
            line: line.into(),
            opponent: "any".into(),
            study_only,
            depths: vec![10.0],
            start: StartPoint { kind: "empty".into(), ..Default::default() },
            ..Default::default()
        };
        let spot = save_spot(conn, &input).unwrap();
        let scenario: i64 = conn.query_row("SELECT id FROM range_scenarios WHERE spot_id = ?1", [spot], |r| r.get(0)).unwrap();
        (spot, scenario)
    }

    fn iso_and_check(conn: &mut Connection) -> (i64, i64) {
        save_actions(
            conn,
            &[ActionInput { id: None, label: "ISO".into(), color: "#a07cf0".into(), immediate: "iso".into(), size_value: None, size_unit: None, response: "fold".into() }],
        )
        .unwrap();
        (action_id(conn, "ISO"), action_id(conn, "Check"))
    }

    fn request(source: &str, spot: i64, seed: u64) -> QuestionRequest {
        QuestionRequest { source: source.into(), spot_id: Some(spot), seed, prioritize_borderline: Some(false), ..Default::default() }
    }

    #[test]
    fn the_quiz_never_asks_about_a_study_only_scenario() {
        let mut conn = db();
        let (study, _) = spot(&mut conn, true, "btn:fold,sb:call", "BB");
        let (quiz, _) = spot(&mut conn, false, "", "BTN");
        assert!(next_question(&conn, &request("scenario", study, 1)).unwrap().is_none());
        let program = save_program(&mut conn, &ProgramInput { name: "Mixed".into(), spot_ids: vec![study, quiz], ..Default::default() }).unwrap();
        for seed in 1..60 {
            let question = next_question(&conn, &QuestionRequest { source: "program".into(), program_id: Some(program), seed, ..Default::default() }).unwrap().unwrap();
            assert_eq!(question["spotId"], quiz);
        }
    }

    #[test]
    fn a_question_carries_the_table_and_one_button_per_action_in_the_range() {
        let mut conn = db();
        let (spot_id, scenario) = spot(&mut conn, false, "btn:fold,sb:call", "BB");
        let (iso, _) = iso_and_check(&mut conn);
        save_hands(&mut conn, scenario, &BTreeMap::from([("AKo".to_string(), iso)])).unwrap();
        let question = next_question(&conn, &request("scenario", spot_id, 7)).unwrap().unwrap();
        assert_eq!(question["table"]["potBb"], 2.0);
        assert_eq!(question["choices"].as_array().unwrap().len(), 2, "Fold (the default) and ISO");
        assert_eq!(question["cards"].as_array().unwrap().len(), 2);
        let hand = question["handClass"].as_str().unwrap();
        let cards: Vec<&str> = question["cards"].as_array().unwrap().iter().map(|c| c.as_str().unwrap()).collect();
        assert_eq!(cards[0].ends_with(cards[1].chars().last().unwrap()), hand.ends_with('s'), "suited hands share a suit");
    }

    #[test]
    fn the_borderline_priority_draws_edge_hands_about_half_the_time() {
        let mut conn = db();
        let (spot_id, scenario) = spot(&mut conn, false, "", "BTN");
        let (iso, _) = iso_and_check(&mut conn);
        save_hands(&mut conn, scenario, &BTreeMap::from([("AKo".to_string(), iso)])).unwrap();
        let hands = range_of(&conn, scenario).unwrap();
        let edge_share = |prioritize: bool| {
            let edge = (1..=300u64)
                .filter(|seed| {
                    let q = next_question(&conn, &QuestionRequest { prioritize_borderline: Some(prioritize), ..request("scenario", spot_id, *seed) }).unwrap().unwrap();
                    borderline_neighbor(&hands, q["handClass"].as_str().unwrap()).is_some()
                })
                .count();
            edge as f64 / 300.0
        };
        assert!(edge_share(true) > 0.35, "half of the draws are edge hands");
        assert!(edge_share(false) < 0.1, "uniform draws rarely are");
    }

    #[test]
    fn a_compound_answer_is_right_only_when_both_parts_are() {
        let mut conn = db();
        let (_, scenario) = spot(&mut conn, false, "btn:fold,sb:call", "BB");
        let (iso, check) = iso_and_check(&mut conn);
        save_hands(&mut conn, scenario, &BTreeMap::from([("AKo".to_string(), iso)])).unwrap();
        let answer = |action: i64, response: Option<&str>| AnswerRequest {
            scenario_id: scenario,
            hand_class: "AKo".into(),
            source: "scenario".into(),
            answer_action_id: action,
            answer_response: response.map(str::to_string),
            ..Default::default()
        };
        let right = check_answer(&conn, &answer(iso, Some("fold")), "2026-11-14T10:00:00").unwrap();
        assert_eq!(right["correct"], true);
        let half = check_answer(&conn, &answer(iso, Some("call")), "2026-11-14T10:00:01").unwrap();
        assert_eq!((half["correct"].clone(), half["immediateCorrect"].clone(), half["responseCorrect"].clone()), (json!(false), json!(true), json!(false)));
        let wrong = check_answer(&conn, &answer(check, None), "2026-11-14T10:00:02").unwrap();
        assert_eq!((wrong["correct"].clone(), wrong["immediateCorrect"].clone(), wrong["responseCorrect"].clone()), (json!(false), json!(false), Value::Null));
        assert_eq!(wrong["expectedActionId"], iso);
        assert_eq!(conn.query_row("SELECT COUNT(*) FROM training_attempts WHERE correct = 0", [], |r| r.get::<_, i64>(0)).unwrap(), 2);
        assert!(right["borderline"].as_bool().unwrap(), "AKo has neighbours on another action");
    }

    #[test]
    fn my_deviations_only_returns_deviations_on_the_real_table() {
        let mut conn = db();
        let (_, scenario) = spot(&mut conn, false, "btn:fold,sb:call", "BB");
        let (iso, _) = iso_and_check(&mut conn);
        save_hands(&mut conn, scenario, &BTreeMap::from([("AKo".to_string(), iso)])).unwrap();
        let positions = [("Btn", "BTN", None), ("Sb", "SB", None), ("Hero", "BB", None::<&str>)];
        for (id, cards, acts) in [("dev", "Ah Kc", "Hero: Checks"), ("ok", "7h 2c", "Hero: Checks")] {
            conn.execute(
                "INSERT INTO hands (id, room, date_time, blinds, player_count, preflop_action) VALUES (?1, 'Winamax', '2026-11-10 20:00:00', '10/20', 3, ?2)",
                params![id, format!("Btn: Folds\nSb: Calls 10\n{acts}")],
            )
            .unwrap();
            for (name, position, _) in positions {
                let held = (name == "Hero").then_some(cards);
                conn.execute("INSERT INTO player_hands (hand_id, player_name, position, cards, stack, net_profit) VALUES (?1, ?2, ?3, ?4, 220, 0)", params![id, name, position, held]).unwrap();
            }
        }
        conn.execute("INSERT INTO players (name) VALUES ('Hero')", []).unwrap();
        ensure_computed(&mut conn, "Hero").unwrap();
        // 72o is planned as Fold (the default): checking it is a deviation as well.
        let request = QuestionRequest { source: "deviation".into(), hero_name: Some("Hero".into()), ..Default::default() };
        let mut seen = std::collections::HashSet::new();
        for seed in 1..40 {
            let question = next_question(&conn, &QuestionRequest { seed, ..request.clone() }).unwrap().unwrap();
            seen.insert(question["handId"].as_str().unwrap().to_string());
            assert_eq!(question["source"], "deviation");
        }
        assert_eq!(seen.len(), 2, "both hands deviate from the plan");
        let question = next_question(&conn, &QuestionRequest { seed: 3, ..request.clone() }).unwrap().unwrap();
        let hero = question["table"]["seats"].as_array().unwrap().iter().find(|s| s["isHero"] == true).unwrap().clone();
        assert_eq!(hero["stackBb"], 10.0, "220 chips at 10/20 is 11 bb, minus the big blind posted");
        assert_eq!(question["table"]["potBb"], 2.0);
    }
}
