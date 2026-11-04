//! Postflop stat flags for one player in one hand.
//!
//! Port of the postflop part of the former `DetailedStatsAccumulator`, for any player. Besides
//! flags, the player's action counts per street are kept (aggression frequency is a ratio of
//! actions, not of hands).

use super::flags::{Flag, Flags};
use crate::engines::actions::{Action, ActionKind};
use crate::util::eq_ic;

/// Streets after the flop, in order.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Street {
    Flop = 0,
    Turn = 1,
    River = 2,
}

/// Kinds counted by `StreetCounts`.
const COUNTED: [ActionKind; 5] = [ActionKind::Bet, ActionKind::Raise, ActionKind::Call, ActionKind::Fold, ActionKind::Check];
const BITS_PER_COUNT: u32 = 4;
const MAX_COUNT: u64 = (1 << BITS_PER_COUNT) - 1;

/// A player's actions per street and kind, packed 4 bits each (saturating at 15).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct StreetCounts(pub u64);

impl StreetCounts {
    fn shift(street: Street, kind: ActionKind) -> Option<u32> {
        let k = COUNTED.iter().position(|c| *c == kind)? as u32;
        Some((street as u32 * COUNTED.len() as u32 + k) * BITS_PER_COUNT)
    }

    pub fn add(&mut self, street: Street, kind: ActionKind) {
        if let Some(shift) = Self::shift(street, kind) {
            if self.get(street, kind) < MAX_COUNT {
                self.0 += 1 << shift;
            }
        }
    }

    pub fn get(&self, street: Street, kind: ActionKind) -> u64 {
        Self::shift(street, kind).map_or(0, |shift| (self.0 >> shift) & MAX_COUNT)
    }

    /// Bets plus raises.
    pub fn aggressive(&self, street: Street) -> u64 {
        self.get(street, ActionKind::Bet) + self.get(street, ActionKind::Raise)
    }

    /// Every counted action.
    pub fn total(&self, street: Street) -> u64 {
        COUNTED.iter().map(|k| self.get(street, *k)).sum()
    }
}

pub struct PostflopInput<'a> {
    pub preflop: &'a [Action],
    pub flop: &'a [Action],
    pub turn: &'a [Action],
    pub river: &'a [Action],
    pub player: &'a str,
    pub position: &'a str,
    pub player_count: i32,
    /// Flop cards as stored on the hand (blank when there was no flop).
    pub flop_cards: &'a str,
    pub went_to_showdown: bool,
    pub net_profit: f64,
}

