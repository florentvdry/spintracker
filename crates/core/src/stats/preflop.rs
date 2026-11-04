//! Preflop stat flags for one player in one hand.
//!
//! Port of the preflop part of the former `DetailedStatsAccumulator`, generalised from "the
//! hero" to any player. Opportunity flags are set when a decision point is reached, action
//! flags when the player takes it.

use super::flags::{Flag, Flags};
use crate::engines::actions::{raise_size_bb, Action, ActionKind};
use crate::util::eq_ic;

pub struct PreflopInput<'a> {
    pub actions: &'a [Action],
    pub player: &'a str,
    /// Position as stored in `player_hands` ("BTN", "SB", "BB"...).
    pub position: &'a str,
    pub player_count: i32,
    pub blinds: &'a str,
}

/// How far a raise size falls from a standard open (in big blinds, "to" amount).
#[derive(Clone, Copy)]
enum SizeBucket {
    Up2x,
    Up25x,
    Up3x,
    Above,
}

impl SizeBucket {
    fn of(size_bb: f64) -> Self {
        if size_bb <= 2.25 {
            SizeBucket::Up2x
        } else if size_bb <= 2.75 {
            SizeBucket::Up25x
        } else if size_bb <= 3.25 {
            SizeBucket::Up3x
        } else {
            SizeBucket::Above
        }
    }
}

