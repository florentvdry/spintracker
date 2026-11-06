//! A hand reduced to what a list of hands shows: the player's stack, cards and result, and for each
//! street the board, the pot and a short line per action.
//!
//! Pure and deterministic. Forced posts are left out: a list of hands reads as the decisions taken.

use serde::Serialize;

use super::actions::{big_blind, parse_actions, stack_in_bb, Action, ActionKind};
use super::hand_state::{replay, STREET_COUNT};

const STREET_NAMES: [&str; STREET_COUNT] = ["preflop", "flop", "turn", "river"];

pub struct HandInput<'a> {
    pub blinds: &'a str,
    /// The player the list is about: the actions of this player are marked as their own.
    pub player: &'a str,
    /// Every player's starting stack, in chips.
    pub stacks: &'a [(String, f64)],
    /// The action text of each street, as stored.
    pub actions: [&'a str; STREET_COUNT],
    /// Flop, turn and river, as stored.
    pub board: [&'a str; 3],
    /// The player's hole cards, as stored (empty when they were not shown).
    pub cards: &'a str,
    pub net_profit: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionView {
    /// Whether the action is the player's own.
    pub own: bool,
    pub kind: &'static str,
    /// What the action puts in, in big blinds: the amount of a bet or a call, the total of a raise.
    pub bb: Option<f64>,
    pub all_in: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreetView {
    pub street: &'static str,
    pub cards: Vec<String>,
    /// The pot when the street opens, in big blinds; unknown when nobody acted on it.
    pub pot_bb: Option<f64>,
    pub actions: Vec<ActionView>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HandSummary {
    pub stack_bb: Option<f64>,
    pub cards: Vec<String>,
    pub result_bb: Option<f64>,
    /// Only the streets that were dealt or played.
    pub streets: Vec<StreetView>,
}

/// Cards written as stored ("[Ah Kd]", "AhKd", "7c 8d 9h") as two-character cards.
pub fn split_cards(raw: &str) -> Vec<String> {
    let compact: Vec<char> = raw.chars().filter(|c| !matches!(c, ' ' | '[' | ']' | '|' | ',')).collect();
    compact.chunks(2).filter(|pair| pair.len() == 2).map(|pair| pair.iter().collect()).collect()
}

fn kind_name(kind: ActionKind) -> Option<&'static str> {
    match kind {
        ActionKind::Fold => Some("fold"),
        ActionKind::Check => Some("check"),
        ActionKind::Call => Some("call"),
        ActionKind::Bet => Some("bet"),
        ActionKind::Raise => Some("raise"),
        ActionKind::Post => None,
    }
}

fn chips_in(action: &Action) -> Option<f64> {
    match action.kind {
        ActionKind::Call | ActionKind::Bet => action.amount,
        ActionKind::Raise => action.amount_to.or(action.amount),
        ActionKind::Fold | ActionKind::Check | ActionKind::Post => None,
    }
}

pub fn summarize(input: &HandInput) -> HandSummary {
    let bb = big_blind(input.blinds);
    let in_bb = |chips: f64| (bb > 0).then(|| chips / bb as f64);

    let parsed: Vec<Vec<Action>> = input.actions.iter().map(|text| parse_actions(text)).collect();
    let stacks: Vec<(&str, f64)> = input.stacks.iter().map(|(name, stack)| (name.as_str(), *stack)).collect();
    let steps = replay([&parsed[0], &parsed[1], &parsed[2], &parsed[3]], &stacks);

    let own_stack = input.stacks.iter().find(|(name, _)| name.eq_ignore_ascii_case(input.player)).map(|(_, stack)| *stack);
    let board_cards: [Vec<String>; 4] = [Vec::new(), split_cards(input.board[0]), split_cards(input.board[1]), split_cards(input.board[2])];

    let streets = (0..STREET_COUNT)
        .filter_map(|street| {
            let actions: Vec<ActionView> = parsed[street]
                .iter()
                .filter_map(|a| {
                    Some(ActionView {
                        own: a.player.eq_ignore_ascii_case(input.player),
                        kind: kind_name(a.kind)?,
                        bb: chips_in(a).and_then(in_bb),
                        all_in: a.is_all_in,
                    })
                })
                .collect();
            let cards = board_cards[street].clone();
            if actions.is_empty() && cards.is_empty() {
                return None;
            }
            // The pot at the opening of a street is the one before its first action; preflop it would
            // only be the blinds.
            let pot_bb = (street > 0).then(|| steps.iter().find(|s| s.street == street)).flatten().and_then(|s| in_bb(s.pot_before));
            Some(StreetView { street: STREET_NAMES[street], cards, pot_bb, actions })
        })
        .collect();

    HandSummary {
        stack_bb: own_stack.and_then(|stack| stack_in_bb(stack, input.blinds)),
        cards: split_cards(input.cards),
        result_bb: in_bb(input.net_profit),
        streets,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input<'a>(stacks: &'a [(String, f64)], actions: [&'a str; STREET_COUNT]) -> HandInput<'a> {
        HandInput { blinds: "10/20", player: "Hero", stacks, actions, board: ["", "", ""], cards: "", net_profit: 0.0 }
    }

    fn stacks() -> Vec<(String, f64)> {
        vec![("Hero".into(), 320.0), ("Villain".into(), 500.0)]
    }

    #[test]
    fn cards_are_split_whatever_their_writing() {
        assert_eq!(split_cards("[Ah Kd]"), ["Ah", "Kd"]);
        assert_eq!(split_cards("AhKd"), ["Ah", "Kd"]);
        assert_eq!(split_cards("7c 8d 9h"), ["7c", "8d", "9h"]);
        assert!(split_cards("").is_empty());
        assert_eq!(split_cards("Ah K"), ["Ah"], "a dangling character is not a card");
    }

    #[test]
    fn a_hand_is_read_as_decisions_in_big_blinds_without_the_posts() {
        let stacks = stacks();
        let mut hand = input(
            &stacks,
            ["Hero posts big blind 20\nVillain posts small blind 10\nVillain raises 40 to 60\nHero raises 160 to 220\nVillain folds", "", "", ""],
        );
        hand.cards = "AhKd";
        hand.net_profit = 60.0;
        let summary = summarize(&hand);
        assert_eq!(summary.stack_bb, Some(16.0));
        assert_eq!(summary.result_bb, Some(3.0));
        assert_eq!(summary.cards, ["Ah", "Kd"]);
        assert_eq!(summary.streets.len(), 1, "streets nobody reached are left out");
        let preflop = &summary.streets[0];
        assert_eq!(preflop.street, "preflop");
        assert_eq!(preflop.pot_bb, None);
        let line: Vec<(bool, &str, Option<f64>)> = preflop.actions.iter().map(|a| (a.own, a.kind, a.bb)).collect();
        assert_eq!(line, [(false, "raise", Some(3.0)), (true, "raise", Some(11.0)), (false, "fold", None)]);
    }

    #[test]
    fn a_later_street_carries_its_board_and_the_pot_it_opened_with() {
        let stacks = stacks();
        let mut hand = input(
            &stacks,
            [
                "Villain posts small blind 10\nHero posts big blind 20\nVillain raises 40 to 60\nHero calls 40",
                "Hero checks\nVillain bets 50\nHero calls 50",
                "Hero checks\nVillain checks",
                "",
            ],
        );
        hand.board = ["7c Kd 2s", "4h", ""];
        let summary = summarize(&hand);
        let names: Vec<&str> = summary.streets.iter().map(|s| s.street).collect();
        assert_eq!(names, ["preflop", "flop", "turn"]);
        let flop = &summary.streets[1];
        assert_eq!(flop.cards, ["7c", "Kd", "2s"]);
        assert_eq!(flop.pot_bb, Some(6.0), "both players put 60 in before the flop");
        assert_eq!(summary.streets[2].pot_bb, Some(11.0));
        assert_eq!(summary.streets[2].cards, ["4h"]);
    }

    #[test]
    fn an_all_in_is_flagged_and_a_street_without_actions_keeps_its_cards() {
        let stacks = stacks();
        let mut hand = input(&stacks, ["Villain posts small blind 10\nHero posts big blind 20\nVillain raises 40 to 60\nHero raises 260 to 320 and is all-in\nVillain calls 260", "", "", ""]);
        hand.board = ["6d 2c Jh", "9s", "Kd"];
        let summary = summarize(&hand);
        assert!(summary.streets[0].actions.iter().any(|a| a.own && a.all_in));
        assert_eq!(summary.streets.len(), 4, "a runout is shown with its cards");
        assert_eq!(summary.streets[1].pot_bb, None);
        assert!(summary.streets[1].actions.is_empty());
    }

    #[test]
    fn unknown_blinds_leave_amounts_empty() {
        let stacks = stacks();
        let mut hand = input(&stacks, ["Villain raises 40 to 60\nHero folds", "", "", ""]);
        hand.blinds = "";
        let summary = summarize(&hand);
        assert_eq!(summary.stack_bb, None);
        assert_eq!(summary.streets[0].actions[0].bb, None);
    }
}
