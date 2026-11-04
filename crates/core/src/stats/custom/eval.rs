//! Evaluating a custom stat for one player in one hand.
//!
//! Pure and deterministic: the result depends only on the parsed actions, the seat and the flags.

use std::collections::HashMap;

use super::model::{flag_by_name, ActionName, Cond, CustomStatDef, Filters, StreetName};
use crate::engines::actions::{raise_size_bb, stack_in_bb, Action, ActionKind};
use crate::stats::flags::{Flag, Flags};
use crate::util::eq_ic;

/// Bit set when the denominator holds.
pub const DEN_BIT: u8 = 1;
/// Bit set when the numerator holds (only ever together with `DEN_BIT`).
pub const NUM_BIT: u8 = 2;

/// The hand a stat is evaluated on.
pub struct HandContext<'a> {
    pub preflop: &'a [Action],
    pub flop: &'a [Action],
    pub turn: &'a [Action],
    pub river: &'a [Action],
    pub blinds: &'a str,
    pub player_count: i32,
}

/// The player a stat is evaluated for.
pub struct SeatContext<'a> {
    pub name: &'a str,
    /// Position as stored ("BTN", "SB", "BB").
    pub position: &'a str,
    pub stack: i64,
    pub flags: Flags,
}

/// A condition with its flag names resolved, built once per definition.
#[derive(Debug, Clone)]
enum Node {
    And(Vec<Node>),
    Or(Vec<Node>),
    Not(Box<Node>),
    Flag(Flag),
    Predicate(Cond),
}

fn compile_cond(cond: &Cond) -> Node {
    match cond {
        Cond::And { items } => Node::And(items.iter().map(compile_cond).collect()),
        Cond::Or { items } => Node::Or(items.iter().map(compile_cond).collect()),
        Cond::Not { item } => Node::Not(Box::new(compile_cond(item))),
        // Validation guarantees the name exists; an unknown one can never hold.
        Cond::Flag { name } => flag_by_name(name).map_or_else(|| Node::Or(Vec::new()), Node::Flag),
        other => Node::Predicate(other.clone()),
    }
}

/// A validated definition ready to be evaluated many times.
#[derive(Debug, Clone)]
pub struct CompiledStat {
    numerator: Node,
    denominator: Option<Node>,
    filters: Filters,
}

impl CompiledStat {
    pub fn new(def: &CustomStatDef) -> Self {
        CompiledStat {
            numerator: compile_cond(&def.numerator),
            denominator: def.denominator.as_ref().map(compile_cond),
            filters: def.filters.clone(),
        }
    }

    /// `0` when the hand does not count, else `DEN_BIT` plus `NUM_BIT` when the numerator holds.
    pub fn evaluate(&self, hand: &HandContext, seat: &SeatContext) -> u8 {
        if !passes_filters(&self.filters, hand, seat) {
            return 0;
        }
        let facts = Facts::new(hand, seat);
        if let Some(den) = &self.denominator {
            if !holds(den, &facts) {
                return 0;
            }
        }
        if holds(&self.numerator, &facts) {
            DEN_BIT | NUM_BIT
        } else {
            DEN_BIT
        }
    }
}

fn passes_filters(filters: &Filters, hand: &HandContext, seat: &SeatContext) -> bool {
    if !filters.positions.is_empty() && !filters.positions.iter().any(|p| eq_ic(p, seat.position.trim())) {
        return false;
    }
    if !filters.table_sizes.is_empty() && !filters.table_sizes.contains(&hand.player_count) {
        return false;
    }
    match &filters.stack_bb {
        Some(range) => stack_in_bb(seat.stack as f64, hand.blinds).is_some_and(|bb| range.contains(bb)),
        None => true,
    }
}

/// Everything a predicate reads, worked out lazily and shared by the leaves of one evaluation.
struct Facts<'a> {
    hand: &'a HandContext<'a>,
    seat: &'a SeatContext<'a>,
}

impl<'a> Facts<'a> {
    fn new(hand: &'a HandContext<'a>, seat: &'a SeatContext<'a>) -> Self {
        Facts { hand, seat }
    }

    fn street(&self, street: StreetName) -> &'a [Action] {
        match street {
            StreetName::Preflop => self.hand.preflop,
            StreetName::Flop => self.hand.flop,
            StreetName::Turn => self.hand.turn,
            StreetName::River => self.hand.river,
        }
    }

    fn is_player(&self, action: &Action) -> bool {
        eq_ic(&action.player, self.seat.name)
    }

    /// Index of the player's first action on the street that is not a forced post.
    fn first_own_action(&self, street: StreetName) -> Option<usize> {
        self.street(street).iter().position(|a| self.is_player(a) && a.kind != ActionKind::Post)
    }
}

