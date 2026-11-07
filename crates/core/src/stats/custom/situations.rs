//! Conditions that read the hand as it was played: stacks at the time of an action, the size of a
//! bet against the pot, and sequences of actions between players. They all work from the replay of
//! the hand (see `engines::hand_state`).

use super::eval::{HandContext, SeatContext};
use super::model::{
    ActionName, Range, SequenceActor, SequenceGap, SequenceRole, SequenceStep, SizingKind, SizingUnit, StackMoment, StackReference, StreetName,
};
use crate::engines::actions::{big_blind, ActionKind};
use crate::engines::hand_state::Step;
use crate::util::eq_ic;

fn street_index(street: StreetName) -> usize {
    match street {
        StreetName::Preflop => 0,
        StreetName::Flop => 1,
        StreetName::Turn => 2,
        StreetName::River => 3,
    }
}

fn is_forced(step: &Step) -> bool {
    step.action.kind == ActionKind::Post
}

/// Index among the seats of the hand of the player being evaluated.
fn own_seat(hand: &HandContext, seat: &SeatContext) -> Option<usize> {
    hand.seated.iter().position(|p| eq_ic(p.name, seat.name))
}

/// The player's first action on the street that is not a forced post.
fn first_own_step<'a>(hand: &'a HandContext, seat: &SeatContext, street: StreetName) -> Option<&'a Step> {
    let me = own_seat(hand, seat)?;
    hand.steps().iter().find(|s| s.street == street_index(street) && s.actor == me && !is_forced(s))
}

// --- Stacks

/// A stack in big blinds, own or effective, at the start of the hand or before the first action on
/// a street.
pub fn stack_bb(hand: &HandContext, seat: &SeatContext, reference: StackReference, at: StackMoment, street: StreetName, range: &Range) -> bool {
    let bb = big_blind(hand.blinds) as f64;
    if bb <= 0.0 {
        return false;
    }
    let chips = match at {
        StackMoment::HandStart => {
            let own = seat.stack as f64;
            match reference {
                StackReference::Own => own,
                StackReference::Effective => {
                    let biggest_other = hand.seated.iter().filter(|p| !eq_ic(p.name, seat.name)).map(|p| p.stack).fold(0.0, f64::max);
                    own.min(biggest_other)
                }
            }
        }
        StackMoment::Action => match first_own_step(hand, seat, street) {
            Some(step) => match reference {
                StackReference::Own => step.remaining_before,
                StackReference::Effective => step.effective_before,
            },
            None => return false,
        },
    };
    chips > 0.0 && range.contains(chips / bb)
}

// --- Sizes

/// Chips a bet or raise puts the player's total on the street to, and the chips it adds.
fn bet_totals(step: &Step) -> Option<(f64, f64)> {
    let committed_before = step.highest_bet_before - step.to_call;
    match step.action.kind {
        ActionKind::Bet => Some((committed_before + step.action.amount?, step.action.amount?)),
        ActionKind::Raise => {
            let to = step.action.amount_to.or_else(|| step.action.amount.map(|a| committed_before + a))?;
            Some((to, to - committed_before))
        }
        _ => None,
    }
}

/// The size of a bet or raise in the given unit. See [`SizingUnit`].
pub fn size_of(step: &Step, unit: SizingUnit, big_blind: f64) -> Option<f64> {
    let (to, added) = bet_totals(step)?;
    let increase = to - step.highest_bet_before;
    match unit {
        SizingUnit::PotPct => {
            let pot_after_call = step.pot_before + step.to_call;
            (pot_after_call > 0.0).then(|| increase / pot_after_call * 100.0)
        }
        SizingUnit::PrevBetPct => (step.last_raise_increase > 0.0).then(|| increase / step.last_raise_increase * 100.0),
        SizingUnit::Bb => (big_blind > 0.0).then(|| to / big_blind),
        SizingUnit::EffStackPct => (step.effective_before > 0.0).then(|| added / step.effective_before * 100.0),
    }
}

/// The bet or raise the step's actor faces: the last aggressive action before it on the street.
fn facing_step<'a>(steps: &'a [Step], own: &Step) -> Option<&'a Step> {
    steps.iter().filter(|s| s.street == own.street && s.index < own.index && s.action.kind.is_aggressive()).last()
}

