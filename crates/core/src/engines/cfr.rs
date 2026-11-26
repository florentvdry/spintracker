//! A reference strategy for the heads-up all-in or fold game, by CFR+ (see `docs/design/preflop-cfr.md`).
//!
//! The small blind folds or goes all-in; the big blind facing the all-in folds or calls. The result
//! is the strategy nobody can exploit in this game. It is a reference to look at, never a grade:
//! the player's hands are not compared with it. Card removal between the two hands is ignored, as
//! in every chart of this kind, and the equities are Monte Carlo, so the numbers are close to, not
//! equal to, an exact solution; the reported exploitability says how close.

use super::exploit::{EquityTable, BIG_BLIND, SMALL_BLIND};
use super::range_scenarios::HAND_CLASS_COUNT;

/// Iterations of the default run: far past where the average strategy stops moving.
pub const DEFAULT_ITERATIONS: usize = 1500;

/// The solved game at one stack depth.
#[derive(Debug, Clone)]
pub struct PushFold {
    pub stack: f64,
    /// Probability that each class goes all-in as the small blind.
    pub shove: Vec<f64>,
    /// Probability that each class calls as the big blind.
    pub call: Vec<f64>,
    /// Value of the game for the small blind, in big blinds.
    pub value: f64,
    /// How much both sides could gain together by best-responding, in big blinds.
    pub exploitability: f64,
}

/// The share of dealt hands each class stands for.
fn probabilities(table: &EquityTable) -> Vec<f64> {
    let total: f64 = table.weights.iter().sum();
    table.weights.iter().map(|w| w / total).collect()
}

/// Small blind's value of each class for going all-in against a calling strategy.
fn shove_values(table: &EquityTable, p: &[f64], stack: f64, call: &[f64]) -> Vec<f64> {
    let called: f64 = (0..HAND_CLASS_COUNT).map(|j| p[j] * call[j]).sum();
    (0..HAND_CLASS_COUNT)
        .map(|i| {
            let showdown: f64 = (0..HAND_CLASS_COUNT).map(|j| p[j] * call[j] * (2.0 * table.equity(i, j) - 1.0) * stack).sum();
            (1.0 - called) * BIG_BLIND + showdown
        })
        .collect()
}

/// Big blind's loss of calling and of folding against an all-in strategy, as the small blind's gain
/// summed over the hands it goes all-in with (the reach of the all-in is inside the values).
fn call_costs(table: &EquityTable, p: &[f64], stack: f64, shove: &[f64]) -> (Vec<f64>, f64) {
    let reach: f64 = (0..HAND_CLASS_COUNT).map(|i| p[i] * shove[i]).sum();
    let calling = (0..HAND_CLASS_COUNT)
        .map(|j| (0..HAND_CLASS_COUNT).map(|i| p[i] * shove[i] * (2.0 * table.equity(i, j) - 1.0) * stack).sum())
        .collect();
    (calling, reach * BIG_BLIND)
}

/// Value of the game for the small blind when both play the given strategies.
fn game_value(table: &EquityTable, p: &[f64], stack: f64, shove: &[f64], call: &[f64]) -> f64 {
    let values = shove_values(table, p, stack, call);
    (0..HAND_CLASS_COUNT).map(|i| p[i] * (shove[i] * values[i] - (1.0 - shove[i]) * SMALL_BLIND)).sum()
}

/// Gain of the best responses of both sides over the strategies: zero at the equilibrium.
fn exploitability(table: &EquityTable, p: &[f64], stack: f64, shove: &[f64], call: &[f64]) -> f64 {
    let values = shove_values(table, p, stack, call);
    let sb_best: f64 = (0..HAND_CLASS_COUNT).map(|i| p[i] * values[i].max(-SMALL_BLIND)).sum();
    let (calling, folding) = call_costs(table, p, stack, shove);
    let folded_blinds: f64 = (0..HAND_CLASS_COUNT).map(|i| p[i] * (1.0 - shove[i]) * -SMALL_BLIND).sum();
    // The big blind picks, hand by hand, the answer that costs the small blind least.
    let bb_best: f64 = folded_blinds + (0..HAND_CLASS_COUNT).map(|j| p[j] * calling[j].min(folding)).sum::<f64>();
    sb_best - bb_best
}

/// Strategy proportional to the positive regrets; even odds when there is none.
fn strategy(first: f64, second: f64) -> f64 {
    let total = first + second;
    if total <= 0.0 { 0.5 } else { first / total }
}