fn kind_of(action: ActionName) -> ActionKind {
    match action {
        ActionName::Bet => ActionKind::Bet,
        ActionName::Raise => ActionKind::Raise,
        ActionName::Call => ActionKind::Call,
        ActionName::Check => ActionKind::Check,
        ActionName::Fold => ActionKind::Fold,
    }
}

fn holds(node: &Node, facts: &Facts) -> bool {
    match node {
        Node::And(items) => items.iter().all(|n| holds(n, facts)),
        Node::Or(items) => items.iter().any(|n| holds(n, facts)),
        Node::Not(item) => !holds(item, facts),
        Node::Flag(flag) => facts.seat.flags.has(*flag),
        Node::Predicate(cond) => predicate(cond, facts),
    }
}

fn predicate(cond: &Cond, f: &Facts) -> bool {
    let blinds = f.hand.blinds;
    match cond {
        Cond::Action { street, action, all_in } => f
            .street(*street)
            .iter()
            .any(|a| f.is_player(a) && a.kind == kind_of(*action) && all_in.map_or(true, |want| a.is_all_in == want)),
        Cond::InPosition => {
            let position = f.seat.position.trim();
            eq_ic(position, "BTN") || (eq_ic(position, "SB") && f.hand.player_count == 2)
        }
        Cond::FacingAggression { street } => {
            let actions = f.street(*street);
            f.first_own_action(*street).is_some_and(|i| actions[..i].iter().any(|a| !f.is_player(a) && a.kind.is_aggressive()))
        }
        Cond::RaiseSizeBb { range } => f
            .hand
            .preflop
            .iter()
            .find(|a| f.is_player(a) && a.kind == ActionKind::Raise)
            .and_then(|a| raise_size_bb(a, blinds))
            .is_some_and(|bb| range.contains(bb)),
        Cond::FacingRaiseSizeBb { range } => {
            let Some(i) = f.first_own_action(StreetName::Preflop) else { return false };
            f.hand.preflop[..i]
                .iter()
                .rev()
                .find(|a| a.kind == ActionKind::Raise)
                .and_then(|a| raise_size_bb(a, blinds))
                .is_some_and(|bb| range.contains(bb))
        }
        Cond::LimpersBefore { range } => {
            let Some(i) = f.first_own_action(StreetName::Preflop) else { return false };
            let before = &f.hand.preflop[..i];
            let until_raise = before.iter().take_while(|a| a.kind != ActionKind::Raise);
            range.contains(until_raise.filter(|a| a.kind == ActionKind::Call).count() as f64)
        }
        Cond::RaisesBefore { range } => {
            let Some(i) = f.first_own_action(StreetName::Preflop) else { return false };
            range.contains(f.hand.preflop[..i].iter().filter(|a| a.kind == ActionKind::Raise).count() as f64)
        }
        Cond::PlayersSeeingFlop { range } => {
            let mut folded: Vec<&str> = f.hand.preflop.iter().filter(|a| a.kind == ActionKind::Fold).map(|a| a.player.as_str()).collect();
            folded.sort_unstable();
            folded.dedup();
            range.contains((f.hand.player_count as f64 - folded.len() as f64).max(0.0))
        }
        Cond::BetSizePercentPot { street, range } => first_bet_percent_of_pot(f, *street).is_some_and(|pct| range.contains(pct)),
        // Groups and flags are handled by `holds`.
        Cond::And { .. } | Cond::Or { .. } | Cond::Not { .. } | Cond::Flag { .. } => false,
    }
}

