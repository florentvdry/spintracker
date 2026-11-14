//! Compares one preflop decision of the hero with the player's own ranges.
//!
//! The reference is the player's strategy and nothing else: a deviation means "not what you
//! planned", never "a mistake". Pure: the caller loads the ranges and the hands.

use std::collections::HashMap;

use crate::engines::actions::{parse_actions, raise_size_bb, ActionKind};
use crate::engines::preflop_line::{player_positions, preflop_sequence};
use crate::engines::range_scenarios::{canonical_line, pick_scenario, Candidate, DepthRule};
use crate::repos::heatmap::normalize_cards;
use crate::util::eq_ic;

/// A played raise within this many big blinds of the planned size still follows the range.
pub const SIZE_TOLERANCE_BB: f64 = 0.5;

/// An action of the player's palette, as the comparison reads it.
#[derive(Debug, Clone, PartialEq)]
pub struct ActionDef {
    pub id: i64,
    pub label: String,
    pub immediate: String,
    pub size_value: Option<f64>,
    pub size_unit: Option<String>,
    pub response: String,
}

/// Everything stored about the player's ranges.
#[derive(Debug, Clone, Default)]
pub struct RangeBook {
    pub candidates: Vec<Candidate>,
    pub actions: HashMap<i64, ActionDef>,
    /// scenario id -> hand class -> action id
    pub hands: HashMap<i64, HashMap<String, i64>>,
    pub rule: Option<DepthRule>,
}

#[derive(Debug, Clone, Copy)]
pub struct DecisionInput<'a> {
    pub preflop: &'a str,
    pub positions: &'a str,
    pub hero_position: &'a str,
    pub hero_name: &'a str,
    pub cards: Option<&'a str>,
    pub stack_bb: f64,
    pub blinds: &'a str,
    pub opponent_is_reg: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Match,
    Deviation,
    NoRange,
    /// No decision to compare (no known cards, the hero never acted, odd table size).
    Skipped,
}

impl Status {
    pub fn as_str(self) -> &'static str {
        match self {
            Status::Match => "match",
            Status::Deviation => "deviation",
            Status::NoRange => "no_range",
            Status::Skipped => "skipped",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Check {
    pub status: Status,
    pub scenario_id: Option<i64>,
    pub hand_class: String,
    pub expected_action_id: Option<i64>,
    pub played_immediate: String,
    pub played_response: Option<String>,
    /// "immediate", "size" or "response" for a deviation.
    pub deviation_kind: Option<&'static str>,
    pub depth_used_bb: Option<f64>,
    pub format: String,
    pub hero_position: String,
    pub line: String,
}

impl Check {
    fn skipped() -> Self {
        Self {
            status: Status::Skipped,
            scenario_id: None,
            hand_class: String::new(),
            expected_action_id: None,
            played_immediate: String::new(),
            played_response: None,
            deviation_kind: None,
            depth_used_bb: None,
            format: String::new(),
            hero_position: String::new(),
            line: String::new(),
        }
    }
}

/// "BTN SB" and friends are stored for heads-up seats: the seat the range was built for.
fn seat_of(position: &str) -> Option<&'static str> {
    if position.contains("BB") {
        Some("BB")
    } else if position.contains("SB") {
        Some("SB")
    } else if position.contains("BTN") {
        Some("BTN")
    } else {
        None
    }
}

fn verb_of(entry: &str) -> &str {
    entry.split_once(':').map_or("", |(_, verb)| verb)
}

fn is_raise_like(verb: &str) -> bool {
    matches!(verb, "raise" | "bet" | "all-in")
}

/// The plan's immediate action against what was played ("call" covers a limp).
fn immediate_matches(expected: &str, played: &str) -> bool {
    match expected {
        "fold" => played == "fold",
        "check" => played == "check",
        "call" => matches!(played, "call" | "limp"),
        "limp" => played == "limp",
        "raise" | "iso" | "threebet" => played == "raise",
        "allin" => played == "allin",
        _ => false,
    }
}

/// The planned size in big blinds, when it can be known.
fn planned_size_bb(action: &ActionDef, stack_bb: f64, facing_raise: bool) -> Option<f64> {
    let value = action.size_value?;
    match action.size_unit.as_deref()? {
        "bb" => Some(value),
        // A multiple of the bet to match: only the big blind is known when nobody raised.
        "x" if !facing_raise => Some(value),
        "pct_stack" => Some(value / 100.0 * stack_bb),
        _ => None,
    }
}

fn response_of(verb: &str) -> &'static str {
    match verb {
        "fold" => "fold",
        "call" => "call",
        _ => "allin",
    }
}