pub fn compute(input: &PostflopInput) -> (Flags, StreetCounts) {
    let mut f = Flags::default();
    let mut counts = StreetCounts::default();
    let is_player = |a: &Action| eq_ic(&a.player, input.player);
    let aggressive = |a: &&Action| a.kind.is_aggressive();
    let by_player = |a: &&Action| is_player(a);
    let by_others = |a: &&Action| !is_player(a);

    let streets = [(Street::Flop, input.flop), (Street::Turn, input.turn), (Street::River, input.river)];
    for (street, actions) in streets {
        for a in actions.iter().filter(by_player) {
            counts.add(street, a.kind);
        }
    }

    let folded_preflop = input.preflop.iter().any(|a| is_player(a) && a.kind == ActionKind::Fold);
    // The preflop raiser is the last player who bet or raised: opening and then calling a 3-bet
    // hands the initiative to the 3-bettor.
    let last_aggressor_is_player = input.preflop.iter().rev().find(|a| a.kind.is_aggressive()).is_some_and(is_player);
    let was_pfr = last_aggressor_is_player && !folded_preflop;
    // Heads-up the button is the small blind and acts last after the flop.
    let in_position = matches!(input.position, "BTN" | "CO") || (input.position == "SB" && input.player_count == 2);

    let hero_bets_or_raises = |actions: &[Action]| actions.iter().any(|a| is_player(a) && a.kind.is_aggressive());

    // C-bets.
    if was_pfr && !input.flop.is_empty() {
        f.set(Flag::CbetOppFlop);
        if hero_bets_or_raises(input.flop) {
            f.set(Flag::CbetFlop);
        } else {
            f.set(Flag::MissedCbet);
            let folded_later = input.turn.iter().chain(input.river).any(|a| is_player(a) && a.kind == ActionKind::Fold);
            if in_position {
                f.set(Flag::MissedCbetIp);
                if folded_later {
                    f.set(Flag::MissedCbetIpFold);
                }
            } else {
                f.set(Flag::MissedCbetOop);
                if folded_later {
                    f.set(Flag::MissedCbetOopFold);
                }
            }
        }
    }
    if was_pfr && !input.turn.is_empty() {
        f.set(Flag::CbetOppTurn);
        if hero_bets_or_raises(input.turn) {
            f.set(Flag::CbetTurn);
        }
    }
    if was_pfr && !input.river.is_empty() {
        f.set(Flag::CbetOppRiver);
        if hero_bets_or_raises(input.river) {
            f.set(Flag::CbetRiver);
        }
    }

    // Folding to a raise after a bet of one's own.
    let after_own_bet = |actions: &[Action], only_bets: bool| -> Option<(bool, bool)> {
        let i = actions.iter().position(|a| is_player(a) && if only_bets { a.kind == ActionKind::Bet } else { a.kind.is_aggressive() })?;
        let later = &actions[i + 1..];
        later.iter().any(|a| !is_player(a) && a.kind.is_aggressive()).then(|| (true, later.iter().any(|a| is_player(a) && a.kind == ActionKind::Fold)))
    };
    let cbet_fold = [
        (input.flop, Flag::CbetFoldOppFlop, Flag::CbetFoldFlop),
        (input.turn, Flag::CbetFoldOppTurn, Flag::CbetFoldTurn),
        (input.river, Flag::CbetFoldOppRiver, Flag::CbetFoldRiver),
    ];
    if was_pfr {
        for (actions, opp, num) in cbet_fold {
            if let Some((_, folded)) = after_own_bet(actions, false) {
                f.set(opp);
                if folded {
                    f.set(num);
                }
            }
        }
    }

    // Folding to somebody's bet: the first action of the player is his reaction.
    let fold_to_cbet = [
        (input.flop, Flag::FoldToCbetOppFlop, Flag::FoldToCbetFlop),
        (input.turn, Flag::FoldToCbetOppTurn, Flag::FoldToCbetTurn),
        (input.river, Flag::FoldToCbetOppRiver, Flag::FoldToCbetRiver),
    ];
    for (actions, opp, num) in fold_to_cbet {
        // The reaction is the first action after the bet: a check made before it is not an answer.
        let Some(bet) = actions.iter().position(|a| aggressive(&a) && by_others(&a)) else { continue };
        if let Some(reaction) = actions[bet + 1..].iter().find(by_player) {
            f.set(opp);
            if reaction.kind == ActionKind::Fold {
                f.set(num);
            }
        }
    }

    // Donk bets: a bet from a player who was not the preflop raiser.
    let donks = [
        (input.flop, Flag::DonkOppFlop, Flag::DonkFlop),
        (input.turn, Flag::DonkOppTurn, Flag::DonkTurn),
        (input.river, Flag::DonkOppRiver, Flag::DonkRiver),
    ];
    if !was_pfr {
        for (actions, opp, num) in donks {
            if !actions.is_empty() {
                f.set(opp);
                if actions.iter().any(|a| is_player(a) && a.kind == ActionKind::Bet) {
                    f.set(num);
                }
            }
        }
    }
    let donk_fold = [
        (input.flop, Flag::DonkFoldOppFlop, Flag::DonkFoldFlop),
        (input.turn, Flag::DonkFoldOppTurn, Flag::DonkFoldTurn),
        (input.river, Flag::DonkFoldOppRiver, Flag::DonkFoldRiver),
    ];
    for (actions, opp, num) in donk_fold {
        if let Some((_, folded)) = after_own_bet(actions, true) {
            f.set(opp);
            if folded {
                f.set(num);
            }
        }
    }

    // Answering a bet made by somebody else when the street opens with one.
    let vs_donk = [
        (input.flop, Flag::VsDonkOppFlop, Flag::FoldVsDonkFlop, Flag::RaiseVsDonkFlop),
        (input.turn, Flag::VsDonkOppTurn, Flag::FoldVsDonkTurn, Flag::RaiseVsDonkTurn),
    ];
    for (actions, opp, fold, raise) in vs_donk {
        let Some(first) = actions.iter().position(|a| a.kind.is_aggressive()) else { continue };
        if is_player(&actions[first]) {
            continue;
        }
        let Some(reaction) = actions[first + 1..].iter().find(by_player) else { continue };
        f.set(opp);
        match reaction.kind {
            ActionKind::Fold => f.set(fold),
            k if k.is_aggressive() => f.set(raise),
            _ => {}
        }
    }

    // Facing a flop c-bet, by the size of the pot.
    if !input.flop.is_empty() {
        let raises_preflop = input.preflop.iter().filter(|a| a.kind.is_aggressive()).count();
        if raises_preflop > 0 && input.flop.iter().any(|a| !is_player(a) && a.kind.is_aggressive()) {
            if let Some(reaction) = input.flop.iter().find(by_player) {
                let three_bet_pot = raises_preflop >= 2;
                let flag = match (three_bet_pot, reaction.kind) {
                    (true, ActionKind::Fold) => Some(Flag::VsCbet3BetFold),
                    (true, ActionKind::Call | ActionKind::Check) => Some(Flag::VsCbet3BetCall),
                    (true, k) if k.is_aggressive() => Some(Flag::VsCbet3BetRaise),
                    (false, ActionKind::Fold) => Some(Flag::VsCbetRaisedFold),
                    (false, ActionKind::Call | ActionKind::Check) => Some(Flag::VsCbetRaisedCall),
                    (false, k) if k.is_aggressive() => Some(Flag::VsCbetRaisedRaise),
                    _ => None,
                };
                if let Some(flag) = flag {
                    f.set(flag);
                }
            }
        }
    }

    // The preflop raiser (not the player) checked the flop.
    if let Some(raiser) = input.preflop.iter().find(|a| a.kind.is_aggressive()) {
        let raiser_bet_flop = input.flop.iter().any(|a| eq_ic(&a.player, &raiser.player) && a.kind.is_aggressive());
        if !is_player(raiser) && !raiser_bet_flop {
            if let Some(reaction) = input.flop.iter().find(by_player) {
                f.set(Flag::VsMissedCbetOpp);
                let bets = reaction.kind.is_aggressive();
                if bets {
                    f.set(Flag::VsMissedCbet);
                }
                let checked_then_folded_turn =
                    reaction.kind == ActionKind::Check && input.turn.iter().any(|a| is_player(a) && a.kind == ActionKind::Fold);
                if in_position {
                    f.set(Flag::VsMissedCbetIp);
                    if bets {
                        f.set(Flag::VsMissedCbetBetIp);
                    }
                    if checked_then_folded_turn {
                        f.set(Flag::VsMissedCbetCheckFoldIp);
                    }
                } else {
                    f.set(Flag::VsMissedCbetOop);
                    if hero_bets_or_raises(input.turn) {
                        f.set(Flag::VsMissedCbetBetOopTurn);
                    }
                    if checked_then_folded_turn {
                        f.set(Flag::VsMissedCbetCheckFoldOop);
                    }
                }
            }
        }
    }

    // River.
    if let Some(first) = input.river.iter().find(|a| is_player(a) && a.kind != ActionKind::Post) {
        f.set(Flag::RiverBetOpp);
        if first.kind.is_aggressive() {
            f.set(Flag::RiverBet);
            if input.went_to_showdown {
                f.set(Flag::RiverBetShowdown);
                if input.net_profit > 0.0 {
                    f.set(Flag::RiverBetWonShowdown);
                }
            }
        }
    }
    if let Some(i) = input.river.iter().position(|a| !is_player(a) && a.kind.is_aggressive()) {
        if let Some(reaction) = input.river[i + 1..].iter().find(by_player) {
            if matches!(reaction.kind, ActionKind::Call | ActionKind::Fold) {
                f.set(Flag::VsRiverBetOpp);
                f.set(if reaction.kind == ActionKind::Call { Flag::VsRiverBetCall } else { Flag::VsRiverBetFold });
            }
        }
    }

    // Showdown frequencies.
    let saw_flop = !folded_preflop && (!input.flop_cards.trim().is_empty() || !input.flop.is_empty());
    if saw_flop {
        f.set(Flag::SawFlop);
        if input.went_to_showdown {
            f.set(Flag::Wtsd);
            if input.net_profit > 0.0 {
                f.set(Flag::Wsd);
            }
        }
        if input.net_profit > 0.0 {
            f.set(Flag::Wwsf);
        }
    }

    (f, counts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engines::actions::parse_actions;

    struct Spot {
        pre: &'static str,
        flop: &'static str,
        turn: &'static str,
        river: &'static str,
        player: &'static str,
        position: &'static str,
        sd: bool,
        profit: f64,
    }

    impl Spot {
        fn flags(&self) -> (Flags, StreetCounts) {
            let (pre, flop, turn, river) = (parse_actions(self.pre), parse_actions(self.flop), parse_actions(self.turn), parse_actions(self.river));
            compute(&PostflopInput {
                preflop: &pre,
                flop: &flop,
                turn: &turn,
                river: &river,
                player: self.player,
                position: self.position,
                player_count: 3,
                flop_cards: "2c 7d 9h",
                went_to_showdown: self.sd,
                net_profit: self.profit,
            })
        }
    }

    const RAISED: &str = "Hero raises 20 to 50\nVillain calls 30\nBB folds";

    fn spot(flop: &'static str) -> Spot {
        Spot { pre: RAISED, flop, turn: "", river: "", player: "Hero", position: "BTN", sd: false, profit: 0.0 }
    }

    #[test]
    fn counts_pack_per_street_and_kind() {
        let mut c = StreetCounts::default();
        c.add(Street::Flop, ActionKind::Bet);
        c.add(Street::Flop, ActionKind::Raise);
        c.add(Street::River, ActionKind::Check);
        for _ in 0..20 {
            c.add(Street::Turn, ActionKind::Call);
        }
        assert_eq!((c.aggressive(Street::Flop), c.total(Street::Flop)), (2, 2));
        assert_eq!(c.get(Street::River, ActionKind::Check), 1);
        assert_eq!(c.get(Street::Turn, ActionKind::Call), 15, "saturates instead of overflowing into the next field");
        assert_eq!(c.get(Street::Turn, ActionKind::Fold), 0);
        c.add(Street::Flop, ActionKind::Post);
        assert_eq!(c.total(Street::Flop), 2, "posts are not counted");
    }

    #[test]
    fn continuation_bet_and_missed_continuation_bet() {
        let (f, counts) = spot("Villain checks\nHero bets 40").flags();
        assert!(f.has(Flag::CbetOppFlop) && f.has(Flag::CbetFlop) && !f.has(Flag::MissedCbet));
        assert_eq!(counts.get(Street::Flop, ActionKind::Bet), 1);

        let missed = Spot { turn: "Hero folds", ..spot("Villain checks\nHero checks") };
        let (f, _) = missed.flags();
        assert!(f.has(Flag::MissedCbet) && f.has(Flag::MissedCbetIp) && f.has(Flag::MissedCbetIpFold), "the button counts as in position");
        assert!(!f.has(Flag::MissedCbetOop));
    }

    #[test]
    fn facing_a_raise_after_a_cbet_and_folding() {
        let (f, _) = Spot { ..spot("Villain checks\nHero bets 40\nVillain raises 100 to 140\nHero folds") }.flags();
        assert!(f.has(Flag::CbetFoldOppFlop) && f.has(Flag::CbetFoldFlop));
    }

    #[test]
    fn the_first_action_is_the_reaction_to_a_bet() {
        let s = Spot { pre: "Villain raises 20 to 50\nHero calls 30", player: "Hero", position: "BB", ..spot("Villain bets 40\nHero folds") };
        let (f, _) = s.flags();
        assert!(f.has(Flag::FoldToCbetOppFlop) && f.has(Flag::FoldToCbetFlop));
        assert!(f.has(Flag::VsCbetRaisedFold) && !f.has(Flag::VsCbet3BetFold));
        assert!(f.has(Flag::VsDonkOppFlop) && f.has(Flag::FoldVsDonkFlop));
        assert!(!f.has(Flag::CbetOppFlop), "the player was not the preflop raiser");
        assert!(f.has(Flag::DonkOppFlop) && !f.has(Flag::DonkFlop));
    }

    #[test]
    fn checking_then_folding_to_a_bet_is_a_fold_to_that_bet() {
        let s = Spot { pre: "Villain raises 20 to 50\nHero calls 30", position: "BB", ..spot("Hero checks\nVillain bets 40\nHero folds") };
        let (f, _) = s.flags();
        assert!(f.has(Flag::FoldToCbetOppFlop) && f.has(Flag::FoldToCbetFlop));
    }

    #[test]
    fn the_small_blind_is_in_position_heads_up_only() {
        let heads_up = |player_count| {
            let (pre, flop) = (parse_actions("Hero raises 20 to 50\nVillain calls 30"), parse_actions("Villain checks\nHero checks"));
            compute(&PostflopInput {
                preflop: &pre,
                flop: &flop,
                turn: &[],
                river: &[],
                player: "Hero",
                position: "SB",
                player_count,
                flop_cards: "2c 7d 9h",
                went_to_showdown: false,
                net_profit: 0.0,
            })
            .0
        };
        assert!(heads_up(2).has(Flag::MissedCbetIp));
        assert!(heads_up(3).has(Flag::MissedCbetOop));
    }

    #[test]
    fn calling_a_three_bet_hands_the_initiative_over() {
        let s = Spot { pre: "Hero raises 20 to 50\nVillain raises 100 to 150\nHero calls 100", ..spot("Hero checks\nVillain bets 80") };
        let (f, _) = s.flags();
        assert!(!f.has(Flag::CbetOppFlop), "the three-bettor is the preflop aggressor");
    }

    #[test]
    fn donk_bets_come_from_non_raisers_and_use_a_plain_bet() {
        let s = Spot { pre: "Villain raises 20 to 50\nHero calls 30", ..spot("Hero bets 20\nVillain raises 60 to 80\nHero folds") };
        let (f, _) = s.flags();
        assert!(f.has(Flag::DonkFlop) && f.has(Flag::DonkFoldOppFlop) && f.has(Flag::DonkFoldFlop));
    }

    #[test]
    fn river_bets_and_calls() {
        let s = Spot { river: "Hero bets 100", sd: true, profit: 80.0, ..spot("Villain checks\nHero checks") };
        let (f, _) = s.flags();
        assert!(f.has(Flag::RiverBetOpp) && f.has(Flag::RiverBet) && f.has(Flag::RiverBetShowdown) && f.has(Flag::RiverBetWonShowdown));

        let facing = Spot { river: "Villain bets 100\nHero calls 100", ..spot("Villain checks\nHero checks") };
        let (f, _) = facing.flags();
        assert!(f.has(Flag::VsRiverBetOpp) && f.has(Flag::VsRiverBetCall) && !f.has(Flag::VsRiverBetFold));
    }

    #[test]
    fn showdown_frequencies() {
        let won = Spot { sd: true, profit: 50.0, ..spot("Villain checks\nHero checks") };
        let (f, _) = won.flags();
        assert!(f.has(Flag::SawFlop) && f.has(Flag::Wtsd) && f.has(Flag::Wsd) && f.has(Flag::Wwsf));

        let folded = Spot { pre: "Hero folds", ..spot("") };
        let (f, _) = folded.flags();
        assert!(!f.has(Flag::SawFlop));
    }

    #[test]
    fn missing_continuation_bet_of_the_raiser() {
        let s = Spot {
            pre: "Villain raises 20 to 50\nHero calls 30",
            position: "BB",
            turn: "Hero folds",
            ..spot("Villain checks\nHero checks")
        };
        let (f, _) = s.flags();
        assert!(f.has(Flag::VsMissedCbetOpp) && f.has(Flag::VsMissedCbetOop) && f.has(Flag::VsMissedCbetCheckFoldOop));
        assert!(!f.has(Flag::VsMissedCbet));
    }
}