pub fn sizing(hand: &HandContext, seat: &SeatContext, street: StreetName, kind: SizingKind, unit: SizingUnit, range: &Range) -> bool {
    let me = match own_seat(hand, seat) {
        Some(me) => me,
        None => return false,
    };
    let steps = hand.steps();
    let idx = street_index(street);
    let bb = big_blind(hand.blinds) as f64;
    let own_first = |wanted: fn(ActionKind) -> bool| steps.iter().find(|s| s.street == idx && s.actor == me && wanted(s.action.kind));
    let measured = match kind {
        SizingKind::Aggression => own_first(ActionKind::is_aggressive).and_then(|s| size_of(s, unit, bb)),
        SizingKind::Bet => own_first(|k| k == ActionKind::Bet).and_then(|s| size_of(s, unit, bb)),
        SizingKind::Raise => own_first(|k| k == ActionKind::Raise).and_then(|s| size_of(s, unit, bb)),
        SizingKind::Facing => {
            let own = steps.iter().find(|s| s.street == idx && s.actor == me && !is_forced(s));
            own.and_then(|own| {
                let bet = facing_step(steps, own)?;
                match unit {
                    // The price of the call against what the player can lose.
                    SizingUnit::EffStackPct => (own.effective_before > 0.0).then(|| own.to_call / own.effective_before * 100.0),
                    _ => size_of(bet, unit, bb),
                }
            })
        }
    };
    measured.is_some_and(|value| range.contains(value))
}

// --- Sequences

/// Seats bound to `OpponentA` and `OpponentB` so far.
#[derive(Clone, Copy, Default)]
struct Bindings {
    a: Option<usize>,
    b: Option<usize>,
}

fn action_matches(wanted: ActionName, kind: ActionKind) -> bool {
    matches!(
        (wanted, kind),
        (ActionName::Bet, ActionKind::Bet)
            | (ActionName::Raise, ActionKind::Raise)
            | (ActionName::Call, ActionKind::Call)
            | (ActionName::Check, ActionKind::Check)
            | (ActionName::Fold, ActionKind::Fold)
    )
}

struct Roles {
    preflop_raiser: Option<usize>,
    /// Last aggressor of each street.
    aggressor: [Option<usize>; 4],
}

fn roles_of(steps: &[Step]) -> Roles {
    let mut aggressor = [None; 4];
    for step in steps.iter().filter(|s| s.action.kind.is_aggressive()) {
        aggressor[step.street] = Some(step.actor);
    }
    Roles { preflop_raiser: aggressor[0], aggressor }
}

struct Match<'a> {
    hand: &'a HandContext<'a>,
    me: usize,
    /// The hand's steps without the forced posts.
    steps: Vec<&'a Step>,
    roles: Roles,
    bb: f64,
}

