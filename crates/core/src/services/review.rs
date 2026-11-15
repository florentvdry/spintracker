//! Spaced review of the player's own ranges: one card per hand of a scenario, five boxes.
//!
//! A right answer moves a card up one box, a wrong one sends it back to box 1 for tomorrow. Every
//! function takes today's date, so nothing here reads the clock.

use std::collections::{HashMap, HashSet};

use chrono::{Duration, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

use crate::engines::quiz::borderline_neighbor;
use crate::engines::range_scenarios::hand_classes;
use crate::repos::hands_query::hero_resolution_sql;
use crate::services::user_ranges::{self, Res};

/// Days before a card comes back, by box (box 1 is "every day").
pub const INTERVAL_DAYS: [i64; 5] = [0, 1, 3, 7, 21];
const BOX_COUNT: i64 = 5;
/// Boxes whose cards count as mastered.
const MASTERED_FROM_BOX: i64 = 4;
/// What a card costs to answer, for the time estimate.
const SECONDS_PER_CARD: i64 = 12;
const DEFAULT_NEW_CARDS_PER_DAY: i64 = 20;
const HARDEST_HANDS: i64 = 5;
const DATE_FORMAT: &str = "%Y-%m-%d";

pub fn parse_day(text: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(text, DATE_FORMAT).ok()
}

fn day(date: NaiveDate) -> String {
    date.format(DATE_FORMAT).to_string()
}

/// The box and due date of a card after an answer. A card not yet in a box counts as box 1.
pub fn next_state(current_box: Option<i64>, correct: bool, today: NaiveDate) -> (i64, NaiveDate) {
    if !correct {
        return (1, today + Duration::days(1));
    }
    let next = (current_box.unwrap_or(1) + 1).min(BOX_COUNT);
    (next, today + Duration::days(INTERVAL_DAYS[(next - 1) as usize]))
}

/// Stores an answer on its card, creating the card on the first one. Returns the new box and the
/// day the card is due.
pub fn record(conn: &Connection, scenario_id: i64, hand_class: &str, correct: bool, today: NaiveDate, answered_at: &str) -> Res<(i64, NaiveDate)> {
    let current: Option<i64> = conn
        .query_row("SELECT box FROM training_cards WHERE scenario_id = ?1 AND hand_class = ?2", params![scenario_id, hand_class], |r| r.get(0))
        .optional()?;
    let (new_box, due) = next_state(current, correct, today);
    conn.execute(
        "INSERT INTO training_cards (scenario_id, hand_class, box, due_on, last_answer_at, created_on) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(scenario_id, hand_class) DO UPDATE SET box = excluded.box, due_on = excluded.due_on, last_answer_at = excluded.last_answer_at",
        params![scenario_id, hand_class, new_box, day(due), answered_at, day(today)],
    )?;
    Ok((new_box, due))
}

/// A hand of a range that has no card yet, with what decides its place in the queue.
#[derive(Debug, Clone, PartialEq)]
pub struct NewCandidate {
    pub scenario_id: i64,
    pub hand: String,
    /// Next to a hand with another action.
    pub borderline: bool,
    /// How often the hero was dealt it in this scenario.
    pub frequency: i64,
    pub grid_index: usize,
}

/// New cards come in this order: borderline hands, then the hands met most often in real games,
/// then grid order.
pub fn order_new_cards(mut candidates: Vec<NewCandidate>) -> Vec<NewCandidate> {
    candidates.sort_by(|a, b| {
        b.borderline
            .cmp(&a.borderline)
            .then(b.frequency.cmp(&a.frequency))
            .then(a.grid_index.cmp(&b.grid_index))
            .then(a.scenario_id.cmp(&b.scenario_id))
    });
    candidates
}

fn new_cards_per_day(conn: &Connection) -> Res<i64> {
    Ok(user_ranges::setting(conn, "new_cards_per_day")?.and_then(|v| v.parse().ok()).unwrap_or(DEFAULT_NEW_CARDS_PER_DAY))
}

/// How many new cards can still be introduced today.
fn new_remaining(conn: &Connection, today: NaiveDate) -> Res<i64> {
    let introduced: i64 = conn.query_row("SELECT COUNT(*) FROM training_cards WHERE created_on = ?1", [day(today)], |r| r.get(0))?;
    Ok((new_cards_per_day(conn)? - introduced).max(0))
}

/// Hands of the quiz scenarios (study-only ones excluded) that have no card yet, in queue order.
pub fn new_candidates(conn: &Connection) -> Res<Vec<NewCandidate>> {
    let mut frequency: HashMap<(i64, String), i64> = HashMap::new();
    {
        let mut stmt = conn.prepare("SELECT scenario_id, hand_class, COUNT(*) FROM hand_range_checks WHERE scenario_id IS NOT NULL AND status IN ('match', 'deviation') GROUP BY scenario_id, hand_class")?;
        for row in stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?)))? {
            let (scenario, hand, n) = row?;
            frequency.insert((scenario, hand), n);
        }
    }
    let carded: HashSet<(i64, String)> = {
        let mut stmt = conn.prepare("SELECT scenario_id, hand_class FROM training_cards")?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?.collect::<std::result::Result<HashSet<_>, _>>()?;
        rows
    };
    let scenarios: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT sc.id FROM range_scenarios sc JOIN range_spots sp ON sp.id = sc.spot_id WHERE sp.study_only = 0 ORDER BY sc.id")?;
        let ids = stmt.query_map([], |r| r.get(0))?.collect::<std::result::Result<Vec<i64>, _>>()?;
        ids
    };
    let classes = hand_classes();
    let mut out = Vec::new();
    for scenario in scenarios {
        let mut stmt = conn.prepare("SELECT hand, action_id FROM range_hands WHERE scenario_id = ?1")?;
        let hands = stmt.query_map([scenario], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?.collect::<std::result::Result<HashMap<_, _>, _>>()?;
        for (index, hand) in classes.iter().enumerate() {
            if !hands.contains_key(hand) || carded.contains(&(scenario, hand.clone())) {
                continue;
            }
            out.push(NewCandidate {
                scenario_id: scenario,
                borderline: borderline_neighbor(&hands, hand).is_some(),
                frequency: frequency.get(&(scenario, hand.clone())).copied().unwrap_or(0),
                grid_index: index,
                hand: hand.clone(),
            });
        }
    }
    Ok(order_new_cards(out))
}

