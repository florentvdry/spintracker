//! All-in EV of a hand.
//!
//! When the hero went to showdown after an all-in before the river, the hand's result is
//! replaced by its expected value: the pot split by the hero's equity at the moment of the
//! all-in, slice by slice for side pots. Reproduces the former `AnalyticsCalculator`, including
//! its choice to leave a hand at its actual profit whenever PokerTracker 4 would.

use super::equity_cache::EquityCache;
use crate::models::{HandAnalytics, ParsedHand, PlayerInfo};
use crate::parsers::regex;
use crate::util::eq_ic;

/// A player who folded after investing voluntarily in a pot the hero is not part of: the hand's
/// EV is not computed and the actual profit is used.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VoluntaryFold;

pub struct AnalyticsCalculator {
    equity: EquityCache,
}

impl Default for AnalyticsCalculator {
    fn default() -> Self {
        Self::new(EquityCache::default())
    }
}

/// Rounds to 2 decimals, ties to even (the former `Math.Round(value, 2)`).
fn round2(value: f64) -> f64 {
    (value * 100.0).round_ties_even() / 100.0
}

impl AnalyticsCalculator {
    pub fn new(equity: EquityCache) -> Self {
        Self { equity }
    }

    pub fn equity_cache(&self) -> &EquityCache {
        &self.equity
    }

    pub fn calculate_hand_analytics(&self, hand: &ParsedHand) -> HandAnalytics {
        let mut analytics = HandAnalytics { hand_id: hand.id.clone(), ..HandAnalytics::default() };

        let Some(hero) = hand.players.iter().find(|p| p.is_hero) else { return analytics };
        analytics.player_name = Some(hero.name.clone());
        let hero_profit = hero.net_profit;
        let is_showdown = hero.went_to_showdown;

        // The profit goes entirely to one side of the showdown / no-showdown split.
        if is_showdown {
            analytics.chips_won_showdown = Some(hero_profit);
            analytics.chips_won_no_showdown = Some(0.0);
        } else {
            analytics.chips_won_showdown = Some(0.0);
            analytics.chips_won_no_showdown = Some(hero_profit);
        }

        let any_all_in = hand.players.iter().any(|p| p.is_all_in);
        let has_villain_cards = hand.players.iter().any(|p| !p.is_hero && !p.cards.is_empty());

        // Nothing left to come after a river all-in, so there is no equity to realise.
        let should_calculate_ev = is_showdown && any_all_in && has_villain_cards && !is_river_all_in(hand);

        if !should_calculate_ev {
            analytics.net_won_adjusted = Some(hero_profit);
            analytics.cev_contribution = Some(0.0);
            return analytics;
        }

        // Betting after the all-in means side pots developed: PokerTracker 4 skips the EV there.
        let ev = if has_side_action(hand) {
            None
        } else {
            match self.multiway_ev(hand) {
                Err(VoluntaryFold) => None,
                Ok(Some(ev)) => Some(ev),
                // The hand could not be evaluated (missing player info): simple estimate.
                Ok(None) => self.all_in_ev(hand),
            }
        };

        match ev {
            Some(ev) => {
                analytics.ev_chips = Some(round2(ev));
                analytics.net_won_adjusted = Some(round2(ev));
                analytics.cev_contribution = Some(round2(ev - hero_profit));
            }
            None => {
                analytics.net_won_adjusted = Some(hero_profit);
                analytics.cev_contribution = Some(0.0);
            }
        }
        analytics
    }

