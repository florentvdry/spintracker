//! Chip EV broken down by table composition, multiplier, session progress and bad beats.
//!
//! Pure computation over the hero's hands in chronological order; the SQL that feeds it lives in
//! `repos::cev_breakdown`.

use std::collections::{BTreeMap, HashMap};

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

/// Hands further apart than this belong to different sessions.
pub const SESSION_GAP_HOURS: f64 = 2.0;

/// Session progress buckets: the tournament's rank in its session, as inclusive upper bounds.
/// The last bucket is open-ended.
const SESSION_BUCKET_ENDS: [usize; 4] = [10, 20, 35, 50];

pub const DEFAULT_BAD_BEAT_FOLLOWING: usize = 5;
pub const DEFAULT_BAD_BEAT_MIN_EQUITY_PERCENT: f64 = 70.0;

/// One hand of the hero.
#[derive(Debug, Clone)]
pub struct HandRow {
    pub time: Option<NaiveDateTime>,
    pub game_id: String,
    pub multiplier: i32,
    pub player_count: i32,
    /// All-in adjusted result of the hand, in chips.
    pub ev: f64,
    pub profit: f64,
    pub all_in: bool,
    /// EV of the hand when it was computed (an all-in at showdown).
    pub ev_chips: Option<f64>,
    pub investment: f64,
    pub total_pot: f64,
    /// Opponents flagged as regulars at the table in this hand.
    pub regs: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BadBeatMode {
    /// The lost all-in knocked the hero out of the tournament.
    #[default]
    Elimination,
    /// Any lost all-in where the hero was far ahead, eliminated or not.
    BigPot,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BadBeatParams {
    pub following: usize,
    pub min_equity_percent: f64,
    pub mode: BadBeatMode,
}

impl Default for BadBeatParams {
    fn default() -> Self {
        Self { following: DEFAULT_BAD_BEAT_FOLLOWING, min_equity_percent: DEFAULT_BAD_BEAT_MIN_EQUITY_PERCENT, mode: BadBeatMode::default() }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Bucket {
    pub hands: i64,
    pub tournaments: i64,
    pub ev: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MultiplierBucket {
    pub multiplier: i32,
    pub tournaments: i64,
    pub ev: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ProgressBucket {
    /// First tournament rank of the bucket (1-based).
    pub from: usize,
    /// Last rank, `None` for the open-ended bucket.
    pub to: Option<usize>,
    pub tournaments: i64,
    pub ev: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct AfterBadBeat {
    pub bad_beats: i64,
    pub tournaments_after: i64,
    pub ev_after: f64,
    pub avg_after: f64,
    pub avg_all: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Breakdown {
    /// `hu_fish`, `hu_reg`, `3w_2fish`, `3w_1reg_1fish`, `3w_2regs`.
    pub by_composition: BTreeMap<String, Bucket>,
    pub by_multiplier: Vec<MultiplierBucket>,
    pub by_session_progress: Vec<ProgressBucket>,
    pub after_bad_beat: AfterBadBeat,
}

/// Composition key of a hand, `None` for a table size the Spin format does not have.
pub fn composition_key(player_count: i32, regs: i32) -> Option<&'static str> {
    match (player_count, regs) {
        (2, 0) => Some("hu_fish"),
        (2, r) if r >= 1 => Some("hu_reg"),
        (3, 0) => Some("3w_2fish"),
        (3, 1) => Some("3w_1reg_1fish"),
        (3, r) if r >= 2 => Some("3w_2regs"),
        _ => None,
    }
}

/// Hero's equity at the moment of a lost all-in, rebuilt from the hand's EV: the EV is the share
/// of the pot the equity is worth minus what the hero put in.
fn all_in_equity_percent(hand: &HandRow) -> Option<f64> {
    let ev = hand.ev_chips?;
    (hand.total_pot > 0.0).then(|| ((ev + hand.investment) / hand.total_pot * 100.0).clamp(0.0, 100.0))
}

fn is_bad_beat(hand: &HandRow, is_last_of_tournament: bool, params: &BadBeatParams) -> bool {
    if !hand.all_in || hand.profit >= 0.0 {
        return false;
    }
    if params.mode == BadBeatMode::Elimination && !is_last_of_tournament {
        return false;
    }
    all_in_equity_percent(hand).is_some_and(|equity| equity >= params.min_equity_percent)
}

/// One tournament in play order.
struct Game {
    ev: f64,
    multiplier: i32,
    start: Option<NaiveDateTime>,
    bad_beat: bool,
}

pub fn compute(hands: &[HandRow], params: &BadBeatParams) -> Breakdown {
    let mut out = Breakdown::default();

    let mut order: Vec<&str> = Vec::new();
    let mut last_hand_of: HashMap<&str, usize> = HashMap::new();
    for (i, hand) in hands.iter().enumerate() {
        if last_hand_of.insert(hand.game_id.as_str(), i).is_none() {
            order.push(hand.game_id.as_str());
        }
    }

    let mut games: HashMap<&str, Game> = HashMap::new();
    let mut composition_games: BTreeMap<&'static str, std::collections::HashSet<&str>> = BTreeMap::new();
    for (i, hand) in hands.iter().enumerate() {
        let game = games.entry(hand.game_id.as_str()).or_insert(Game { ev: 0.0, multiplier: 0, start: hand.time, bad_beat: false });
        game.ev += hand.ev;
        game.multiplier = game.multiplier.max(hand.multiplier);
        if is_bad_beat(hand, last_hand_of[hand.game_id.as_str()] == i, params) {
            game.bad_beat = true;
        }

        if let Some(key) = composition_key(hand.player_count, hand.regs) {
            let bucket = out.by_composition.entry(key.to_string()).or_default();
            bucket.hands += 1;
            bucket.ev += hand.ev;
            composition_games.entry(key).or_default().insert(hand.game_id.as_str());
        }
    }
    for (key, ids) in composition_games {
        if let Some(bucket) = out.by_composition.get_mut(key) {
            bucket.tournaments = ids.len() as i64;
        }
    }

    // Multipliers: one entry per tournament, the multiplier being known on every hand of it.
    let mut by_multiplier: BTreeMap<i32, MultiplierBucket> = BTreeMap::new();
    for id in &order {
        let game = &games[id];
        let bucket = by_multiplier.entry(game.multiplier).or_insert(MultiplierBucket { multiplier: game.multiplier, tournaments: 0, ev: 0.0 });
        bucket.tournaments += 1;
        bucket.ev += game.ev;
    }
    out.by_multiplier = by_multiplier.into_values().collect();

    out.by_session_progress = session_progress(&order, &games);
    out.after_bad_beat = after_bad_beat(&order, &games, params);
    out
}

fn session_progress(order: &[&str], games: &HashMap<&str, Game>) -> Vec<ProgressBucket> {
    let mut buckets: Vec<ProgressBucket> = Vec::new();
    let mut from = 1;
    for end in SESSION_BUCKET_ENDS {
        buckets.push(ProgressBucket { from, to: Some(end), tournaments: 0, ev: 0.0 });
        from = end + 1;
    }
    buckets.push(ProgressBucket { from, to: None, tournaments: 0, ev: 0.0 });

    let mut rank = 0;
    let mut previous: Option<NaiveDateTime> = None;
    for id in order {
        let game = &games[id];
        let gap_exceeded = match (previous, game.start) {
            (Some(prev), Some(now)) => (now - prev).num_milliseconds() as f64 / 3_600_000.0 > SESSION_GAP_HOURS,
            _ => false,
        };
        rank = if gap_exceeded { 1 } else { rank + 1 };
        if game.start.is_some() {
            previous = game.start;
        }
        let bucket = buckets.iter_mut().find(|b| b.to.map_or(true, |to| rank <= to)).expect("the last bucket is open-ended");
        bucket.tournaments += 1;
        bucket.ev += game.ev;
    }
    buckets
}

fn after_bad_beat(order: &[&str], games: &HashMap<&str, Game>, params: &BadBeatParams) -> AfterBadBeat {
    let total_ev: f64 = order.iter().map(|id| games[id].ev).sum();
    let mut result = AfterBadBeat { avg_all: if order.is_empty() { 0.0 } else { total_ev / order.len() as f64 }, ..AfterBadBeat::default() };

    let mut follows = vec![false; order.len()];
    for (i, id) in order.iter().enumerate() {
        if games[id].bad_beat {
            result.bad_beats += 1;
            for flag in follows.iter_mut().skip(i + 1).take(params.following) {
                *flag = true;
            }
        }
    }
    for (i, id) in order.iter().enumerate() {
        if follows[i] {
            result.tournaments_after += 1;
            result.ev_after += games[id].ev;
        }
    }
    if result.tournaments_after > 0 {
        result.avg_after = result.ev_after / result.tournaments_after as f64;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn at(hour: u32, minute: u32) -> Option<NaiveDateTime> {
        NaiveDate::from_ymd_opt(2026, 1, 1).unwrap().and_hms_opt(hour, minute, 0)
    }

    fn hand(game: &str, time: Option<NaiveDateTime>, ev: f64) -> HandRow {
        HandRow {
            time,
            game_id: game.into(),
            multiplier: 2,
            player_count: 3,
            ev,
            profit: ev,
            all_in: false,
            ev_chips: None,
            investment: 0.0,
            total_pot: 0.0,
            regs: 0,
        }
    }

    #[test]
    fn composition_keys_follow_the_table_size_and_the_regs() {
        assert_eq!(composition_key(2, 0), Some("hu_fish"));
        assert_eq!(composition_key(2, 1), Some("hu_reg"));
        assert_eq!(composition_key(3, 0), Some("3w_2fish"));
        assert_eq!(composition_key(3, 1), Some("3w_1reg_1fish"));
        assert_eq!(composition_key(3, 2), Some("3w_2regs"));
        assert_eq!(composition_key(4, 0), None);
    }

    #[test]
    fn hands_are_grouped_by_composition_with_their_tournaments() {
        let mut a = hand("g1", at(10, 0), 10.0);
        a.regs = 2;
        let mut b = hand("g1", at(10, 1), -4.0);
        b.regs = 2;
        let c = hand("g2", at(10, 20), 5.0);
        let out = compute(&[a, b, c], &BadBeatParams::default());
        assert_eq!(out.by_composition["3w_2regs"], Bucket { hands: 2, tournaments: 1, ev: 6.0 });
        assert_eq!(out.by_composition["3w_2fish"], Bucket { hands: 1, tournaments: 1, ev: 5.0 });
    }

    #[test]
    fn multipliers_group_tournaments_by_their_highest_multiplier() {
        let mut a = hand("g1", at(10, 0), 10.0);
        a.multiplier = 5;
        let mut b = hand("g1", at(10, 1), 1.0);
        b.multiplier = 0;
        let c = hand("g2", at(10, 20), -3.0);
        let out = compute(&[a, b, c], &BadBeatParams::default());
        assert_eq!(out.by_multiplier.len(), 2);
        assert_eq!(out.by_multiplier[0], MultiplierBucket { multiplier: 2, tournaments: 1, ev: -3.0 });
        assert_eq!(out.by_multiplier[1], MultiplierBucket { multiplier: 5, tournaments: 1, ev: 11.0 });
    }

    #[test]
    fn session_progress_restarts_after_a_long_break() {
        let mut hands = Vec::new();
        for i in 0..12 {
            hands.push(hand(&format!("a{i}"), at(8, i as u32), 1.0));
        }
        hands.push(hand("b0", at(20, 0), 100.0));
        let out = compute(&hands, &BadBeatParams::default());
        // 12 tournaments in the first session: ranks 1-10 and 11-12; the next session restarts at 1.
        assert_eq!(out.by_session_progress[0].tournaments, 11);
        assert_eq!(out.by_session_progress[0].ev, 110.0);
        assert_eq!(out.by_session_progress[1].tournaments, 2);
    }

    fn lost_all_in(game: &str, time: Option<NaiveDateTime>, equity_percent: f64) -> HandRow {
        let mut h = hand(game, time, -500.0);
        h.all_in = true;
        h.investment = 500.0;
        h.total_pot = 1000.0;
        // EV = equity x pot - investment.
        h.ev_chips = Some(equity_percent / 100.0 * 1000.0 - 500.0);
        h
    }

    #[test]
    fn a_bad_beat_tags_the_next_tournaments_only() {
        let mut hands = vec![lost_all_in("g1", at(9, 0), 85.0)];
        for i in 2..=8 {
            hands.push(hand(&format!("g{i}"), at(9, i as u32 * 5), 20.0));
        }
        let params = BadBeatParams { following: 3, ..BadBeatParams::default() };
        let out = compute(&hands, &params);
        assert_eq!(out.after_bad_beat.bad_beats, 1);
        assert_eq!(out.after_bad_beat.tournaments_after, 3);
        assert_eq!(out.after_bad_beat.avg_after, 20.0);
    }

    #[test]
    fn elimination_mode_ignores_a_lost_all_in_that_did_not_end_the_tournament() {
        let hands = vec![lost_all_in("g1", at(9, 0), 85.0), hand("g1", at(9, 1), 30.0), hand("g2", at(9, 10), 0.0)];
        let elimination = compute(&hands, &BadBeatParams::default());
        assert_eq!(elimination.after_bad_beat.bad_beats, 0);
        let big_pot = compute(&hands, &BadBeatParams { mode: BadBeatMode::BigPot, ..BadBeatParams::default() });
        assert_eq!(big_pot.after_bad_beat.bad_beats, 1);
    }

    #[test]
    fn an_all_in_below_the_equity_threshold_is_not_a_bad_beat() {
        let hands = vec![lost_all_in("g1", at(9, 0), 55.0), hand("g2", at(9, 10), 0.0)];
        assert_eq!(compute(&hands, &BadBeatParams::default()).after_bad_beat.bad_beats, 0);
    }
}