/// Compares the hero's first preflop action (and the answer to a raise) with the range.
pub fn evaluate(input: &DecisionInput, book: &RangeBook) -> Check {
    let (Some(seat), Some(cards)) = (seat_of(input.hero_position), input.cards) else { return Check::skipped() };
    let Some(hand_class) = normalize_cards(cards) else { return Check::skipped() };
    let format = match player_positions(input.positions).len() {
        2 => "hu",
        3 => "3max",
        _ => return Check::skipped(),
    };

    let seq = preflop_sequence(input.preflop, input.positions);
    let own = |entry: &String| entry.split(':').next().is_some_and(|pos| pos.eq_ignore_ascii_case(seat));
    let Some(first) = seq.iter().position(own) else { return Check::skipped() };
    let first_verb = verb_of(&seq[first]).to_string();
    let facing_raise = seq[..first].iter().any(|e| is_raise_like(verb_of(e)));
    let played_immediate = match first_verb.as_str() {
        "fold" => "fold",
        "check" => "check",
        "call" if facing_raise => "call",
        "call" => "limp",
        "all-in" => "allin",
        _ => "raise",
    };

    // The answer to a raise: the hero's next action once somebody raised after the first one.
    let later = seq[first + 1..].iter().enumerate().find(|(_, e)| own(e)).map(|(i, e)| (first + 1 + i, verb_of(e).to_string()));
    let played_response = later
        .filter(|(index, _)| seq[first + 1..*index].iter().any(|e| is_raise_like(verb_of(e))))
        .map(|(_, verb)| response_of(&verb).to_string());

    let line = canonical_line(&seq, seat);
    let mut check = Check {
        status: Status::NoRange,
        scenario_id: None,
        hand_class: hand_class.clone(),
        expected_action_id: None,
        played_immediate: played_immediate.to_string(),
        played_response: played_response.clone(),
        deviation_kind: None,
        depth_used_bb: None,
        format: format.to_string(),
        hero_position: seat.to_string(),
        line: line.clone(),
    };

    let rule = book.rule.unwrap_or(DepthRule::Nearest);
    let Some(candidate) = pick_scenario(&book.candidates, format, &line, input.opponent_is_reg, input.stack_bb, rule) else { return check };
    let Some(action) = book.hands.get(&candidate.scenario_id).and_then(|h| h.get(&hand_class)).and_then(|id| book.actions.get(id)) else { return check };
    check.scenario_id = Some(candidate.scenario_id);
    check.expected_action_id = Some(action.id);
    check.depth_used_bb = Some(candidate.stack_bb);

    let mut kind = None;
    if !immediate_matches(&action.immediate, played_immediate) {
        kind = Some("immediate");
    } else if played_immediate == "raise" {
        let played_size = parse_actions(input.preflop)
            .iter()
            .find(|a| eq_ic(&a.player, input.hero_name) && a.kind != ActionKind::Post)
            .and_then(|a| raise_size_bb(a, input.blinds));
        if let (Some(planned), Some(played)) = (planned_size_bb(action, input.stack_bb, facing_raise), played_size) {
            if (planned - played).abs() > SIZE_TOLERANCE_BB {
                kind = Some("size");
            }
        }
    }
    if kind.is_none() && action.response != "none" {
        if let Some(answer) = &played_response {
            if *answer != action.response {
                kind = Some("response");
            }
        }
    }
    check.status = if kind.is_some() { Status::Deviation } else { Status::Match };
    check.deviation_kind = kind;
    check
}

#[cfg(test)]
mod tests {
    use super::*;

    const SEATS: &str = "Hero:BB|Sb:SB|Btn:BTN";

    fn action(id: i64, label: &str, immediate: &str, response: &str) -> ActionDef {
        ActionDef { id, label: label.into(), immediate: immediate.into(), size_value: None, size_unit: None, response: response.into() }
    }

    /// BB vs "SB limp" at 10 bb: AKo = Raise (fold if reraised), everything else = Check.
    fn book() -> RangeBook {
        let mut hands = HashMap::new();
        let mut range: HashMap<String, i64> = HashMap::new();
        for hand in crate::engines::range_scenarios::hand_classes() {
            range.insert(hand, 1);
        }
        range.insert("AKo".into(), 2);
        hands.insert(7, range);
        RangeBook {
            candidates: vec![Candidate { scenario_id: 7, spot_id: 1, format: "3max".into(), line: "btn:fold,sb:call".into(), opponent: "any".into(), stack_bb: 10.0 }],
            actions: HashMap::from([(1, action(1, "CHECK", "check", "none")), (2, action(2, "ISO", "iso", "fold")), (3, action(3, "SHOVE", "allin", "none"))]),
            hands,
            rule: Some(DepthRule::Nearest),
        }
    }

    fn input<'a>(preflop: &'a str, cards: &'a str) -> DecisionInput<'a> {
        DecisionInput { preflop, positions: SEATS, hero_position: "BB", hero_name: "Hero", cards: Some(cards), stack_bb: 10.0, blinds: "10/20", opponent_is_reg: false }
    }