    /// EV of the hero over the pot slices he is part of, minus what he put into them.
    ///
    /// `Ok(None)` when the hand cannot be evaluated; `Err` when a folded player invested
    /// voluntarily in a slice the hero is not part of.
    fn multiway_ev(&self, hand: &ParsedHand) -> Result<Option<f64>, VoluntaryFold> {
        let Some(hero) = hand.players.iter().find(|p| p.is_hero) else { return Ok(None) };
        if hero.cards.is_empty() {
            return Ok(None);
        }

        // Players who showed or were dealt known cards and did not fold compete for the pot.
        let mut active: Vec<&PlayerInfo> = hand.players.iter().filter(|p| !p.cards.is_empty() && !p.folded).collect();
        if active.is_empty() || !active.iter().any(|p| p.is_hero) {
            return Ok(None);
        }
        // Stable sort: equal investments keep their seating order.
        active.sort_by(|a, b| a.investment.total_cmp(&b.investment));

        let board = board_at_all_in(hand);
        let mut total_ev = 0.0;
        let mut contested_investment = 0.0;
        let mut current_level = 0.0;

        for i in 0..active.len() {
            let investment = active[i].investment;
            if investment <= current_level {
                continue;
            }
            let step = investment - current_level;

            // Everyone pays into this slice up to their own investment.
            let step_pot: f64 =
                hand.players.iter().map(|p| (p.investment - current_level).min(step).max(0.0)).sum();
            if step_pot <= 0.01 {
                continue;
            }

            // Players from here on invested at least this much: they compete for the slice.
            let competing = &active[i..];
            if competing.iter().any(|p| p.is_hero) {
                let villains: Vec<&str> = competing.iter().filter(|p| !p.is_hero).map(|p| p.cards.as_str()).collect();

                if villains.is_empty() {
                    // The hero is alone in this slice: it is uncontested and left out of the EV,
                    // unless a folded player had put chips in voluntarily.
                    for player in &hand.players {
                        if player.investment > current_level && !player.is_hero && has_voluntary_action(&player.name, hand) {
                            return Err(VoluntaryFold);
                        }
                    }
                } else {
                    // Known cards of players who are out of this slice (all-in for less) are dead.
                    let dead: Vec<&str> = hand
                        .players
                        .iter()
                        .filter(|p| !p.cards.is_empty() && !p.is_hero && !competing.iter().any(|c| std::ptr::eq(*c, *p)))
                        .map(|p| p.cards.as_str())
                        .collect();

                    let equity = match self.equity.calculate(&hero.cards, &villains.join("|"), &board, Some(&dead.join(" "))) {
                        Ok(e) => e,
                        Err(e) => {
                            log::warn!("multiway EV: equity calculation failed: {e}");
                            return Ok(None);
                        }
                    };
                    total_ev += equity.hero_equity / 100.0 * step_pot;
                    contested_investment += step;
                }
            }
            current_level = investment;
        }

        Ok(Some(round2(total_ev - contested_investment)))
    }

    /// Simple estimate: the hero's equity times the pot, minus his investment.
    fn all_in_ev(&self, hand: &ParsedHand) -> Option<f64> {
        let hero = hand.players.iter().find(|p| p.is_hero)?;
        if hero.cards.is_empty() {
            return None;
        }
        let villains: Vec<&str> =
            hand.players.iter().filter(|p| !p.is_hero && !p.cards.is_empty()).map(|p| p.cards.as_str()).collect();
        if villains.is_empty() {
            return None;
        }

        let equity = match self.equity.calculate(&hero.cards, &villains.join("|"), &board_at_all_in(hand), None) {
            Ok(e) => e,
            Err(e) => {
                log::error!("EV calculation error: {e}");
                return None;
            }
        };
        let total_pot = hand.total_pot;
        let hero_investment = if hero.investment > 0.0 {
            hero.investment
        } else {
            parse_hero_investment(hand).unwrap_or(total_pot / 2.0)
        };
        Some(equity.hero_equity / 100.0 * total_pot - hero_investment)
    }
}

fn is_river_all_in(hand: &ParsedHand) -> bool {
    hand.all_in_street.as_deref().is_some_and(|s| s.eq_ignore_ascii_case("RIVER"))
}

/// True when anyone acts on a street after the one where the all-in happened.
fn has_side_action(hand: &ParsedHand) -> bool {
    let Some(street) = hand.all_in_street.as_deref().filter(|s| !s.is_empty()) else { return false };
    let later: &[&str] = match street.to_ascii_uppercase().as_str() {
        "PREFLOP" => &[&hand.flop_action, &hand.turn_action, &hand.river_action],
        "FLOP" => &[&hand.turn_action, &hand.river_action],
        "TURN" => &[&hand.river_action],
        _ => &[],
    };
    later.iter().any(|text| has_player_action(text))
}

fn has_player_action(text: &str) -> bool {
    let lower = text.to_lowercase();
    ["bets", "calls", "raises", "checks"].iter().any(|k| lower.contains(k))
}

/// Whether `player` called, bet or raised on any street.
///
/// Only lines of the form "[time - ]Name: action" are understood, as before: rooms that write
/// actions without a colon (Winamax, Unibet) never count as voluntary here.
fn has_voluntary_action(player: &str, hand: &ParsedHand) -> bool {
    let line_player = regex!(r"^(?:[0-9:]+\s*-\s*)?([^:]+):");
    [&hand.preflop_action, &hand.flop_action, &hand.turn_action, &hand.river_action]
        .iter()
        .flat_map(|street| street.split('\n'))
        .filter(|line| !line.trim().is_empty())
        .any(|line| {
            line_player.captures(line).is_some_and(|c| {
                if !eq_ic(c[1].trim(), player) {
                    return false;
                }
                let lower = line.to_lowercase();
                lower.contains("calls") || lower.contains("bets") || lower.contains("raises")
            })
        })
}

