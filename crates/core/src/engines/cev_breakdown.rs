//! Chip EV split by table mix, multiplier, tournament progress and the tournaments that follow a
//! bad beat. Pure: the rows come from `repos::cev_breakdown` in chronological order.

use std::collections::{BTreeMap, HashMap};

use serde::Serialize;

/// How many equal parts a tournament is cut into to read the progress.
pub const PROGRESS_TRANCHES: usize = 4;
pub const DEFAULT_BAD_BEAT_WINDOW: usize = 10;
pub const MAX_BAD_BEAT_WINDOW: usize = 100;
/// Hero equity (percent) from which losing an all-in counts as a bad beat.
pub const DEFAULT_BAD_BEAT_EQUITY: f64 = 60.0;
/// A recorded finish above this place means the hero was knocked out of the tournament.
const WINNING_PLACE: i32 = 1;

/// One hand of the hero, with the figures the breakdowns need.
#[derive(Debug, Clone, PartialEq)]
pub struct HandRow {
    pub game_id: Option<String>,
    pub multiplier: i32,
    /// Chip EV of the hand (0 when it is unknown).
    pub ev: f64,
    pub hand_profit: f64,
    /// Opponents of the hero who are registered regulars.
    pub regs: i64,
    /// Other players in the hand.
    pub opponents: i64,
    pub hero_all_in: bool,
    /// Hero equity (percent) at the last street with a known value.
    pub hero_equity: Option<f64>,
    /// Recorded finish place of the tournament on this hand, 0 when unknown.
    pub finish: i32,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
pub struct Bucket {
    pub hands: i64,
    pub ev: f64,
}

impl Bucket {
    fn add(&mut self, ev: f64) {
        self.hands += 1;
        self.ev += ev;
    }
}

/// Who sat with the hero: only fish, only regulars, or both.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TableMix {
    FishOnly,
    Mixed,
    RegOnly,
}

/// The mix of a hand, or None when the hero played alone (no opponents to classify).
pub fn table_mix(regs: i64, opponents: i64) -> Option<TableMix> {
    match (regs, opponents) {
        (_, o) if o <= 0 => None,
        (0, _) => Some(TableMix::FishOnly),
        (r, o) if r >= o => Some(TableMix::RegOnly),
        _ => Some(TableMix::Mixed),
    }
}

/// Progress of a hand in its tournament: `index` is its rank among the tournament's hands.
pub fn progress_tranche(index: usize, total: usize) -> usize {
    if total == 0 {
        return 0;
    }
    (index * PROGRESS_TRANCHES / total).min(PROGRESS_TRANCHES - 1)
}