/// Solves the game at `stack` big blinds with `iterations` rounds of CFR+ (regrets floored at zero,
/// average strategy weighted by the round).
pub fn solve(table: &EquityTable, stack: f64, iterations: usize) -> PushFold {
    let n = HAND_CLASS_COUNT;
    let p = probabilities(table);
    // Regrets of the two actions of each class: (all-in, fold) and (call, fold).
    let mut sb_regret = vec![(0.0f64, 0.0f64); n];
    let mut bb_regret = vec![(0.0f64, 0.0f64); n];
    let (mut sb_sum, mut bb_sum) = (vec![0.0f64; n], vec![0.0f64; n]);
    let mut weight_total = 0.0;
    let mut shove = vec![0.5f64; n];
    let mut call = vec![0.5f64; n];

    for iteration in 1..=iterations {
        let sb_values = shove_values(table, &p, stack, &call);
        let (calling, folding) = call_costs(table, &p, stack, &shove);

        for i in 0..n {
            let current = shove[i] * sb_values[i] + (1.0 - shove[i]) * -SMALL_BLIND;
            sb_regret[i].0 = (sb_regret[i].0 + sb_values[i] - current).max(0.0);
            sb_regret[i].1 = (sb_regret[i].1 + -SMALL_BLIND - current).max(0.0);
        }
        for j in 0..n {
            // What the big blind earns is what the small blind loses.
            let (call_value, fold_value) = (-calling[j], -folding);
            let current = call[j] * call_value + (1.0 - call[j]) * fold_value;
            bb_regret[j].0 = (bb_regret[j].0 + call_value - current).max(0.0);
            bb_regret[j].1 = (bb_regret[j].1 + fold_value - current).max(0.0);
        }
        for i in 0..n {
            shove[i] = strategy(sb_regret[i].0, sb_regret[i].1);
            call[i] = strategy(bb_regret[i].0, bb_regret[i].1);
        }
        let weight = iteration as f64;
        weight_total += weight;
        for i in 0..n {
            sb_sum[i] += weight * shove[i];
            bb_sum[i] += weight * call[i];
        }
    }
    let shove_avg: Vec<f64> = sb_sum.iter().map(|s| s / weight_total).collect();
    let call_avg: Vec<f64> = bb_sum.iter().map(|s| s / weight_total).collect();
    PushFold {
        stack,
        value: game_value(table, &p, stack, &shove_avg, &call_avg),
        exploitability: exploitability(table, &p, stack, &shove_avg, &call_avg),
        shove: shove_avg,
        call: call_avg,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::OnceLock;

    fn table() -> &'static EquityTable {
        static TABLE: OnceLock<EquityTable> = OnceLock::new();
        TABLE.get_or_init(|| EquityTable::compute(60))
    }

    fn index(class: &str) -> usize {
        table().classes.iter().position(|c| c == class).unwrap()
    }

    #[test]
    fn the_solution_cannot_be_exploited_much() {
        for stack in [5.0, 10.0, 15.0] {
            let solved = solve(table(), stack, 800);
            assert!(solved.exploitability < 0.05, "{stack} bb: exploitability {}", solved.exploitability);
        }
    }

    #[test]
    fn it_does_better_than_always_folding_and_than_a_wrong_strategy() {
        let table = table();
        let solved = solve(table, 8.0, 800);
        let p = probabilities(table);
        let never = vec![0.0; HAND_CLASS_COUNT];
        let always = vec![1.0; HAND_CLASS_COUNT];
        // A strategy that always goes all-in against one that always calls is far from the solution.
        assert!(exploitability(table, &p, 8.0, &always, &always) > solved.exploitability * 5.0);
        assert!(exploitability(table, &p, 8.0, &never, &never) > solved.exploitability * 5.0);
    }

    #[test]
    fn short_stacks_shove_wide_and_strong_hands_always_do() {
        let short = solve(table(), 4.0, 800);
        let deep = solve(table(), 15.0, 800);
        let width = |s: &PushFold| s.shove.iter().zip(&table().weights).map(|(f, w)| f * w).sum::<f64>();
        assert!(width(&short) > width(&deep), "a shorter stack shoves wider");
        assert!(deep.shove[index("AA")] > 0.99);
        assert!(deep.shove[index("72o")] < 0.5);
        assert!(deep.call[index("AA")] > 0.99);
    }

    #[test]
    fn the_small_blind_is_not_paid_less_than_folding_every_hand() {
        let solved = solve(table(), 10.0, 800);
        assert!(solved.value > -SMALL_BLIND - 1e-6, "value {}", solved.value);
    }

    #[test]
    fn the_same_run_gives_the_same_strategy() {
        let a = solve(table(), 9.0, 100);
        let b = solve(table(), 9.0, 100);
        assert_eq!(a.shove, b.shove);
    }
}