/// Board known when the chips went in.
fn board_at_all_in(hand: &ParsedHand) -> String {
    let flop = hand.flop.as_deref().unwrap_or("");
    let turn = hand.turn.as_deref().unwrap_or("");
    let river = hand.river.as_deref().unwrap_or("");
    match hand.all_in_street.as_deref().unwrap_or("").to_ascii_uppercase().as_str() {
        "PREFLOP" | "HOLE_CARDS" => String::new(),
        "FLOP" => flop.trim().to_string(),
        "TURN" => format!("{flop} {turn}").trim().to_string(),
        // River or unknown: the full board.
        _ => format!("{flop} {turn} {river}").trim().to_string(),
    }
}

/// The hero's own chips in the pot, read back from the action text. Fallback of `all_in_ev`.
fn parse_hero_investment(hand: &ParsedHand) -> Option<f64> {
    let hero = hand.players.iter().find(|p| p.is_hero)?;
    let hero_name = hero.name.to_lowercase();
    let posts = regex!(r"(?i)posts\s+\w+\s+(\d+)");
    let raises_to = regex!(r"(?i)raises\s+to\s+(\d+)");
    let calls = regex!(r"(?i)calls\s+(\d+)");
    let bets = regex!(r"(?i)bets\s+(\d+)");
    let all_in = regex!(r"(?i)(\d+)\s+and\s+is\s+all-in");
    let number = |c: regex::Captures| c[1].parse::<f64>().unwrap_or(0.0);

    let mut total = 0.0;
    for street in [&hand.preflop_action, &hand.flop_action, &hand.turn_action, &hand.river_action] {
        let mut street_investment = 0.0;
        for line in street.split('\n').filter(|l| !l.trim().is_empty()) {
            if !line.to_lowercase().contains(&hero_name) {
                continue;
            }
            if let Some(c) = posts.captures(line) {
                street_investment = number(c);
            } else if let Some(c) = raises_to.captures(line) {
                street_investment = number(c);
            } else if let Some(c) = calls.captures(line) {
                street_investment += number(c);
            } else if let Some(c) = bets.captures(line) {
                street_investment = number(c);
            } else if let Some(c) = all_in.captures(line) {
                let amount = number(c);
                if line.to_lowercase().contains("raises to") {
                    street_investment = amount;
                } else {
                    street_investment += amount;
                }
            }
        }
        total += street_investment;
    }
    (total > 0.0).then_some(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn player(name: &str, cards: &str, investment: f64, profit: f64) -> PlayerInfo {
        PlayerInfo {
            name: name.into(),
            cards: cards.into(),
            investment,
            net_profit: profit,
            is_all_in: true,
            went_to_showdown: true,
            ..PlayerInfo::default()
        }
    }

    fn hero(cards: &str, investment: f64, profit: f64) -> PlayerInfo {
        PlayerInfo { is_hero: true, ..player("Hero", cards, investment, profit) }
    }

    fn base_hand(players: Vec<PlayerInfo>) -> ParsedHand {
        ParsedHand {
            id: Some("h".into()),
            all_in_street: Some("PREFLOP".into()),
            went_to_showdown: true,
            flop: Some("2c 7d 9h".into()),
            turn: Some("Js".into()),
            river: Some("3d".into()),
            players,
            ..ParsedHand::default()
        }
    }

    #[test]
    fn preflop_heads_up_all_in_uses_the_exact_equity() {
        // AA vs KK is about 82% for the aces: EV = 0.82 * 2000 - 1000.
        let hand = base_hand(vec![hero("Ah Ad", 1000.0, 1000.0), player("Villain", "Kc Kd", 1000.0, -1000.0)]);
        let a = AnalyticsCalculator::default().calculate_hand_analytics(&hand);
        let ev = a.ev_chips.unwrap();
        assert!((600.0..700.0).contains(&ev), "ev {ev}");
        assert_eq!(a.net_won_adjusted, Some(ev));
        assert_eq!(a.cev_contribution, Some(round2(ev - 1000.0)));
        assert_eq!(a.chips_won_showdown, Some(1000.0));
        assert_eq!(a.chips_won_no_showdown, Some(0.0));
    }

    #[test]
    fn flop_all_in_uses_the_flop_only() {
        let mut hand = base_hand(vec![hero("Ah Kh", 500.0, -500.0), player("Villain", "Qs Qd", 500.0, 500.0)]);
        hand.all_in_street = Some("FLOP".into());
        hand.flop = Some("2h 7h 9c".into());
        assert_eq!(board_at_all_in(&hand), "2h 7h 9c");
        let ev = AnalyticsCalculator::default().calculate_hand_analytics(&hand).ev_chips.unwrap();
        // About 54% for the flush draw plus overcards against the pair.
        assert!((-100.0..200.0).contains(&ev), "ev {ev}");
    }

    #[test]
    fn side_pot_slices_are_valued_separately() {
        // Hero covers both: 100 main pot slice against two opponents, then 200 against the other.
        let hand = base_hand(vec![
            hero("Ah Ad", 400.0, 0.0),
            player("Short", "Kc Kd", 100.0, 0.0),
            player("Mid", "Qc Qd", 300.0, 0.0),
        ]);
        let calc = AnalyticsCalculator::default();
        let ev = calc.multiway_ev(&hand).unwrap().unwrap();
        // Hero contested 300 of his 400 (the uncalled 100 is left out of the EV).
        let main = calc.equity.calculate("Ah Ad", "Kc Kd|Qc Qd", "", Some("")).unwrap().hero_equity / 100.0 * 300.0;
        let side = calc.equity.calculate("Ah Ad", "Qc Qd", "", Some("Kc Kd")).unwrap().hero_equity / 100.0 * 400.0;
        assert_eq!(ev, round2(main + side - (100.0 + 200.0)));
    }

    #[test]
    fn river_all_in_and_missing_cards_keep_the_actual_profit() {
        let mut hand = base_hand(vec![hero("Ah Ad", 1000.0, 1000.0), player("Villain", "Kc Kd", 1000.0, -1000.0)]);
        hand.all_in_street = Some("RIVER".into());
        let calc = AnalyticsCalculator::default();
        let a = calc.calculate_hand_analytics(&hand);
        assert_eq!((a.ev_chips, a.net_won_adjusted, a.cev_contribution), (None, Some(1000.0), Some(0.0)));

        let mut hand = base_hand(vec![hero("Ah Ad", 1000.0, 1000.0), player("Villain", "", 1000.0, -1000.0)]);
        hand.all_in_street = Some("PREFLOP".into());
        assert_eq!(calc.calculate_hand_analytics(&hand).ev_chips, None);
    }

    #[test]
    fn betting_after_the_all_in_skips_the_ev() {
        let mut hand = base_hand(vec![hero("Ah Ad", 1000.0, 1000.0), player("Villain", "Kc Kd", 1000.0, -1000.0)]);
        hand.river_action = "Hero checks".into();
        assert!(has_side_action(&hand));
        assert_eq!(AnalyticsCalculator::default().calculate_hand_analytics(&hand).ev_chips, None);

        hand.all_in_street = Some("FLOP".into());
        assert!(has_side_action(&hand), "river action counts after a flop all-in");
        hand.all_in_street = Some("RIVER".into());
        assert!(!has_side_action(&hand));
    }

    #[test]
    fn a_hero_without_cards_or_not_present_gets_no_ev() {
        let calc = AnalyticsCalculator::default();
        let no_hero = base_hand(vec![player("A", "Ah Ad", 100.0, 0.0), player("B", "Kc Kd", 100.0, 0.0)]);
        let a = calc.calculate_hand_analytics(&no_hero);
        assert_eq!((a.player_name, a.ev_chips, a.net_won_adjusted), (None, None, None));
        assert_eq!(a.hand_id.as_deref(), Some("h"));
    }

    #[test]
    fn voluntary_chips_of_a_folded_player_force_the_actual_profit() {
        // The hero is alone in the top slice (300 vs 100): a folded player who bet voluntarily
        // behind him means the pot was not a clean all-in.
        let mut folded = PlayerInfo { folded: true, investment: 250.0, ..PlayerInfo::default() };
        folded.name = "Folder".into();
        let mut hand = base_hand(vec![hero("Ah Ad", 300.0, 0.0), player("Short", "Kc Kd", 100.0, 0.0), folded]);
        hand.preflop_action = "00:01 - Folder: Raises to 250".into();
        let calc = AnalyticsCalculator::default();
        assert_eq!(calc.multiway_ev(&hand), Err(VoluntaryFold));
        assert_eq!(calc.calculate_hand_analytics(&hand).ev_chips, None);

        // Without a colon the line is not understood, exactly like the former backend.
        hand.preflop_action = "Folder raises 250".into();
        assert!(calc.multiway_ev(&hand).is_ok());
    }

    #[test]
    fn legacy_estimate_uses_the_pot_when_no_player_info_exists() {
        let mut hand = base_hand(vec![hero("Ah Ad", 0.0, 0.0), player("Villain", "Kc Kd", 0.0, 0.0)]);
        hand.total_pot = 2000.0;
        hand.preflop_action = "Hero: Raises to 1000 and is all-in".into();
        assert_eq!(parse_hero_investment(&hand), Some(1000.0));
        let ev = AnalyticsCalculator::default().all_in_ev(&hand).unwrap();
        assert!((600.0..700.0).contains(&ev), "ev {ev}");
    }

    #[test]
    fn board_depends_on_the_all_in_street() {
        let mut hand = base_hand(vec![]);
        assert_eq!(board_at_all_in(&hand), "");
        hand.all_in_street = Some("TURN".into());
        assert_eq!(board_at_all_in(&hand), "2c 7d 9h Js");
        hand.all_in_street = None;
        assert_eq!(board_at_all_in(&hand), "2c 7d 9h Js 3d");
    }
}