/// A hand that the bad-beat definition flags: an all-in lost with enough equity, or a
/// tournament ended by a knockout on this hand.
pub fn is_bad_beat(hand: &HandRow, equity_threshold: f64) -> bool {
    hand.hero_all_in && hand.hand_profit < 0.0 && hand.hero_equity.is_some_and(|e| e >= equity_threshold)
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AfterBadBeat {
    pub window: usize,
    pub equity_threshold: f64,
    /// Tournaments that had a bad beat.
    pub bad_beats: usize,
    /// Distinct tournaments played in the windows after a bad beat (each counted once).
    pub tournaments: usize,
    pub ev: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Breakdown {
    pub by_table_mix: BTreeMap<TableMix, Bucket>,
    pub by_multiplier: BTreeMap<i32, Bucket>,
    /// Index 0 is the first part of the tournaments, the last one the final part.
    pub by_progress: Vec<Bucket>,
    pub after_bad_beat: AfterBadBeat,
}

/// Aggregates the hero's hands. `rows` must be in chronological order.
pub fn compute(rows: &[HandRow], window: usize, equity_threshold: f64) -> Breakdown {
    let mut by_table_mix: BTreeMap<TableMix, Bucket> = BTreeMap::new();
    let mut by_multiplier: BTreeMap<i32, Bucket> = BTreeMap::new();
    let mut by_progress = vec![Bucket::default(); PROGRESS_TRANCHES];

    // Tournaments in the order they start, with their total hands and their EV.
    let mut game_index: HashMap<&str, usize> = HashMap::new();
    let mut game_hands: Vec<usize> = Vec::new();
    let mut game_ev: Vec<f64> = Vec::new();
    let mut game_bad_beat: Vec<bool> = Vec::new();
    for row in rows {
        if let Some(id) = row.game_id.as_deref() {
            let index = *game_index.entry(id).or_insert_with(|| {
                game_hands.push(0);
                game_ev.push(0.0);
                game_bad_beat.push(false);
                game_hands.len() - 1
            });
            game_hands[index] += 1;
        }
    }

    let mut seen: Vec<usize> = vec![0; game_hands.len()];
    let mut last_finish: Vec<i32> = vec![0; game_hands.len()];
    for row in rows {
        if let Some(mix) = table_mix(row.regs, row.opponents) {
            by_table_mix.entry(mix).or_default().add(row.ev);
        }
        by_multiplier.entry(row.multiplier).or_default().add(row.ev);

        if let Some(index) = row.game_id.as_deref().and_then(|id| game_index.get(id).copied()) {
            let rank = seen[index];
            seen[index] += 1;
            by_progress[progress_tranche(rank, game_hands[index])].add(row.ev);
            game_ev[index] += row.ev;
            last_finish[index] = row.finish;
            if is_bad_beat(row, equity_threshold) {
                game_bad_beat[index] = true;
            }
        }
    }

    // A knockout is a bad beat too: the tournament ended on a finish other than first.
    let knocked_out: Vec<bool> = last_finish.iter().map(|&place| place > WINNING_PLACE).collect();
    let flagged: Vec<bool> = game_bad_beat.iter().zip(&knocked_out).map(|(bad, out)| *bad || *out).collect();

    let after_bad_beat = after_bad_beat(&flagged, &game_ev, window, equity_threshold);
    Breakdown { by_table_mix, by_multiplier, by_progress, after_bad_beat }
}

/// Sums the EV of the tournaments in the `window` that follow each flagged one. A tournament
/// covered by several windows is counted once.
fn after_bad_beat(flagged: &[bool], game_ev: &[f64], window: usize, equity_threshold: f64) -> AfterBadBeat {
    let mut covered = vec![false; flagged.len()];
    let mut bad_beats = 0;
    for (index, is_flagged) in flagged.iter().enumerate() {
        if !is_flagged {
            continue;
        }
        bad_beats += 1;
        let end = (index + 1 + window).min(flagged.len());
        for slot in covered.iter_mut().take(end).skip(index + 1) {
            *slot = true;
        }
    }
    let tournaments = covered.iter().filter(|c| **c).count();
    let ev = covered.iter().zip(game_ev).filter(|(c, _)| **c).map(|(_, ev)| ev).sum();
    AfterBadBeat { window, equity_threshold, bad_beats, tournaments, ev }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hand(game: &str, ev: f64) -> HandRow {
        HandRow {
            game_id: Some(game.to_string()),
            multiplier: 10,
            ev,
            hand_profit: 0.0,
            regs: 0,
            opponents: 2,
            hero_all_in: false,
            hero_equity: None,
            finish: 0,
        }
    }

    #[test]
    fn table_mix_classifies_opponents() {
        assert_eq!(table_mix(0, 2), Some(TableMix::FishOnly));
        assert_eq!(table_mix(1, 2), Some(TableMix::Mixed));
        assert_eq!(table_mix(2, 2), Some(TableMix::RegOnly));
        assert_eq!(table_mix(1, 1), Some(TableMix::RegOnly));
        assert_eq!(table_mix(0, 0), None);
    }

    #[test]
    fn progress_splits_a_tournament_into_equal_parts() {
        let tranches: Vec<usize> = (0..8).map(|i| progress_tranche(i, 8)).collect();
        assert_eq!(tranches, vec![0, 0, 1, 1, 2, 2, 3, 3]);
        assert_eq!(progress_tranche(0, 0), 0);
    }

    #[test]
    fn breakdown_sums_every_hand_once_per_dimension() {
        let mut rows = vec![hand("A", 1.0), hand("A", 2.0), hand("B", -1.0)];
        rows[1].regs = 2;
        rows[1].multiplier = 50;
        let result = compute(&rows, 0, DEFAULT_BAD_BEAT_EQUITY);
        assert_eq!(result.by_table_mix[&TableMix::FishOnly].hands, 2);
        assert_eq!(result.by_table_mix[&TableMix::RegOnly].hands, 1);
        assert!((result.by_multiplier[&10].ev - 0.0).abs() < 1e-9);
        assert_eq!(result.by_multiplier[&50].hands, 1);
        let progress_hands: i64 = result.by_progress.iter().map(|b| b.hands).sum();
        assert_eq!(progress_hands, 3);
    }

    #[test]
    fn lost_all_in_with_enough_equity_is_a_bad_beat() {
        let mut hero = hand("A", -10.0);
        hero.hero_all_in = true;
        hero.hand_profit = -10.0;
        hero.hero_equity = Some(80.0);
        assert!(is_bad_beat(&hero, 60.0));
        hero.hero_equity = Some(50.0);
        assert!(!is_bad_beat(&hero, 60.0));
        hero.hero_equity = Some(80.0);
        hero.hand_profit = 10.0;
        assert!(!is_bad_beat(&hero, 60.0));
    }

    #[test]
    fn knockout_flags_the_tournament_and_window_counts_each_once() {
        // Tournament A is knocked out (finish 3), B and C follow, D is clean.
        let mut rows = vec![hand("A", 1.0), hand("B", 2.0), hand("C", 4.0), hand("D", 8.0)];
        rows[0].finish = 3;
        let result = compute(&rows, 2, DEFAULT_BAD_BEAT_EQUITY);
        assert_eq!(result.after_bad_beat.bad_beats, 1);
        assert_eq!(result.after_bad_beat.tournaments, 2);
        assert!((result.after_bad_beat.ev - 6.0).abs() < 1e-9);
    }

    #[test]
    fn overlapping_windows_do_not_double_count() {
        // Two bad beats at A and B with window 2 cover B, C, D once each.
        let flagged = [true, true, false, false];
        let evs = [1.0, 2.0, 4.0, 8.0];
        let result = after_bad_beat(&flagged, &evs, 2, DEFAULT_BAD_BEAT_EQUITY);
        assert_eq!(result.bad_beats, 2);
        assert_eq!(result.tournaments, 3);
        assert!((result.ev - 14.0).abs() < 1e-9);
    }

    #[test]
    fn window_stops_at_the_last_tournament() {
        let result = after_bad_beat(&[false, true], &[1.0, 2.0], 50, DEFAULT_BAD_BEAT_EQUITY);
        assert_eq!(result.tournaments, 0);
        assert_eq!(result.ev, 0.0);
    }
}