fn due_cards(conn: &Connection, today: NaiveDate) -> Res<Vec<(i64, String)>> {
    let mut stmt = conn.prepare(
        "SELECT c.scenario_id, c.hand_class FROM training_cards c
         JOIN range_scenarios sc ON sc.id = c.scenario_id JOIN range_spots sp ON sp.id = sc.spot_id
         WHERE c.due_on <= ?1 AND sp.study_only = 0 ORDER BY c.due_on, c.box, c.scenario_id, c.hand_class",
    )?;
    let rows = stmt.query_map([day(today)], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// The next card of the review: due cards first, then new ones while today's quota lasts.
pub fn next_card(conn: &Connection, today: NaiveDate) -> Res<Option<(i64, String)>> {
    if let Some(card) = due_cards(conn, today)?.into_iter().next() {
        return Ok(Some(card));
    }
    if new_remaining(conn, today)? == 0 {
        return Ok(None);
    }
    Ok(new_candidates(conn)?.into_iter().next().map(|c| (c.scenario_id, c.hand)))
}

/// The hands missed most often, as (scenario, hand) pairs.
pub fn hardest_hands(conn: &Connection, limit: i64) -> Res<Vec<(i64, String, i64, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT a.scenario_id, a.hand_class, SUM(a.correct = 0) AS missed, COUNT(*) AS attempts FROM training_attempts a
         JOIN range_scenarios sc ON sc.id = a.scenario_id JOIN range_spots sp ON sp.id = sc.spot_id
         WHERE sp.study_only = 0 GROUP BY a.scenario_id, a.hand_class HAVING missed > 0 ORDER BY missed DESC, attempts DESC, a.hand_class LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?.collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// The review screen: today's plan, the boxes, progress by program and by scenario, the hands
/// missed most. `hero` adds the count of real deviations that have no card yet.
pub fn overview(conn: &Connection, today: NaiveDate, hero: Option<&str>) -> Res<Value> {
    let due = due_cards(conn, today)?.len() as i64;
    let remaining = new_remaining(conn, today)?;
    let available = (new_candidates(conn)?.len() as i64).min(remaining);
    let minutes = ((due + available) * SECONDS_PER_CARD + 59) / 60;

    let mut boxes = vec![0_i64; BOX_COUNT as usize];
    let (mut mastered, mut total) = (0_i64, 0_i64);
    {
        let mut stmt = conn.prepare(
            "SELECT c.box, COUNT(*) FROM training_cards c JOIN range_scenarios sc ON sc.id = c.scenario_id JOIN range_spots sp ON sp.id = sc.spot_id
             WHERE sp.study_only = 0 GROUP BY c.box",
        )?;
        for row in stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))? {
            let (box_number, n) = row?;
            boxes[(box_number - 1) as usize] = n;
            total += n;
            if box_number >= MASTERED_FROM_BOX {
                mastered += n;
            }
        }
    }

    let since = day(today - Duration::days(7));
    let (answers, right): (i64, i64) =
        conn.query_row("SELECT COUNT(*), COALESCE(SUM(correct), 0) FROM training_attempts WHERE created_at >= ?1", [&since], |r| Ok((r.get(0)?, r.get(1)?)))?;

    let by_scenario: Vec<Value> = {
        let mut stmt = conn.prepare(
            "SELECT sc.id, sp.id, sp.name, sc.stack_bb, COUNT(c.hand_class), COALESCE(SUM(c.box >= ?2), 0), COALESCE(SUM(c.due_on <= ?1), 0), MAX(c.last_answer_at)
             FROM range_scenarios sc JOIN range_spots sp ON sp.id = sc.spot_id LEFT JOIN training_cards c ON c.scenario_id = sc.id
             WHERE sp.study_only = 0 GROUP BY sc.id ORDER BY sp.id, sc.stack_bb DESC",
        )?;
        let rows = stmt
            .query_map(params![day(today), MASTERED_FROM_BOX], |r| {
                Ok(json!({
                    "scenarioId": r.get::<_, i64>(0)?, "spotId": r.get::<_, i64>(1)?, "name": r.get::<_, String>(2)?, "stackBb": r.get::<_, f64>(3)?,
                    "cards": r.get::<_, i64>(4)?, "mastered": r.get::<_, i64>(5)?, "dueToday": r.get::<_, i64>(6)?, "lastSession": r.get::<_, Option<String>>(7)?,
                }))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        rows
    };

    let programs: Vec<Value> = {
        let list = user_ranges::programs(conn)?;
        let mut out = Vec::new();
        for program in list.as_array().into_iter().flatten() {
            let spot_ids: Vec<i64> = program["spotIds"].as_array().into_iter().flatten().filter_map(Value::as_i64).collect();
            let rows: Vec<&Value> = by_scenario.iter().filter(|s| spot_ids.contains(&s["spotId"].as_i64().unwrap_or(-1))).collect();
            let sum = |key: &str| rows.iter().map(|s| s[key].as_i64().unwrap_or(0)).sum::<i64>();
            out.push(json!({ "id": program["id"], "name": program["name"], "scenarios": spot_ids.len(), "cards": sum("cards"), "mastered": sum("mastered") }));
        }
        out
    };

    let hardest: Vec<Value> = {
        let mut out = Vec::new();
        for (scenario, hand, missed, attempts) in hardest_hands(conn, HARDEST_HANDS)? {
            let (name, stack): (String, f64) = conn.query_row("SELECT sp.name, sc.stack_bb FROM range_scenarios sc JOIN range_spots sp ON sp.id = sc.spot_id WHERE sc.id = ?1", [scenario], |r| Ok((r.get(0)?, r.get(1)?)))?;
            out.push(json!({ "scenarioId": scenario, "handClass": hand, "name": name, "stackBb": stack, "missed": missed, "attempts": attempts }));
        }
        out
    };

    let new_deviations: i64 = match hero.filter(|h| !h.is_empty()) {
        Some(hero) => conn.query_row(
            &format!(
                "SELECT COUNT(*) FROM hand_range_checks c WHERE c.status = 'deviation' AND c.hero_name IN {}
                 AND NOT EXISTS (SELECT 1 FROM training_cards t WHERE t.scenario_id = c.scenario_id AND t.hand_class = c.hand_class)",
                hero_resolution_sql("@hero")
            ),
            rusqlite::named_params! { "@hero": hero },
            |r| r.get(0),
        )?,
        None => 0,
    };

    Ok(json!({
        "today": { "due": due, "newAvailable": available, "minutes": minutes },
        "boxes": boxes,
        "success7": { "rate": (answers > 0).then(|| right as f64 / answers as f64), "answers": answers },
        "mastered": { "count": mastered, "total": total },
        "programs": programs, "scenarios": by_scenario, "hardest": hardest, "newDeviations": new_deviations,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;
    use crate::services::user_ranges::{save_spot, SpotInput, StartPoint};

    fn date(text: &str) -> NaiveDate {
        parse_day(text).unwrap()
    }

    fn db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations::run(&mut conn).unwrap();
        conn
    }

    fn scenario(conn: &mut Connection, hero: &str, line: &str, study_only: bool) -> i64 {
        let spot = SpotInput {
            format: "3max".into(),
            hero_position: hero.into(),
            line: line.into(),
            opponent: "any".into(),
            study_only,
            depths: vec![10.0],
            start: StartPoint { kind: "empty".into(), ..Default::default() },
            ..Default::default()
        };
        let id = save_spot(conn, &spot).unwrap();
        conn.query_row("SELECT id FROM range_scenarios WHERE spot_id = ?1", [id], |r| r.get(0)).unwrap()
    }

    fn state(conn: &Connection, scenario: i64, hand: &str) -> (i64, String) {
        conn.query_row("SELECT box, due_on FROM training_cards WHERE scenario_id = ?1 AND hand_class = ?2", params![scenario, hand], |r| Ok((r.get(0)?, r.get(1)?))).unwrap()
    }

    #[test]
    fn a_right_answer_climbs_one_box_and_a_wrong_one_falls_to_the_first() {
        let today = date("2026-11-14");
        assert_eq!(next_state(None, true, today), (2, date("2026-11-15")), "a new card answered right goes to box 2");
        assert_eq!(next_state(Some(2), true, today), (3, date("2026-11-17")));
        assert_eq!(next_state(Some(3), true, today), (4, date("2026-11-21")));
        assert_eq!(next_state(Some(4), true, today), (5, date("2026-12-05")));
        assert_eq!(next_state(Some(5), true, today), (5, date("2026-12-05")), "box 5 is the last");
        assert_eq!(next_state(Some(5), false, today), (1, date("2026-11-15")), "a miss is due tomorrow");
        assert_eq!(next_state(None, false, today), (1, date("2026-11-15")));
    }

    #[test]
    fn answers_move_the_stored_card_on_the_injected_dates() {
        let mut conn = db();
        let s = scenario(&mut conn, "BTN", "", false);
        record(&conn, s, "AKs", true, date("2026-11-14"), "2026-11-14T10:00:00").unwrap();
        assert_eq!(state(&conn, s, "AKs"), (2, "2026-11-15".to_string()));
        record(&conn, s, "AKs", true, date("2026-11-15"), "2026-11-15T10:00:00").unwrap();
        assert_eq!(state(&conn, s, "AKs"), (3, "2026-11-18".to_string()));
        record(&conn, s, "AKs", false, date("2026-11-18"), "2026-11-18T10:00:00").unwrap();
        assert_eq!(state(&conn, s, "AKs"), (1, "2026-11-19".to_string()));
        let created: String = conn.query_row("SELECT created_on FROM training_cards", [], |r| r.get(0)).unwrap();
        assert_eq!(created, "2026-11-14", "the creation day stays");
    }

    #[test]
    fn new_cards_go_borderline_first_then_by_frequency_then_grid_order() {
        let candidate = |hand: &str, borderline: bool, frequency: i64, grid_index: usize| NewCandidate { scenario_id: 1, hand: hand.into(), borderline, frequency, grid_index };
        let ordered = order_new_cards(vec![
            candidate("AA", false, 0, 0),
            candidate("72o", false, 9, 100),
            candidate("KQs", false, 9, 14),
            candidate("T9s", true, 0, 60),
            candidate("J9s", true, 4, 70),
        ]);
        let hands: Vec<&str> = ordered.iter().map(|c| c.hand.as_str()).collect();
        assert_eq!(hands, ["J9s", "T9s", "KQs", "72o", "AA"]);
    }

    #[test]
    fn the_daily_quota_limits_new_cards_and_due_cards_come_first() {
        let mut conn = db();
        let s = scenario(&mut conn, "BTN", "", false);
        conn.execute("UPDATE range_settings SET value = '2' WHERE key = 'new_cards_per_day'", []).unwrap();
        let today = date("2026-11-14");
        // Two new cards fill today's quota.
        for _ in 0..2 {
            let (_, hand) = next_card(&conn, today).unwrap().unwrap();
            record(&conn, s, &hand, true, today, "2026-11-14T10:00:00").unwrap();
        }
        assert_eq!(next_card(&conn, today).unwrap(), None, "the quota is used up and nothing is due");
        // Tomorrow the two cards are due and come before anything new.
        let tomorrow = date("2026-11-15");
        let (scenario_id, _) = next_card(&conn, tomorrow).unwrap().unwrap();
        assert_eq!(scenario_id, s);
        let due = due_cards(&conn, tomorrow).unwrap();
        assert_eq!(due.len(), 2);
        assert_eq!(next_card(&conn, tomorrow).unwrap(), Some(due[0].clone()));
    }

    #[test]
    fn study_only_scenarios_never_enter_the_review() {
        let mut conn = db();
        let study = scenario(&mut conn, "BTN", "", true);
        assert!(new_candidates(&conn).unwrap().is_empty());
        record(&conn, study, "AA", false, date("2026-11-14"), "2026-11-14T10:00:00").unwrap();
        assert!(due_cards(&conn, date("2026-11-15")).unwrap().is_empty());
        assert_eq!(overview(&conn, date("2026-11-15"), None).unwrap()["mastered"]["total"], 0);
    }

    #[test]
    fn the_overview_counts_boxes_progress_and_the_hands_missed_most() {
        let mut conn = db();
        let s = scenario(&mut conn, "BTN", "", false);
        let today = date("2026-11-14");
        for (hand, correct) in [("AA", true), ("KK", true), ("QQ", false)] {
            conn.execute(
                "INSERT INTO training_attempts (scenario_id, hand_class, source, answer_immediate, correct, created_at) VALUES (?1, ?2, 'scenario', '1', ?3, '2026-11-13T10:00:00')",
                params![s, hand, correct],
            )
            .unwrap();
            record(&conn, s, hand, correct, today, "2026-11-14T10:00:00").unwrap();
        }
        for _ in 0..3 {
            record(&conn, s, "AA", true, today, "2026-11-14T10:00:00").unwrap();
        }
        let view = overview(&conn, date("2026-11-20"), None).unwrap();
        let boxes: Vec<i64> = view["boxes"].as_array().unwrap().iter().map(|v| v.as_i64().unwrap()).collect();
        assert_eq!(boxes.iter().sum::<i64>(), 3);
        assert_eq!(boxes[4], 1, "AA climbed to box 5 after four right answers");
        assert_eq!(view["mastered"], json!({ "count": 1, "total": 3 }));
        assert_eq!(view["success7"]["answers"], 3);
        assert_eq!(view["hardest"][0]["handClass"], "QQ");
        assert_eq!(view["today"]["due"], 2, "KK (due the 17th) and QQ (due the 15th) are due on the 20th");
    }
}