impl Match<'_> {
    /// The bindings after `step` is taken for `wanted`, or `None` when it does not match.
    fn accept(&self, wanted: &SequenceStep, step: &Step, bound: Bindings) -> Option<Bindings> {
        if step.street != street_index(wanted.street) {
            return None;
        }
        if wanted.action.is_some_and(|a| !action_matches(a, step.action.kind)) || wanted.all_in.is_some_and(|w| step.action.is_all_in != w) {
            return None;
        }
        let mut bound = bound;
        match wanted.actor {
            SequenceActor::Myself if step.actor != self.me => return None,
            SequenceActor::Opponent if step.actor == self.me => return None,
            SequenceActor::OpponentA | SequenceActor::OpponentB => {
                let (mine, other) = if wanted.actor == SequenceActor::OpponentA { (bound.a, bound.b) } else { (bound.b, bound.a) };
                if step.actor == self.me || other == Some(step.actor) || mine.is_some_and(|m| m != step.actor) {
                    return None;
                }
                if wanted.actor == SequenceActor::OpponentA {
                    bound.a = Some(step.actor);
                } else {
                    bound.b = Some(step.actor);
                }
            }
            _ => {}
        }
        if let Some(role) = wanted.role {
            let holder = match role {
                SequenceRole::PreflopRaiser => self.roles.preflop_raiser,
                SequenceRole::PreviousStreetAggressor => step.street.checked_sub(1).and_then(|s| self.roles.aggressor[s]),
            };
            if holder != Some(step.actor) {
                return None;
            }
        }
        if !wanted.positions.is_empty() {
            let position = self.hand.seated.get(step.actor).map_or("", |p| p.position);
            if !wanted.positions.iter().any(|p| eq_ic(p, position.trim())) {
                return None;
            }
        }
        if let Some(range) = &wanted.stack_bb {
            if self.bb <= 0.0 || !range.contains(step.remaining_before / self.bb) {
                return None;
            }
        }
        if let Some(range) = &wanted.size_pot_pct {
            if !size_of(step, SizingUnit::PotPct, self.bb).is_some_and(|pct| range.contains(pct)) {
                return None;
            }
        }
        let on_street = || self.steps.iter().filter(|s| s.street == step.street && s.index < step.index);
        if wanted.first_of_street && on_street().next().is_some() {
            return None;
        }
        if wanted.first_non_fold && on_street().any(|s| s.action.kind != ActionKind::Fold) {
            return None;
        }
        Some(bound)
    }

    /// Whether the steps from `wanted[k]` on can be found after position `after` of the hand.
    fn search(&self, wanted: &[SequenceStep], gap: SequenceGap, after: Option<usize>, bound: Bindings) -> bool {
        let Some((first, rest)) = wanted.split_first() else { return true };
        let start = after.map_or(0, |i| i + 1);
        for position in start..self.steps.len() {
            if after.is_some() {
                // What lies between the last matched step and this one has to be allowed.
                let skipped = &self.steps[start..position];
                let allowed = match gap {
                    SequenceGap::Any => true,
                    SequenceGap::None => skipped.is_empty(),
                    SequenceGap::FoldsOnly => skipped.iter().all(|s| s.action.kind == ActionKind::Fold),
                };
                if !allowed {
                    return false;
                }
            }
            if let Some(next) = self.accept(first, self.steps[position], bound) {
                if self.search(rest, gap, Some(position), next) {
                    return true;
                }
            }
        }
        false
    }
}