    const LIMP: &str = "Btn: Folds\nSb: Calls 10";

    #[test]
    fn playing_the_planned_action_matches() {
        let check = evaluate(&input(&format!("{LIMP}
Hero: Raises 40 to 60
Sb: Folds"), "Ah Kc"), &book());
        assert_eq!((check.status, check.expected_action_id, check.deviation_kind), (Status::Match, Some(2), None));
    }

    #[test]
    fn a_different_immediate_action_is_a_deviation() {
        let check = evaluate(&input(&format!("{LIMP}\nHero: Checks"), "Ah Kc"), &book());
        assert_eq!(check.status, Status::Deviation);
        assert_eq!(check.deviation_kind, Some("immediate"));
        assert_eq!((check.expected_action_id, check.played_immediate.as_str()), (Some(2), "check"));
    }

    #[test]
    fn a_hand_the_range_plays_as_planned_is_a_match() {
        let check = evaluate(&input(&format!("{LIMP}\nHero: Checks"), "7h 2c"), &book());
        assert_eq!((check.status, check.scenario_id, check.depth_used_bb), (Status::Match, Some(7), Some(10.0)));
        assert_eq!(check.hand_class, "72o");
    }

    #[test]
    fn a_raise_of_another_size_still_follows_an_unsized_raise() {
        let check = evaluate(&input(&format!("{LIMP}\nHero: Raises 40 to 60\nSb: Folds"), "Ah Kc"), &book());
        assert_eq!(check.status, Status::Match);
    }

    #[test]
    fn a_planned_size_is_compared_within_the_tolerance() {
        let mut b = book();
        let iso = b.actions.get_mut(&2).unwrap();
        iso.size_value = Some(3.0);
        iso.size_unit = Some("bb".into());
        let close = evaluate(&input(&format!("{LIMP}\nHero: Raises 40 to 70\nSb: Folds"), "Ah Kc"), &b);
        assert_eq!(close.status, Status::Match, "3.5 bb is within 0.5 of 3 bb");
        let far = evaluate(&input(&format!("{LIMP}\nHero: Raises 40 to 100\nSb: Folds"), "Ah Kc"), &b);
        assert_eq!((far.status, far.deviation_kind), (Status::Deviation, Some("size")));
    }

    #[test]
    fn the_answer_to_a_raise_is_compared_with_the_planned_response() {
        let call = evaluate(&input(&format!("{LIMP}\nHero: Raises 40 to 60\nSb: Raises 80 to 140\nHero: Calls 80"), "Ah Kc"), &book());
        assert_eq!((call.status, call.deviation_kind), (Status::Deviation, Some("response")));
        assert_eq!((call.played_immediate.as_str(), call.played_response.as_deref()), ("raise", Some("call")));
        let fold = evaluate(&input(&format!("{LIMP}\nHero: Raises 40 to 60\nSb: Raises 80 to 140\nHero: Folds"), "Ah Kc"), &book());
        assert_eq!(fold.status, Status::Match);
    }

    #[test]
    fn a_situation_without_a_range_is_reported_as_such() {
        let preflop = "Btn: Raises 40 to 60\nSb: Folds\nHero: Calls 40";
        let check = evaluate(&input(preflop, "Ah Kc"), &book());
        assert_eq!((check.status, check.scenario_id, check.line.as_str()), (Status::NoRange, None, "btn:raise,sb:fold"));
    }

    #[test]
    fn a_reg_variant_is_used_only_against_a_reg() {
        let mut b = book();
        let mut range = b.hands[&7].clone();
        range.insert("72o".into(), 3);
        b.hands.insert(8, range);
        b.candidates.push(Candidate { scenario_id: 8, spot_id: 2, format: "3max".into(), line: "btn:fold,sb:call".into(), opponent: "reg".into(), stack_bb: 10.0 });
        let preflop = format!("{LIMP}\nHero: Checks");
        let normal = evaluate(&input(&preflop, "7h 2c"), &b);
        assert_eq!(normal.scenario_id, Some(7));
        let reg = evaluate(&DecisionInput { opponent_is_reg: true, ..input(&preflop, "7h 2c") }, &b);
        assert_eq!((reg.scenario_id, reg.status), (Some(8), Status::Deviation));
    }

    #[test]
    fn hands_without_a_decision_are_skipped() {
        assert_eq!(evaluate(&DecisionInput { cards: None, ..input(LIMP, "Ah Kc") }, &book()).status, Status::Skipped);
        assert_eq!(evaluate(&input("Btn: Folds\nSb: Folds", "Ah Kc"), &book()).status, Status::Skipped, "the hero never acted");
    }
}