pub fn compute(input: &PreflopInput) -> Flags {
    let mut f = Flags::default();
    let pre = input.actions;
    let is_player = |a: &Action| eq_ic(&a.player, input.player);
    let player_acts: Vec<&Action> = pre.iter().filter(|a| is_player(a)).collect();

    let vpip = player_acts.iter().any(|a| matches!(a.kind, ActionKind::Call | ActionKind::Bet | ActionKind::Raise));
    let pfr = player_acts.iter().any(|a| a.kind.is_aggressive());
    if vpip {
        f.set(Flag::Vpip);
    }
    if pfr {
        f.set(Flag::Pfr);
    }

    let mut limps_before = 0;
    let mut open_raise = false;
    let mut limp = false;
    let mut call_open = false;
    let mut three_bet = false;
    let mut four_bet = false;
    let mut five_bet = false;
    let mut call_4bet = false;
    let mut fold_to_3bet = false;
    let mut fold_to_4bet = false;
    let mut four_bet_fold = false;
    let mut limp_fold = false;
    let mut open_shove = false;
    let mut iso_shove = false;
    let mut call_shove = false;
    let mut rejam = false;
    let mut fold_vs_shove = false;
    let mut faced_3bet_after_open = false;
    let mut faced_3bet_after_open_all_in = false;
    let mut faced_4bet_after_3bet = false;
    let mut faced_4bet_after_4bet = false;
    let mut faced_raise_after_limp = false;
    let mut faced_raise_after_limp_all_in = false;
    let mut open_shove_opp = false;
    let mut iso_shove_opp = false;
    let mut rejam_opp = false;
    let mut last_raise_size_bb: Option<f64> = None;
    let mut last_raise_all_in = false;
    let mut open_raise_size_bb: Option<f64> = None;
    let mut three_bet_all_in = false;
    let mut first_decision_was_raise = false;
    let mut first_decision_facing_limp = false;

    let mut has_limped = false;
    let mut opened_or_raised = false;
    let mut decision_seen = false;
    let mut raised_level = 0;
    let mut facing_all_in_shove = false;
    let mut raises_seen = 0;

    for a in pre {
        if !is_player(a) {
            if a.kind.is_aggressive() {
                raises_seen += 1;
                last_raise_size_bb = raise_size_bb(a, input.blinds);
                last_raise_all_in = a.is_all_in;
            } else if a.kind == ActionKind::Call && raises_seen == 0 {
                limps_before += 1;
            }

            if opened_or_raised && raised_level == 1 && a.kind.is_aggressive() {
                faced_3bet_after_open = true;
                faced_3bet_after_open_all_in = a.is_all_in;
            }
            if a.is_all_in && a.kind.is_aggressive() {
                facing_all_in_shove = true;
            }
            if opened_or_raised && raised_level == 2 && a.kind.is_aggressive() {
                faced_4bet_after_3bet = true;
            }
            if opened_or_raised && raised_level >= 3 && a.kind.is_aggressive() {
                faced_4bet_after_4bet = true;
            }
            if has_limped && a.kind.is_aggressive() {
                faced_raise_after_limp = true;
                faced_raise_after_limp_all_in = a.is_all_in;
            }
            continue;
        }

        let is_first_decision = a.kind != ActionKind::Post && !decision_seen;
        if is_first_decision {
            decision_seen = true;
            first_decision_was_raise = a.kind.is_aggressive();
            if raises_seen == 0 && limps_before == 0 {
                f.set(Flag::RfiOpp);
                f.set(Flag::LimpOpp);
                open_shove_opp = true;
            } else if raises_seen == 0 && limps_before > 0 {
                f.set(Flag::FacingLimpOpp);
                iso_shove_opp = true;
                first_decision_facing_limp = true;
            }

            if raises_seen >= 1 {
                count_facing_raise(&mut f, last_raise_size_bb, last_raise_all_in, a.kind);
                f.set(Flag::CallOpenOpp);
            }
        }

        // An opportunity exists at every decision where the action is possible, so that an action
        // taken later in the hand (a call after limping, a 4-bet without opening...) always has
        // its opportunity and no percentage can exceed 100%.
        if a.kind != ActionKind::Post {
            if raises_seen == 0 && a.kind != ActionKind::Check {
                f.set(Flag::LimpOpp);
            }
            if raises_seen >= 1 {
                rejam_opp = true;
            }
            match raises_seen {
                1 => f.set(Flag::ThreeBetOpp),
                2 => f.set(Flag::FourBetOpp),
                n if n >= 3 => {
                    f.set(Flag::FiveBetOpp);
                    f.set(Flag::Call4BetOpp);
                }
                _ => {}
            }
        }

        match a.kind {
            ActionKind::Call => {
                if raises_seen == 0 {
                    limp = true;
                    has_limped = true;
                } else if is_first_decision {
                    // Answering the open itself; calling a later raise is another decision.
                    call_open = true;
                }
                if raises_seen >= 3 {
                    call_4bet = true;
                }
                if facing_all_in_shove || a.is_all_in {
                    call_shove = true;
                }
            }
            ActionKind::Raise | ActionKind::Bet => {
                opened_or_raised = true;
                if raises_seen == 0 && limps_before == 0 {
                    open_raise = true;
                    open_raise_size_bb = raise_size_bb(a, input.blinds);
                }
                if raises_seen == 1 {
                    three_bet = true;
                    three_bet_all_in = a.is_all_in;
                }
                if raises_seen == 2 {
                    four_bet = true;
                }
                if raises_seen >= 3 {
                    five_bet = true;
                }
                raised_level = raises_seen + 1;
                if a.is_all_in && raises_seen == 0 && limps_before == 0 {
                    open_shove = true;
                }
                if a.is_all_in && raises_seen == 0 && limps_before > 0 {
                    iso_shove = true;
                }
                if a.is_all_in && raises_seen >= 1 {
                    rejam = true;
                }
            }
            ActionKind::Fold => {
                if has_limped {
                    limp_fold = true;
                }
                if faced_3bet_after_open {
                    fold_to_3bet = true;
                }
                if faced_4bet_after_3bet {
                    fold_to_4bet = true;
                }
                if faced_4bet_after_4bet {
                    four_bet_fold = true;
                }
                if facing_all_in_shove {
                    fold_vs_shove = true;
                }
            }
            ActionKind::Post | ActionKind::Check => {}
        }
    }

    let set_if = |f: &mut Flags, cond: bool, flag: Flag| {
        if cond {
            f.set(flag);
        }
    };

    set_if(&mut f, open_raise, Flag::Rfi);
    if let (true, Some(size)) = (open_raise, open_raise_size_bb) {
        // "2x" and "2x exact" are the same bucket; "2x+" is everything above it.
        match SizeBucket::of(size) {
            SizeBucket::Up2x => {
                f.set(Flag::Rfi2x);
            }
            bucket => {
                f.set(Flag::Rfi2xPlus);
                f.set(match bucket {
                    SizeBucket::Up25x => Flag::Rfi25x,
                    SizeBucket::Up3x => Flag::Rfi3x,
                    _ => Flag::Rfi35xPlus,
                });
            }
        }
    }
    set_if(&mut f, limp, Flag::Limp);
    set_if(&mut f, call_open, Flag::CallOpen);
    set_if(&mut f, three_bet, Flag::ThreeBet);
    if three_bet {
        f.set(if three_bet_all_in { Flag::ThreeBetShove } else { Flag::ThreeBetNonAllIn });
    }
    set_if(&mut f, four_bet, Flag::FourBet);
    set_if(&mut f, five_bet, Flag::FiveBet);
    set_if(&mut f, call_4bet, Flag::Call4Bet);
    set_if(&mut f, limp_fold, Flag::LimpFold);
    // Folding to a 5-bet after a 5-bet of one's own is not a 4-bet fold.
    set_if(&mut f, four_bet_fold && four_bet, Flag::FourBetFold);

    if faced_3bet_after_open {
        f.set(Flag::FoldTo3BetOpp);
        f.set(Flag::FourBetOpp);
        f.set(if faced_3bet_after_open_all_in { Flag::FoldTo3BetShoveOpp } else { Flag::FoldTo3BetNonAllInOpp });
        if fold_to_3bet {
            f.set(Flag::FoldTo3Bet);
            f.set(if faced_3bet_after_open_all_in { Flag::FoldTo3BetShove } else { Flag::FoldTo3BetNonAllIn });
        }
    }
    if faced_4bet_after_3bet {
        f.set(Flag::FoldTo4BetOpp);
        set_if(&mut f, fold_to_4bet, Flag::FoldTo4Bet);
    }
    set_if(&mut f, four_bet, Flag::FourBetFoldOpp);
    set_if(&mut f, limp, Flag::LimpFoldOpp);
    if faced_raise_after_limp {
        f.set(Flag::LimpFacedRaiseOpp);
        f.set(if faced_raise_after_limp_all_in { Flag::LimpFoldVsAllInOpp } else { Flag::LimpFoldVsNonAllInOpp });
        if limp_fold {
            f.set(if faced_raise_after_limp_all_in { Flag::LimpFoldVsAllIn } else { Flag::LimpFoldVsNonAllIn });
        }
        if opened_or_raised && has_limped {
            f.set(Flag::LimpRaise);
        }
    }
    // Judged at the first decision: raises that come later must not undo an isolation.
    if first_decision_facing_limp && first_decision_was_raise {
        f.set(Flag::IsoRaise);
        f.set(if open_shove || iso_shove { Flag::IsoAllIn } else { Flag::IsoNonAllIn });
    }
    set_if(&mut f, three_bet && raises_seen >= 2 && limps_before > 0, Flag::Squeeze);
    set_if(&mut f, raises_seen >= 1 && limps_before > 0, Flag::SqueezeOpp);

    let position = input.position;
    if position == "BTN" || position == "SB" {
        f.set(Flag::StealOpp);
        if open_raise {
            f.set(Flag::Steal);
            if faced_3bet_after_open {
                f.set(Flag::StealFold3Opp);
                set_if(&mut f, fold_to_3bet, Flag::StealFold3);
            }
            if four_bet {
                f.set(Flag::Steal4Bet);
                set_if(&mut f, four_bet_fold, Flag::Steal4BetFold);
            }
        }
    }

    if (position == "SB" || position == "BB") && raises_seen >= 1 {
        f.set(Flag::VsStealOpp);
        if three_bet {
            f.set(Flag::VsSteal3Bet);
        } else if call_open {
            f.set(Flag::VsStealCall);
        } else if player_acts.iter().any(|a| a.kind == ActionKind::Fold) {
            f.set(Flag::VsStealFold);
        }
    }

    spin_flags(&mut f, input, pre, &player_acts, limp, call_open, three_bet);

    set_if(&mut f, open_shove_opp, Flag::OpenShoveOpp);
    set_if(&mut f, open_shove, Flag::OpenShove);
    set_if(&mut f, iso_shove_opp, Flag::IsoShoveOpp);
    set_if(&mut f, iso_shove, Flag::IsoShove);
    set_if(&mut f, rejam_opp, Flag::RejamOpp);
    set_if(&mut f, rejam, Flag::Rejam);
    set_if(&mut f, call_shove, Flag::CallShove);
    set_if(&mut f, fold_vs_shove, Flag::FoldVsShove);
    f
}

