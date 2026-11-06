//! A hand replayed action by action: what each player has left, the pot, the bet to match and who
//! is still in, as they stood just before every action.
//!
//! Pure and deterministic. It is built from the amounts of the action lines, so a bet nobody called
//! (the part handed back at the end of a hand) is counted in the pot, which only matters after the
//! last action. Antes go in the pot but are not a bet to match.

use super::actions::{Action, ActionKind};

/// Streets of a hand, in order: preflop, flop, turn, river.
pub const STREET_COUNT: usize = 4;

/// What stood before one action.
#[derive(Debug, Clone, PartialEq)]
pub struct Step {
    pub street: usize,
    /// Rank of the action among those of its street.
    pub index: usize,
    /// Index into the seats the replay was given.
    pub actor: usize,
    pub action: Action,
    pub pot_before: f64,
    /// Chips the actor still has behind, before the action.
    pub remaining_before: f64,
    /// The smaller of the actor's chips behind and the biggest stack behind among the other players
    /// still in the hand: what can really be won or lost.
    pub effective_before: f64,
    /// Chips the actor must add to match the highest bet of the street.
    pub to_call: f64,
    /// The highest total bet on the street before the action (blinds included preflop).
    pub highest_bet_before: f64,
    /// Size of the last bet or raise before this action: the increase it made over the bet before it.
    pub last_raise_increase: f64,
    /// Players still in the hand (not folded), the actor included.
    pub in_hand_before: usize,
    /// An all-in bet or raise that adds less than the last raise did: it does not reopen the betting,
    /// so the next raise is measured against the last full raise.
    pub incomplete_raise: bool,
}

struct Seat<'a> {
    name: &'a str,
    behind: f64,
    folded: bool,
}

fn seat_index(seats: &[Seat], name: &str) -> Option<usize> {
    seats.iter().position(|s| s.name.eq_ignore_ascii_case(name))
}