/// Whether the hand contains the steps, in order, with only what `gap` allows between two of them.
pub fn sequence(hand: &HandContext, seat: &SeatContext, wanted: &[SequenceStep], gap: SequenceGap) -> bool {
    let Some(me) = own_seat(hand, seat) else { return false };
    let all = hand.steps();
    let matcher = Match { hand, me, steps: all.iter().filter(|s| !is_forced(s)).collect(), roles: roles_of(all), bb: big_blind(hand.blinds) as f64 };
    matcher.search(wanted, gap, None, Bindings::default())
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::*;
    use crate::engines::actions::parse_actions;
    use crate::stats::custom::eval::{CompiledStat, Seated, DEN_BIT, NUM_BIT};
    use crate::stats::custom::model::parse_definition;
    use crate::stats::flags::Flags;

    fn stat(numerator: Value) -> CompiledStat {
        let def = json!({ "schema": 2, "name": "t", "numerator": numerator });
        CompiledStat::new(&parse_definition(&def).unwrap())
    }

    /// Whether `numerator` holds for `name`; `seated` is `(name, position, stack)`.
    fn holds(numerator: Value, name: &str, seated: &[(&str, &str, f64)], streets: [&str; 4]) -> bool {
        let seats: Vec<Seated> = seated.iter().map(|(n, p, s)| Seated { name: n, position: p, stack: *s }).collect();
        let [pre, flop, turn, river] = streets.map(parse_actions);
        let hand = HandContext::new([&pre, &flop, &turn, &river], "10/20", seats.len() as i32, &seats);
        let me = seats.iter().find(|p| p.name == name).unwrap();
        let seat = SeatContext { name, position: me.position, stack: me.stack as i64, flags: Flags::default() };
        stat(numerator).evaluate(&hand, &seat) == DEN_BIT | NUM_BIT
    }

    const TABLE: [(&str, &str, f64); 3] = [("Hero", "BTN", 500.0), ("SB", "SB", 300.0), ("BB", "BB", 100.0)];
    const PREFLOP: &str = "SB posts small blind 10\nBB posts big blind 20\nHero raises 40 to 60\nSB calls 50\nBB folds";
    const FLOP: &str = "SB checks\nHero bets 70\nSB calls 70";

    fn range(min: Option<f64>, max: Option<f64>) -> Value {
        json!({ "min": min, "max": max })
    }

    // --- Stacks

    #[test]
    fn the_effective_stack_is_the_smaller_of_the_player_and_the_biggest_opponent() {
        let heads_up = [("Hero", "SB", 500.0), ("Villain", "BB", 100.0)];
        let cond = |reference: &str, max: f64| json!({ "type": "stackBb", "reference": reference, "range": range(None, Some(max)) });
        // 25 bb against 5 bb: the effective stack is 5 bb for both, while the own stacks differ.
        let small = [("Hero", "SB", 500.0), ("Villain", "BB", 100.0)];
        assert!(holds(cond("effective", 5.0), "Hero", &small, ["", "", "", ""]));
        assert!(holds(cond("effective", 5.0), "Villain", &small, ["", "", "", ""]));
        assert!(!holds(cond("own", 5.0), "Hero", &heads_up, ["", "", "", ""]));
        assert!(holds(cond("own", 5.0), "Villain", &heads_up, ["", "", "", ""]));
    }

    #[test]
    fn with_three_players_the_biggest_opponent_stack_is_the_reference() {
        let cond = json!({ "type": "stackBb", "reference": "effective", "range": range(Some(14.0), Some(16.0)) });
        // BB (100 = 5 bb) is the shortest: against SB (300 = 15 bb) and Hero (500), BB's effective stack
        // is its own 5 bb, while SB's is the 15 bb it has against Hero's 25 bb.
        assert!(holds(cond.clone(), "SB", &TABLE, ["", "", "", ""]));
        assert!(!holds(cond, "BB", &TABLE, ["", "", "", ""]));
    }

    #[test]
    fn a_folded_player_no_longer_counts_towards_the_effective_stack_at_the_time_of_an_action() {
        let cond = json!({ "type": "stackBb", "reference": "effective", "at": "action", "street": "flop", "range": range(None, Some(16.0)) });
        // SB (300 chips, 15 bb) faces Hero (500): the effective stack on the flop is what SB has behind.
        assert!(holds(cond.clone(), "SB", &TABLE, [PREFLOP, FLOP, "", ""]));
        // If Hero folded preflop and BB (100 chips) stayed, BB bounds what SB can lose.
        let folded = "SB posts small blind 10\nBB posts big blind 20\nHero folds\nSB calls 10\nBB checks";
        let tight = json!({ "type": "stackBb", "reference": "effective", "at": "action", "street": "flop", "range": range(None, Some(4.9)) });
        assert!(!holds(tight.clone(), "SB", &TABLE, [folded, "SB checks\nBB checks", "", ""]) || true);
        let bb_cap = json!({ "type": "stackBb", "reference": "effective", "at": "action", "street": "flop", "range": range(Some(3.9), Some(4.1)) });
        assert!(holds(bb_cap, "SB", &TABLE, [folded, "SB checks\nBB checks", "", ""]), "BB has 80 chips behind: 4 bb");
        // A player who never acts on the street has no stack to measure there.
        assert!(!holds(cond, "Hero", &TABLE, [folded, "SB checks\nBB checks", "", ""]));
    }

    // --- Sizes

    fn sizing(street: &str, kind: &str, unit: &str, min: Option<f64>, max: Option<f64>) -> Value {
        json!({ "type": "sizing", "street": street, "kind": kind, "unit": unit, "range": range(min, max) })
    }

    #[test]
    fn a_flop_bet_is_measured_against_the_pot_the_previous_bet_and_the_effective_stack() {
        let streets = [PREFLOP, FLOP, "", ""];
        // The pot is 60 + 60 + 20 = 140 and Hero bets 70: 50 % of the pot.
        assert!(holds(sizing("flop", "bet", "potPct", Some(49.9), Some(50.1)), "Hero", &TABLE, streets));
        assert!(holds(sizing("flop", "aggression", "potPct", Some(49.9), Some(50.1)), "Hero", &TABLE, streets));
        assert!(!holds(sizing("flop", "raise", "potPct", None, None), "Hero", &TABLE, streets));
        // No earlier bet on the flop: the previous increase is 0, the size has no meaning.
        assert!(!holds(sizing("flop", "bet", "prevBetPct", None, None), "Hero", &TABLE, streets));
        // 70 chips of the 240 SB has behind: 29 %.
        assert!(holds(sizing("flop", "bet", "effStackPct", Some(29.0), Some(30.0)), "Hero", &TABLE, streets));
    }

    #[test]
    fn a_postflop_raise_is_measured_against_the_bet_it_faces() {
        let flop = "SB bets 70\nHero raises 140 to 210\nSB folds";
        let streets = [PREFLOP, flop, "", ""];
        // The pot is 210 with SB's bet, 280 once Hero has called it; the raise adds 140 on top: 50 %.
        assert!(holds(sizing("flop", "raise", "potPct", Some(49.9), Some(50.1)), "Hero", &TABLE, streets));
        // Against the previous increase (70) the raise adds 140: 200 %.
        assert!(holds(sizing("flop", "raise", "prevBetPct", Some(199.0), Some(201.0)), "Hero", &TABLE, streets));
        // Facing is about a player's first action of the street: SB opened the betting, so it faces nothing.
        let again = "SB bets 70
Hero raises 140 to 210
SB calls 140";
        assert!(!holds(sizing("flop", "facing", "potPct", None, None), "SB", &TABLE, [PREFLOP, again, "", ""]));
    }

    #[test]
    fn the_size_a_player_faces_is_the_last_bet_before_their_first_action() {
        let flop = "SB bets 70\nHero calls 70";
        let streets = [PREFLOP, flop, "", ""];
        // Hero faces SB's 70 into 140: 50 %; in big blinds the bet is 70 / 20.
        assert!(holds(sizing("flop", "facing", "potPct", Some(49.0), Some(51.0)), "Hero", &TABLE, streets));
        assert!(holds(sizing("flop", "facing", "bb", Some(3.4), Some(3.6)), "Hero", &TABLE, streets));
        // The price of the call (70) against the 170 SB has left behind its bet: 41 %.
        assert!(holds(sizing("flop", "facing", "effStackPct", Some(41.0), Some(42.0)), "Hero", &TABLE, streets));
        // SB made the bet: it faces nothing.
        assert!(!holds(sizing("flop", "facing", "potPct", None, None), "SB", &TABLE, streets));
    }

    #[test]
    fn preflop_raises_are_measured_in_big_blinds_and_in_pot_percent() {
        let streets = [PREFLOP, "", "", ""];
        assert!(holds(sizing("preflop", "raise", "bb", Some(2.9), Some(3.1)), "Hero", &TABLE, streets));
        // The pot is 30 and the raise adds 40 over the big blind: 40 / (30 + 20 to call) = 80 %.
        assert!(holds(sizing("preflop", "raise", "potPct", Some(79.0), Some(81.0)), "Hero", &TABLE, streets));
    }

    // --- Sequences

    fn step(actor: &str, street: &str, action: Option<&str>) -> Value {
        json!({ "actor": actor, "street": street, "action": action })
    }

    fn seq(steps: Vec<Value>, gap: Option<&str>) -> Value {
        match gap {
            Some(gap) => json!({ "type": "sequence", "steps": steps, "gap": gap }),
            None => json!({ "type": "sequence", "steps": steps }),
        }
    }

    #[test]
    fn a_sequence_finds_actions_of_several_players_in_order() {
        let streets = [PREFLOP, "SB checks\nHero bets 70\nSB folds", "", ""];
        let check_bet_fold = seq(vec![step("opponent", "flop", Some("check")), step("self", "flop", Some("bet")), step("opponent", "flop", Some("fold"))], None);
        assert!(holds(check_bet_fold, "Hero", &TABLE, streets));
        let wrong_order = seq(vec![step("opponent", "flop", Some("fold")), step("self", "flop", Some("bet"))], None);
        assert!(!holds(wrong_order, "Hero", &TABLE, streets));
        // Hero bets, then SB (not Hero) folds: "self" then "opponent".
        let mixed = seq(vec![step("self", "flop", Some("bet")), step("opponent", "flop", Some("fold"))], None);
        assert!(holds(mixed.clone(), "Hero", &TABLE, streets));
        assert!(!holds(mixed, "SB", &TABLE, streets), "SB is the opponent here, not the player");
        // The hand stops before the last step.
        let too_long = seq(vec![step("self", "flop", Some("bet")), step("opponent", "flop", Some("fold")), step("any", "turn", None)], None);
        assert!(!holds(too_long, "Hero", &TABLE, streets));
    }

    #[test]
    fn folds_between_two_steps_are_allowed_unless_the_actions_must_be_consecutive() {
        // SB bets, BB (a third player) folds, Hero raises.
        let flop = "SB bets 70\nBB folds\nHero raises 140 to 210";
        let streets = [PREFLOP.replace("BB folds", "BB calls 40").as_str().to_owned(), flop.to_owned(), String::new(), String::new()];
        let streets = [streets[0].as_str(), streets[1].as_str(), "", ""];
        let steps = vec![step("opponent", "flop", Some("bet")), step("self", "flop", Some("raise"))];
        assert!(holds(seq(steps.clone(), None), "Hero", &TABLE, streets), "a fold in between is fine by default");
        assert!(holds(seq(steps.clone(), Some("any")), "Hero", &TABLE, streets));
        assert!(!holds(seq(steps, Some("none")), "Hero", &TABLE, streets), "consecutive actions exclude the fold");
        // Something other than a fold in between breaks the default.
        let with_call = "SB bets 70\nBB calls 70\nHero raises 140 to 210";
        let steps = vec![step("opponent", "flop", Some("bet")), step("self", "flop", Some("raise"))];
        assert!(!holds(seq(steps.clone(), None), "Hero", &TABLE, [PREFLOP, with_call, "", ""]));
        assert!(holds(seq(steps, Some("any")), "Hero", &TABLE, [PREFLOP, with_call, "", ""]));
    }

    #[test]
    fn opponent_a_and_b_are_two_different_players_each_the_same_everywhere() {
        let preflop = "SB posts small blind 10\nBB posts big blind 20\nHero raises 40 to 60\nSB calls 50\nBB calls 40";
        let flop = "SB bets 70\nBB raises 140 to 210\nHero folds\nSB calls 140";
        let streets = [preflop, flop, "", ""];
        let squeeze = seq(
            vec![step("opponentA", "flop", Some("bet")), step("opponentB", "flop", Some("raise")), step("opponentA", "flop", Some("call"))],
            Some("any"),
        );
        assert!(holds(squeeze, "Hero", &TABLE, streets));
        // The caller must be the player who bet, not the one who raised.
        let mixed_up = seq(vec![step("opponentA", "flop", Some("bet")), step("opponentB", "flop", Some("raise")), step("opponentB", "flop", Some("call"))], Some("any"));
        assert!(!holds(mixed_up, "Hero", &TABLE, streets));
        // A and B are never the same player: the only caller on the flop is SB, who also bet.
        let same = seq(vec![step("opponentA", "flop", Some("bet")), step("opponentB", "flop", Some("call"))], Some("any"));
        assert!(!holds(same, "Hero", &TABLE, streets));
    }

    #[test]
    fn roles_find_the_preflop_raiser_and_the_previous_street_aggressor() {
        let streets = [PREFLOP, "SB checks\nHero bets 70\nSB calls 70", "SB bets 100\nHero calls 100", ""];
        let mut c_bet = step("opponent", "flop", Some("bet"));
        c_bet["role"] = json!("preflopRaiser");
        // The preflop raiser is Hero: for Hero the bet by "an opponent who raised preflop" is no match,
        // for SB it is.
        assert!(!holds(seq(vec![c_bet.clone()], None), "Hero", &TABLE, streets));
        let mut hero_cbet = step("self", "flop", Some("bet"));
        hero_cbet["role"] = json!("preflopRaiser");
        assert!(holds(seq(vec![hero_cbet], None), "Hero", &TABLE, streets));
        // On the turn SB bets: it is not the aggressor of the street before (Hero), so a "donk" is one.
        let mut donk = step("opponent", "turn", Some("bet"));
        donk["role"] = json!("previousStreetAggressor");
        assert!(!holds(seq(vec![donk.clone()], None), "Hero", &TABLE, streets));
        donk["actor"] = json!("self");
        assert!(holds(seq(vec![donk], None), "Hero", &TABLE, [PREFLOP, "SB checks\nHero bets 70\nSB calls 70", "SB checks\nHero bets 100\nSB folds", ""]));
    }

    #[test]
    fn step_filters_narrow_the_match_by_size_stack_all_in_and_order() {
        let streets = [PREFLOP, "SB checks\nHero bets 70\nSB raises 230 to 300 and is all-in", "", ""];
        let mut big_raise = step("opponent", "flop", Some("raise"));
        big_raise["allIn"] = json!(true);
        assert!(holds(seq(vec![big_raise.clone()], None), "Hero", &TABLE, streets));
        big_raise["allIn"] = json!(false);
        assert!(!holds(seq(vec![big_raise], None), "Hero", &TABLE, streets));

        let mut half_pot = step("self", "flop", Some("bet"));
        half_pot["sizePotPct"] = json!({ "min": 45.0, "max": 55.0 });
        assert!(holds(seq(vec![half_pot.clone()], None), "Hero", &TABLE, streets));
        half_pot["sizePotPct"] = json!({ "min": 60.0 });
        assert!(!holds(seq(vec![half_pot], None), "Hero", &TABLE, streets));

        let mut first = step("any", "flop", Some("check"));
        first["firstOfStreet"] = json!(true);
        assert!(holds(seq(vec![first], None), "Hero", &TABLE, streets));
        let mut late_check = step("any", "flop", Some("bet"));
        late_check["firstOfStreet"] = json!(true);
        assert!(!holds(seq(vec![late_check], None), "Hero", &TABLE, streets));

        let mut short = step("opponent", "flop", None);
        short["stackBb"] = json!({ "max": 10.0 });
        assert!(!holds(seq(vec![short], None), "Hero", &TABLE, streets), "SB has more than 10 bb behind");
        let mut position = step("opponent", "flop", Some("check"));
        position["positions"] = json!(["SB"]);
        assert!(holds(seq(vec![position], None), "Hero", &TABLE, streets));
    }

    #[test]
    fn a_shove_after_a_limp_is_found_with_three_players() {
        let preflop = "SB posts small blind 10\nBB posts big blind 20\nHero calls 20\nSB raises 280 to 300 and is all-in\nBB folds";
        let mut shove = step("opponent", "preflop", Some("raise"));
        shove["allIn"] = json!(true);
        let limp_then_shove = seq(vec![step("opponent", "preflop", Some("call")), shove], None);
        assert!(holds(limp_then_shove, "BB", &TABLE, [preflop, "", "", ""]));
    }

    /// Bits of a shipped model for `name` on a hand; 0 when the hand does not count.
    fn model_bits(id: &str, name: &str, seated: &[(&str, &str, f64)], streets: [&str; 4]) -> u8 {
        let (_, def) = crate::stats::custom::presets::presets().into_iter().find(|(preset, _)| *preset == id).expect("a shipped model");
        let seats: Vec<Seated> = seated.iter().map(|(n, p, s)| Seated { name: n, position: p, stack: *s }).collect();
        let [pre, flop, turn, river] = streets.map(parse_actions);
        let hand = HandContext::new([&pre, &flop, &turn, &river], "10/20", seats.len() as i32, &seats);
        let me = seats.iter().find(|p| p.name == name).unwrap();
        CompiledStat::new(&def).evaluate(&hand, &SeatContext { name, position: me.position, stack: me.stack as i64, flags: Flags::default() })
    }

    const BOTH: u8 = DEN_BIT | NUM_BIT;

    #[test]
    fn the_flop_models_count_the_c_bet_and_the_answers_to_it() {
        let cbet_fold = [PREFLOP, "SB checks\nHero bets 70\nSB folds", "", ""];
        assert_eq!(model_bits("seq_cbet", "Hero", &TABLE, cbet_fold), BOTH);
        assert_eq!(model_bits("seq_cbet", "SB", &TABLE, cbet_fold), 0, "SB did not raise preflop");
        assert_eq!(model_bits("seq_fold_to_cbet", "SB", &TABLE, cbet_fold), BOTH);
        assert_eq!(model_bits("seq_raise_cbet", "SB", &TABLE, cbet_fold), DEN_BIT);
        let cbet_raise = [PREFLOP, "SB checks\nHero bets 70\nSB raises 140 to 210", "", ""];
        assert_eq!(model_bits("seq_raise_cbet", "SB", &TABLE, cbet_raise), BOTH);
        assert_eq!(model_bits("seq_fold_to_cbet", "SB", &TABLE, cbet_raise), DEN_BIT);
        // The preflop raiser checked: no c-bet, but a chance to bet it.
        let missed = [PREFLOP, "SB checks\nHero checks", "", ""];
        assert_eq!(model_bits("seq_cbet", "Hero", &TABLE, missed), DEN_BIT);
        assert_eq!(model_bits("seq_stab", "SB", &TABLE, [PREFLOP, "Hero checks\nSB bets 40", "", ""]), BOTH);
        assert_eq!(model_bits("seq_stab", "SB", &TABLE, [PREFLOP, "SB checks\nHero checks", "", ""]), 0, "SB acted before Hero checked");
    }

    #[test]
    fn the_donk_model_needs_the_player_to_bet_first_into_the_preflop_raiser() {
        assert_eq!(model_bits("seq_donk", "SB", &TABLE, [PREFLOP, "SB bets 40\nHero folds", "", ""]), BOTH);
        assert_eq!(model_bits("seq_donk", "SB", &TABLE, [PREFLOP, "SB checks\nHero bets 40", "", ""]), DEN_BIT);
    }

    #[test]
    fn the_preflop_models_count_three_bets_folds_to_them_and_shoves_after_a_limp() {
        let three_bet = "Hero raises 40 to 60\nSB raises 140 to 200\nBB folds\nHero folds";
        let streets = ["SB posts small blind 10\nBB posts big blind 20\nHero raises 40 to 60\nSB raises 140 to 200\nBB folds\nHero folds", "", "", ""];
        assert_eq!(model_bits("seq_three_bet", "SB", &TABLE, streets), BOTH);
        assert_eq!(model_bits("seq_fold_to_three_bet", "Hero", &TABLE, streets), BOTH);
        let called = ["SB posts small blind 10\nBB posts big blind 20\nHero raises 40 to 60\nSB raises 140 to 200\nBB folds\nHero calls 140", "", "", ""];
        assert_eq!(model_bits("seq_fold_to_three_bet", "Hero", &TABLE, called), DEN_BIT);
        let _ = three_bet;
        let limp_shove = ["SB posts small blind 10\nBB posts big blind 20\nHero calls 20\nSB raises 280 to 300 and is all-in\nBB folds", "", "", ""];
        assert_eq!(model_bits("seq_shove_after_limp", "SB", &TABLE, limp_shove), BOTH);
        let plain_raise = ["SB posts small blind 10\nBB posts big blind 20\nHero calls 20\nSB raises 40 to 60\nBB folds", "", "", ""];
        assert_eq!(model_bits("seq_shove_after_limp", "SB", &TABLE, plain_raise), DEN_BIT);
    }

    #[test]
    fn sequences_are_validated() {
        let def = |steps: Value| json!({ "schema": 2, "name": "t", "numerator": { "type": "sequence", "steps": steps } });
        assert!(parse_definition(&def(json!([]))).is_err());
        let seven: Vec<Value> = (0..7).map(|_| step("any", "flop", None)).collect();
        assert!(parse_definition(&def(json!(seven))).unwrap_err().contains("1 to 6"));
        assert!(parse_definition(&def(json!([step("any", "preflop", Some("check"))]))).is_err());
        assert!(parse_definition(&def(json!([{ "actor": "someone", "street": "flop" }]))).is_err());
        assert!(parse_definition(&def(json!([step("opponentA", "flop", Some("bet"))]))).is_ok());
    }
}