/// Facing a raise at the first decision: sizes the raise against the standard open buckets.
fn count_facing_raise(f: &mut Flags, size_bb: Option<f64>, is_all_in: bool, answer: ActionKind) {
    f.set(Flag::FacingRaiseOpp);
    if is_all_in {
        f.set(Flag::FacingOpenShoveOpp);
    }
    let folded = answer == ActionKind::Fold;
    let called = answer == ActionKind::Call;
    if folded {
        f.set(Flag::FoldVsRaise);
    }
    if called {
        f.set(Flag::CallVsRaise);
    }

    let Some(size) = size_bb else { return };
    let (opp, fold, call) = if size <= 2.25 {
        (Flag::Facing2xOpp, Flag::FoldVs2x, Flag::CallVs2x)
    } else {
        (Flag::Facing2xPlusOpp, Flag::FoldVs2xPlus, Flag::CallVs2xPlus)
    };
    f.set(opp);
    if folded {
        f.set(fold);
    }
    if called {
        f.set(call);
    }

    let finer = match SizeBucket::of(size) {
        SizeBucket::Up2x => None,
        SizeBucket::Up25x => Some((Flag::Facing25xOpp, Flag::FoldVs25x, Flag::CallVs25x)),
        SizeBucket::Up3x => Some((Flag::Facing3xOpp, Flag::FoldVs3x, Flag::CallVs3x)),
        SizeBucket::Above => Some((Flag::Facing35xPlusOpp, Flag::FoldVs35xPlus, Flag::CallVs35xPlus)),
    };
    if let Some((opp, fold, call)) = finer {
        f.set(opp);
        if folded {
            f.set(fold);
        }
        if called {
            f.set(call);
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn spin_flags(
    f: &mut Flags,
    input: &PreflopInput,
    pre: &[Action],
    player_acts: &[&Action],
    limp: bool,
    call_open: bool,
    three_bet: bool,
) {
    let is_player = |a: &Action| eq_ic(&a.player, input.player);
    let first_non_post = pre.iter().find(|a| a.kind != ActionKind::Post);
    let first_aggression_by_others = pre.iter().find(|a| !is_player(a) && a.kind.is_aggressive());
    let folded = player_acts.iter().any(|a| a.kind == ActionKind::Fold);

    if input.player_count == 2 && input.position == "SB" && limp {
        // After the player's limp, how he answers a raise.
        let mut saw_limp = false;
        let mut faced_raise = false;
        for a in pre {
            if is_player(a) && a.kind == ActionKind::Call && !saw_limp {
                saw_limp = true;
                continue;
            }
            if !saw_limp {
                continue;
            }
            if !is_player(a) && a.kind.is_aggressive() {
                faced_raise = true;
            }
            if !is_player(a) || !faced_raise {
                continue;
            }
            match a.kind {
                ActionKind::Fold => f.set(Flag::HuSbLimpFoldVsRaise),
                ActionKind::Call => f.set(Flag::HuSbLimpCallVsRaise),
                ActionKind::Raise | ActionKind::Bet => f.set(Flag::HuSbLimpRaiseVsRaise),
                _ => {}
            }
        }
    }

    if input.player_count == 2 && input.position == "BB" {
        let opened_with_limp = first_non_post.is_some_and(|a| !is_player(a) && a.kind == ActionKind::Call);
        if opened_with_limp {
            f.set(Flag::HuBbVsLimpOpp);
            if player_acts.iter().any(|a| a.kind == ActionKind::Check) {
                f.set(Flag::HuBbVsLimpCheck);
            }
            if player_acts.iter().any(|a| a.kind.is_aggressive()) {
                f.set(Flag::HuBbVsLimpRaise);
            }
        } else if first_aggression_by_others.is_some() {
            f.set(Flag::HuBbVsRaiseOpp);
            if folded {
                f.set(Flag::HuBbVsRaiseFold);
            } else if call_open {
                f.set(Flag::HuBbVsRaiseCall);
            } else if three_bet {
                f.set(Flag::HuBbVsRaise3Bet);
            }
        }
    }

    if input.player_count == 3 && input.position == "BB" && first_aggression_by_others.is_some() {
        f.set(Flag::ThreeWBbVsStealOpp);
        if folded {
            f.set(Flag::ThreeWBbVsStealFold);
        } else if call_open {
            f.set(Flag::ThreeWBbVsStealCall);
        } else if three_bet {
            f.set(Flag::ThreeWBbVsSteal3Bet);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engines::actions::parse_actions;

    fn flags(text: &str, player: &str, position: &str, player_count: i32) -> Flags {
        let actions = parse_actions(text);
        compute(&PreflopInput { actions: &actions, player, position, player_count, blinds: "10/20" })
    }

    fn set_of(f: &Flags) -> Vec<&'static str> {
        f.iter().map(Flag::name).collect()
    }

    #[test]
    fn open_raise_from_the_button() {
        let text = "SB posts small blind 10\nBB posts big blind 20\nHero raises 20 to 50\nSB folds\nBB folds";
        let f = flags(text, "Hero", "BTN", 3);
        for flag in [Flag::Vpip, Flag::Pfr, Flag::RfiOpp, Flag::Rfi, Flag::LimpOpp, Flag::Rfi25x, Flag::Rfi2xPlus, Flag::StealOpp, Flag::Steal] {
            assert!(f.has(flag), "{} should be set: {:?}", flag.name(), set_of(&f));
        }
        for flag in [Flag::Limp, Flag::ThreeBetOpp, Flag::Rfi2x, Flag::Rfi3x, Flag::FoldTo3BetOpp] {
            assert!(!f.has(flag), "{} should not be set", flag.name());
        }
    }

    #[test]
    fn big_blind_facing_an_open_raise_and_three_betting() {
        let text = "SB posts small blind 10\nHero posts big blind 20\nBTN raises 20 to 50\nSB folds\nHero raises 150 to 200";
        let f = flags(text, "Hero", "BB", 3);
        for flag in [
            Flag::Vpip, Flag::Pfr, Flag::FacingRaiseOpp, Flag::Facing25xOpp, Flag::Facing2xPlusOpp, Flag::CallOpenOpp,
            Flag::ThreeBetOpp, Flag::ThreeBet, Flag::ThreeBetNonAllIn, Flag::VsStealOpp, Flag::VsSteal3Bet,
            Flag::ThreeWBbVsStealOpp, Flag::ThreeWBbVsSteal3Bet,
        ] {
            assert!(f.has(flag), "{} should be set: {:?}", flag.name(), set_of(&f));
        }
        assert!(!f.has(Flag::FoldVsRaise) && !f.has(Flag::VsStealCall) && !f.has(Flag::RfiOpp));
    }

    #[test]
    fn opener_folding_to_a_three_bet() {
        let text = "SB posts small blind 10\nBB posts big blind 20\nHero raises 20 to 50\nSB raises 150 to 200 and is all-in\nBB folds\nHero folds";
        let f = flags(text, "Hero", "BTN", 3);
        for flag in [Flag::Rfi, Flag::FoldTo3BetOpp, Flag::FoldTo3Bet, Flag::FoldTo3BetShoveOpp, Flag::FoldTo3BetShove, Flag::FourBetOpp, Flag::StealFold3Opp, Flag::StealFold3] {
            assert!(f.has(flag), "{} should be set: {:?}", flag.name(), set_of(&f));
        }
        assert!(!f.has(Flag::FoldTo3BetNonAllIn) && !f.has(Flag::FourBet));
    }

    #[test]
    fn limp_then_fold_to_a_raise_and_iso_raise() {
        let limp = "SB posts small blind 10\nBB posts big blind 20\nHero calls 20\nSB raises 20 to 70\nBB folds\nHero folds";
        let f = flags(limp, "Hero", "BTN", 3);
        for flag in [Flag::LimpOpp, Flag::Limp, Flag::LimpFoldOpp, Flag::LimpFold, Flag::LimpFacedRaiseOpp, Flag::LimpFoldVsNonAllInOpp, Flag::LimpFoldVsNonAllIn] {
            assert!(f.has(flag), "{} should be set: {:?}", flag.name(), set_of(&f));
        }

        let iso = "SB posts small blind 10\nBB posts big blind 20\nBTN calls 20\nHero raises 20 to 80";
        let f = flags(iso, "Hero", "SB", 3);
        for flag in [Flag::FacingLimpOpp, Flag::IsoRaise, Flag::IsoNonAllIn, Flag::IsoShoveOpp] {
            assert!(f.has(flag), "{} should be set: {:?}", flag.name(), set_of(&f));
        }
        assert!(!f.has(Flag::RfiOpp), "a limper is already in the pot");
    }

    #[test]
    fn shove_and_call_shove_flags() {
        let shove = "SB posts small blind 10\nHero posts big blind 20\nBTN raises 20 to 180 and is all-in\nSB folds\nHero calls 160";
        let f = flags(shove, "Hero", "BB", 3);
        for flag in [Flag::FacingOpenShoveOpp, Flag::CallShove, Flag::RejamOpp] {
            assert!(f.has(flag), "{} should be set: {:?}", flag.name(), set_of(&f));
        }

        let open_shove = "SB posts small blind 10\nBB posts big blind 20\nHero raises 20 to 180 and is all-in\nSB folds\nBB folds";
        let f = flags(open_shove, "Hero", "BTN", 3);
        assert!(f.has(Flag::OpenShoveOpp) && f.has(Flag::OpenShove) && !f.has(Flag::IsoShove));
    }

    #[test]
    fn heads_up_big_blind_spots() {
        let vs_raise = "Hero posts small blind 10\nVillain posts big blind 20\nHero raises 20 to 40\nVillain raises 40 to 100\nHero folds";
        let f = flags(vs_raise, "Villain", "BB", 2);
        assert!(f.has(Flag::HuBbVsRaiseOpp) && f.has(Flag::HuBbVsRaise3Bet), "{:?}", set_of(&f));

        let vs_limp = "Hero posts small blind 10\nVillain posts big blind 20\nHero calls 10\nVillain checks";
        let f = flags(vs_limp, "Villain", "BB", 2);
        assert!(f.has(Flag::HuBbVsLimpOpp) && f.has(Flag::HuBbVsLimpCheck) && !f.has(Flag::HuBbVsLimpRaise), "{:?}", set_of(&f));
        assert!(!f.has(Flag::Vpip), "checking the big blind is not voluntary");
    }

    #[test]
    fn later_actions_always_have_their_opportunity() {
        // Cold 4-bet: no opening raise of his own, still an opportunity.
        let four = "Ann raises 20 to 50\nBob raises 50 to 150\nHero raises 150 to 400\nAnn folds";
        let f = flags(four, "Hero", "BB", 3);
        assert!(f.has(Flag::FourBet) && f.has(Flag::FourBetOpp), "{:?}", set_of(&f));

        // Limp, then call a raise: not a "call open", and the first decision was a limp.
        let limp_call = "SB posts small blind 10\nBB posts big blind 20\nHero calls 20\nSB raises 20 to 70\nBB folds\nHero calls 50";
        let f = flags(limp_call, "Hero", "BTN", 3);
        assert!(f.has(Flag::Limp) && !f.has(Flag::CallOpen), "{:?}", set_of(&f));

        // Overlimping counts as a limp with an opportunity to limp.
        let overlimp = "SB posts small blind 10\nBB posts big blind 20\nBTN calls 20\nHero calls 10";
        let f = flags(overlimp, "Hero", "SB", 3);
        assert!(f.has(Flag::Limp) && f.has(Flag::LimpOpp), "{:?}", set_of(&f));
    }

    #[test]
    fn names_are_compared_case_insensitively_and_unknown_players_get_nothing() {
        let text = "Bob posts big blind 20\nAnn raises 20 to 60\nBob folds";
        assert!(flags(text, "bob", "BB", 2).has(Flag::FacingRaiseOpp));
        assert_eq!(flags(text, "Nobody", "", 2), Flags::default());
    }
}