/// Replays `streets` for players that started with `stacks` `(name, chips)`. Actions of players
/// that are not in `stacks` are skipped.
pub fn replay(streets: [&[Action]; STREET_COUNT], stacks: &[(&str, f64)]) -> Vec<Step> {
    let mut seats: Vec<Seat> = stacks.iter().map(|(name, stack)| Seat { name, behind: stack.max(0.0), folded: false }).collect();
    let mut pot = 0.0;
    let mut steps = Vec::new();

    for (street, actions) in streets.iter().enumerate() {
        let mut committed = vec![0.0_f64; seats.len()];
        let mut highest = 0.0_f64;
        let mut last_increase = 0.0_f64;
        for (index, action) in actions.iter().enumerate() {
            let Some(actor) = seat_index(&seats, &action.player) else { continue };
            let behind = seats[actor].behind;
            let others_behind = seats.iter().enumerate().filter(|(i, s)| *i != actor && !s.folded).map(|(_, s)| s.behind).fold(0.0, f64::max);
            steps.push(Step {
                street,
                index,
                actor,
                action: action.clone(),
                pot_before: pot,
                remaining_before: behind,
                effective_before: behind.min(others_behind),
                to_call: (highest - committed[actor]).max(0.0),
                highest_bet_before: highest,
                last_raise_increase: last_increase,
                in_hand_before: seats.iter().filter(|s| !s.folded).count(),
                incomplete_raise: false,
            });

            // Chips added by this action, and the actor's total on the street afterwards.
            let amount = action.amount.unwrap_or(0.0);
            let (added, total) = match action.kind {
                ActionKind::Fold => {
                    seats[actor].folded = true;
                    (0.0, committed[actor])
                }
                ActionKind::Check => (0.0, committed[actor]),
                ActionKind::Post if action.is_ante => (amount, committed[actor]),
                ActionKind::Post | ActionKind::Call | ActionKind::Bet => (amount, committed[actor] + amount),
                ActionKind::Raise => {
                    let to = action.amount_to.unwrap_or(committed[actor] + amount);
                    ((to - committed[actor]).max(0.0), to)
                }
            };
            // An all-in can never put in more than the chips behind.
            let added = added.min(seats[actor].behind);
            seats[actor].behind -= added;
            pot += added;
            committed[actor] = if added < (total - committed[actor]) { committed[actor] + added } else { total };
            if !action.is_ante && committed[actor] > highest {
                // A blind is a bet of its whole size: the big blind sets the minimum raise.
                let increase = if action.kind == ActionKind::Post { committed[actor] } else { committed[actor] - highest };
                let incomplete = action.is_all_in && action.kind.is_aggressive() && increase < last_increase;
                if incomplete {
                    if let Some(step) = steps.last_mut() {
                        step.incomplete_raise = true;
                    }
                } else {
                    last_increase = increase;
                }
                highest = committed[actor];
            }
        }
    }
    steps
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engines::actions::parse_actions;

    const STACKS: [(&str, f64); 3] = [("Hero", 500.0), ("SB", 300.0), ("BB", 100.0)];

    fn run(preflop: &str, flop: &str) -> Vec<Step> {
        let (pre, flop) = (parse_actions(preflop), parse_actions(flop));
        replay([&pre, &flop, &[], &[]], &STACKS)
    }

    #[test]
    fn stacks_pot_and_bet_to_match_follow_the_actions() {
        let steps = run("SB posts small blind 10\nBB posts big blind 20\nHero raises 40 to 60\nSB calls 50\nBB folds", "SB checks\nHero bets 100");
        // Hero acts third: both blinds are in, Hero has not put chips in yet.
        let hero = &steps[2];
        assert_eq!((hero.pot_before, hero.to_call, hero.highest_bet_before), (30.0, 20.0, 20.0));
        assert_eq!(hero.last_raise_increase, 20.0);
        assert_eq!(hero.remaining_before, 500.0);
        // The big blind folds facing a raise to 60: 40 more to call.
        let bb = &steps[4];
        assert_eq!((bb.pot_before, bb.to_call, bb.in_hand_before), (30.0 + 60.0 + 50.0, 40.0, 3));
        // Flop: SB (240 behind after calling to 60) checks first, then Hero bets into 60 + 60 + 20.
        let flop_bet = &steps[6];
        assert_eq!((flop_bet.street, flop_bet.pot_before, flop_bet.to_call), (1, 140.0, 0.0));
        assert_eq!(flop_bet.remaining_before, 440.0);
        assert_eq!(flop_bet.in_hand_before, 2);
    }

    #[test]
    fn effective_stack_is_the_smallest_of_the_actor_and_the_biggest_opponent_still_in() {
        let steps = run("SB posts small blind 10\nBB posts big blind 20\nHero raises 40 to 60\nSB folds\nBB calls 40", "");
        // Hero 500 against SB (290 behind, still to act) and BB (80 behind): 290 is the biggest.
        assert_eq!(steps[2].effective_before, 290.0);
        // Once SB folded, BB's 80 chips behind are all there is to win from it.
        assert_eq!(steps[4].effective_before, 80.0_f64.min(440.0));
        let after_fold = run("SB posts small blind 10\nBB posts big blind 20\nHero raises 40 to 60\nSB folds\nBB folds", "");
        assert_eq!(after_fold[4].effective_before, 80.0);
    }

    #[test]
    fn an_all_in_cannot_put_in_more_than_the_chips_behind() {
        let pre = parse_actions("BB posts big blind 20\nBB calls 500 and is all-in\nBB checks");
        let capped = replay([&pre, &[], &[], &[]], &[("BB", 100.0), ("Hero", 500.0)]);
        assert_eq!(capped[1].remaining_before, 80.0);
        assert_eq!(capped[2].remaining_before, 0.0, "the chips behind never go below zero");
        assert_eq!(capped[2].pot_before, 100.0, "the pot holds what the player really had");
    }

    #[test]
    fn antes_go_in_the_pot_but_are_not_a_bet_to_match() {
        let steps = run("Hero posts ante 5\nSB posts ante 5\nBB posts ante 5\nSB posts small blind 10\nBB posts big blind 20\nHero calls 20", "");
        let hero_call = steps.last().unwrap();
        assert_eq!(hero_call.pot_before, 15.0 + 30.0);
        assert_eq!(hero_call.highest_bet_before, 20.0);
        assert_eq!(hero_call.to_call, 20.0, "the ante is not part of the bet to match");
        assert_eq!(hero_call.remaining_before, 495.0);
    }

    #[test]
    fn a_raise_moves_the_bet_to_match_and_records_its_increase() {
        let steps = run("SB posts small blind 10\nBB posts big blind 20\nHero raises 40 to 60\nSB raises 140 to 200\nBB folds\nHero calls 140", "");
        let facing = &steps[5];
        assert_eq!((facing.highest_bet_before, facing.last_raise_increase, facing.to_call), (200.0, 140.0, 140.0));
    }

    #[test]
    fn an_incomplete_all_in_raise_does_not_change_the_raise_to_beat() {
        let stacks = [("A", 1000.0), ("B", 300.0), ("C", 1000.0)];
        let pre = parse_actions("A raises 100 to 100
B raises 150 to 250 and is all-in
C calls 100
A raises 300 to 400");
        let steps = replay([&pre, &[], &[], &[]], &stacks);
        // B's 150 more is a raise by 150 over 100: that is a full raise (>= 100), so it counts.
        assert!(!steps[1].incomplete_raise);
        let pre = parse_actions("A raises 100 to 100
B raises 50 to 150 and is all-in
C calls 150
A raises 300 to 450");
        let steps = replay([&pre, &[], &[], &[]], &stacks);
        assert!(steps[1].incomplete_raise, "an increase of 50 is below the 100 raise before it");
        assert_eq!(steps[3].last_raise_increase, 100.0, "the raise to beat is still the last full one");
        assert_eq!(steps[3].highest_bet_before, 150.0);
    }

    #[test]
    fn unknown_players_are_skipped() {
        let pre = parse_actions("Ghost raises 40 to 60\nHero calls 60");
        assert_eq!(replay([&pre, &[], &[], &[]], &STACKS).len(), 1);
    }
}