/// The player's first bet on `target` as a percentage of the pot before it.
///
/// The pot is rebuilt from the amounts of the action lines: a call or a bet adds its amount, a raise
/// moves the player's commitment on that street to its "to" amount. Antes are not in the lines, so
/// the pot is the sum of the visible chips.
fn first_bet_percent_of_pot(f: &Facts, target: StreetName) -> Option<f64> {
    let streets = [StreetName::Preflop, StreetName::Flop, StreetName::Turn, StreetName::River];
    let mut pot = 0.0;
    for street in streets {
        let mut committed: HashMap<String, f64> = HashMap::new();
        for action in f.street(street) {
            let key = action.player.to_uppercase();
            if street == target && f.is_player(action) && action.kind == ActionKind::Bet {
                let amount = action.amount?;
                return (pot > 0.0).then(|| amount / pot * 100.0);
            }
            match action.kind {
                ActionKind::Post | ActionKind::Call | ActionKind::Bet => {
                    let amount = action.amount.unwrap_or(0.0);
                    *committed.entry(key).or_default() += amount;
                    pot += amount;
                }
                ActionKind::Raise => {
                    let before = committed.get(&key).copied().unwrap_or(0.0);
                    let to = action.amount_to.unwrap_or(before);
                    if to > before {
                        pot += to - before;
                        committed.insert(key, to);
                    }
                }
                ActionKind::Fold | ActionKind::Check => {}
            }
        }
        if street == target {
            break;
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engines::actions::parse_actions;
    use crate::stats::custom::model::parse_definition;
    use serde_json::{json, Value};

    const PREFLOP: &str = "SB posts small blind 10\nBB posts big blind 20\nHero raises 40 to 60\nSB calls 50\nBB folds";
    const FLOP: &str = "SB checks\nHero bets 60\nSB raises 120 to 180";

    fn def(numerator: Value, denominator: Value, filters: Value) -> CompiledStat {
        let v = json!({ "schema": 1, "name": "t", "numerator": numerator, "denominator": denominator, "filters": filters });
        CompiledStat::new(&parse_definition(&v).unwrap())
    }

    fn run(stat: &CompiledStat, player: &str, position: &str, flags: Flags) -> u8 {
        let (pre, flop) = (parse_actions(PREFLOP), parse_actions(FLOP));
        let hand = HandContext { preflop: &pre, flop: &flop, turn: &[], river: &[], blinds: "10/20", player_count: 3 };
        stat.evaluate(&hand, &SeatContext { name: player, position, stack: 400, flags })
    }

    fn holds_for(player: &str, cond: Value) -> bool {
        let stat = def(cond, Value::Null, json!({}));
        run(&stat, player, "BTN", Flags::default()) == DEN_BIT | NUM_BIT
    }

    #[test]
    fn flags_combine_with_and_or_not() {
        let mut flags = Flags::default();
        flags.set(Flag::RfiOpp);
        flags.set(Flag::Rfi);
        let flag = |n: &str| json!({ "type": "flag", "name": n });
        let stat = def(flag("Rfi"), flag("RfiOpp"), json!({}));
        assert_eq!(run(&stat, "Hero", "BTN", flags), DEN_BIT | NUM_BIT);
        assert_eq!(run(&stat, "Hero", "BTN", Flags::default()), 0, "no opportunity, no hand");

        flags = Flags::default();
        flags.set(Flag::RfiOpp);
        assert_eq!(run(&stat, "Hero", "BTN", flags), DEN_BIT);

        let not_rfi = def(json!({ "type": "not", "item": flag("Rfi") }), flag("RfiOpp"), json!({}));
        assert_eq!(run(&not_rfi, "Hero", "BTN", flags), DEN_BIT | NUM_BIT);
        let either = def(json!({ "type": "or", "items": [flag("Rfi"), flag("Vpip")] }), Value::Null, json!({}));
        assert_eq!(run(&either, "Hero", "BTN", flags), DEN_BIT);
        let both = def(json!({ "type": "and", "items": [flag("RfiOpp"), flag("Rfi")] }), Value::Null, json!({}));
        assert_eq!(run(&both, "Hero", "BTN", flags), DEN_BIT);
    }

    #[test]
    fn filters_restrict_position_table_size_and_stack() {
        let any = json!({ "type": "action", "street": "preflop", "action": "raise" });
        let on_btn = def(any.clone(), Value::Null, json!({ "positions": ["BTN"] }));
        assert_eq!(run(&on_btn, "Hero", "BTN", Flags::default()), DEN_BIT | NUM_BIT);
        assert_eq!(run(&on_btn, "Hero", "SB", Flags::default()), 0);
        let heads_up = def(any.clone(), Value::Null, json!({ "tableSizes": [2] }));
        assert_eq!(run(&heads_up, "Hero", "BTN", Flags::default()), 0);
        // The stack is 400 chips at 10/20: 20 big blinds.
        let deep = def(any.clone(), Value::Null, json!({ "stackBb": { "min": 25 } }));
        assert_eq!(run(&deep, "Hero", "BTN", Flags::default()), 0);
        let in_range = def(any, Value::Null, json!({ "stackBb": { "min": 15, "max": 25 } }));
        assert_eq!(run(&in_range, "Hero", "BTN", Flags::default()), DEN_BIT | NUM_BIT);
    }

    #[test]
    fn action_predicates_read_the_street_lines() {
        let act = |street: &str, action: &str| json!({ "type": "action", "street": street, "action": action });
        assert!(holds_for("Hero", act("preflop", "raise")));
        assert!(holds_for("hero", act("flop", "bet")), "player names compare case-insensitively");
        assert!(!holds_for("Hero", act("flop", "check")));
        assert!(holds_for("SB", act("flop", "raise")));
        assert!(!holds_for("SB", json!({ "type": "action", "street": "flop", "action": "raise", "allIn": true })));
        assert!(holds_for("SB", json!({ "type": "action", "street": "flop", "action": "raise", "allIn": false })));
        assert!(!holds_for("Hero", act("turn", "bet")));
    }

    #[test]
    fn facing_aggression_needs_an_earlier_bet_or_raise() {
        let facing = |street: &str| json!({ "type": "facingAggression", "street": street });
        assert!(holds_for("SB", facing("preflop")));
        assert!(holds_for("BB", facing("preflop")));
        assert!(!holds_for("Hero", facing("preflop")), "the opener faced no raise");
        assert!(holds_for("SB", facing("flop")) == false, "SB acts first on the flop");
        assert!(holds_for("Hero", facing("flop")) == false);
        assert!(!holds_for("Nobody", facing("preflop")));
    }

    #[test]
    fn raise_sizes_and_counts_before_the_first_action() {
        let range = |lo: f64, hi: f64| json!({ "min": lo, "max": hi });
        assert!(holds_for("Hero", json!({ "type": "raiseSizeBb", "range": range(2.9, 3.1) })));
        assert!(!holds_for("Hero", json!({ "type": "raiseSizeBb", "range": range(4.0, 5.0) })));
        assert!(holds_for("SB", json!({ "type": "facingRaiseSizeBb", "range": range(3.0, 3.0) })));
        assert!(holds_for("SB", json!({ "type": "raisesBefore", "range": range(1.0, 1.0) })));
        assert!(holds_for("Hero", json!({ "type": "raisesBefore", "range": range(0.0, 0.0) })));
        assert!(holds_for("Hero", json!({ "type": "limpersBefore", "range": range(0.0, 0.0) })));
        assert!(holds_for("Hero", json!({ "type": "playersSeeingFlop", "range": range(2.0, 2.0) })));
        assert!(!holds_for("Hero", json!({ "type": "playersSeeingFlop", "range": range(3.0, 3.0) })));
    }

    #[test]
    fn limpers_are_the_calls_before_the_first_raise() {
        let pre = parse_actions("SB posts small blind 10\nBB posts big blind 20\nA calls 20\nB calls 20\nC raises 60 to 80\nD folds");
        let hand = HandContext { preflop: &pre, flop: &[], turn: &[], river: &[], blinds: "10/20", player_count: 4 };
        let stat = def(json!({ "type": "limpersBefore", "range": { "min": 2, "max": 2 } }), Value::Null, json!({}));
        let eval = |name| stat.evaluate(&hand, &SeatContext { name, position: "", stack: 0, flags: Flags::default() });
        assert_eq!(eval("C"), DEN_BIT | NUM_BIT);
        assert_eq!(eval("D"), DEN_BIT | NUM_BIT, "calls after the raise do not change who limped first");
        assert_eq!(eval("A"), DEN_BIT, "the first limper saw no limper");
    }

    #[test]
    fn bet_size_is_a_percentage_of_the_pot_before_the_bet() {
        // Preflop: 10 + 20 + 60 + 50 + 0 = 140... blinds 10 and 20, Hero raises to 60, SB calls 50: pot 140.
        let pct = |lo: f64, hi: f64| json!({ "type": "betSizePercentPot", "street": "flop", "range": { "min": lo, "max": hi } });
        // Hero bets 60 into 140 chips.
        assert!(holds_for("Hero", pct(42.0, 43.0)));
        assert!(!holds_for("Hero", pct(50.0, 100.0)));
        assert!(!holds_for("SB", pct(0.0, 1000.0)), "SB never bet");
    }

    #[test]
    fn in_position_is_the_button_or_the_heads_up_small_blind() {
        let (pre, flop) = (parse_actions(PREFLOP), parse_actions(FLOP));
        let stat = def(json!({ "type": "inPosition" }), Value::Null, json!({}));
        let eval = |position: &str, players: i32| {
            let hand = HandContext { preflop: &pre, flop: &flop, turn: &[], river: &[], blinds: "10/20", player_count: players };
            stat.evaluate(&hand, &SeatContext { name: "Hero", position, stack: 0, flags: Flags::default() })
        };
        assert_eq!(eval("BTN", 3), DEN_BIT | NUM_BIT);
        assert_eq!(eval("SB", 2), DEN_BIT | NUM_BIT);
        assert_eq!(eval("SB", 3), DEN_BIT);
        assert_eq!(eval("BB", 2), DEN_BIT);
    }

    #[test]
    fn evaluation_is_deterministic() {
        let stat = def(json!({ "type": "action", "street": "preflop", "action": "raise" }), Value::Null, json!({}));
        let first = run(&stat, "Hero", "BTN", Flags::default());
        assert!((0..20).all(|_| run(&stat, "Hero", "BTN", Flags::default()) == first));
    }
}
