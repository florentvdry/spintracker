//! PoolEV: the euro value of a tournament's chip EV when the prize pool is replaced by its
//! expected value.
//!
//! The actual prize pool is drawn before the cards, so a x1000 jackpot hides the skill of the
//! tournament it lands on. PoolEV takes the mean of the room's multiplier distribution instead:
//! the hero wins with the probability the chip EV gives and is then paid `buy-in x mean`.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// Chips each player starts a Spin with, and the number of players.
pub const STARTING_STACK_CHIPS: f64 = 500.0;
pub const PLAYERS_PER_SPIN: f64 = 3.0;

/// Probability of finishing first for a given chip EV (the share of the chips in play).
pub fn first_place_probability(chip_ev: f64) -> f64 {
    ((STARTING_STACK_CHIPS + chip_ev) / (STARTING_STACK_CHIPS * PLAYERS_PER_SPIN)).clamp(0.0, 1.0)
}

/// One line of a multiplier distribution; the weights need not sum to 100.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MultiplierWeight {
    pub multiplier: f64,
    pub weight: f64,
}

/// Mean multiplier of a distribution, `None` when it has no usable line.
pub fn mean_multiplier(rows: &[MultiplierWeight]) -> Option<f64> {
    let usable = rows.iter().filter(|r| r.multiplier > 0.0 && r.weight > 0.0);
    let (weighted, total) = usable.fold((0.0, 0.0), |(w, t), r| (w + r.multiplier * r.weight, t + r.weight));
    (total > 0.0).then(|| weighted / total)
}

/// Expected profit in euros of a tournament with `chip_ev` chips of EV.
pub fn pool_ev_profit(chip_ev: f64, cost: f64, mean_multiplier: f64) -> f64 {
    first_place_probability(chip_ev) * cost * mean_multiplier - cost
}

/// Multiplier tables by room (`"winamax"`) with optional per buy-in overrides (`"winamax:5"`).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct PoolEvTables {
    means: HashMap<String, f64>,
}

impl PoolEvTables {
    /// Reads the stored settings: `{ "winamax": [{multiplier, weight}], "winamax:5": [...] }`.
    pub fn from_json(value: &serde_json::Value) -> Self {
        let Some(map) = value.as_object() else { return Self::default() };
        let means = map
            .iter()
            .filter_map(|(key, rows)| {
                let rows: Vec<MultiplierWeight> = serde_json::from_value(rows.clone()).ok()?;
                Some((key.to_ascii_lowercase(), mean_multiplier(&rows)?))
            })
            .collect();
        Self { means }
    }

    /// The mean for this room and buy-in: the buy-in override first, then the room's table.
    pub fn mean_for(&self, room: &str, buy_in: f64) -> Option<f64> {
        let room = room.to_ascii_lowercase();
        self.means.get(&format!("{room}:{}", format_buy_in(buy_in))).or_else(|| self.means.get(&room)).copied()
    }

    pub fn is_empty(&self) -> bool {
        self.means.is_empty()
    }
}

/// `5.0` -> `"5"`, `0.25` -> `"0.25"`: the form the settings keys use.
fn format_buy_in(buy_in: f64) -> String {
    let text = format!("{buy_in:.2}");
    text.trim_end_matches('0').trim_end_matches('.').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn rows(pairs: &[(f64, f64)]) -> Vec<MultiplierWeight> {
        pairs.iter().map(|&(multiplier, weight)| MultiplierWeight { multiplier, weight }).collect()
    }

    #[test]
    fn the_mean_weights_each_multiplier_and_ignores_the_weight_scale() {
        assert_eq!(mean_multiplier(&rows(&[(2.0, 50.0), (4.0, 50.0)])), Some(3.0));
        assert_eq!(mean_multiplier(&rows(&[(2.0, 1.0), (4.0, 1.0)])), Some(3.0));
        assert_eq!(mean_multiplier(&[]), None);
        assert_eq!(mean_multiplier(&rows(&[(2.0, 0.0)])), None);
    }

    #[test]
    fn a_break_even_chip_ev_returns_the_mean_over_three_minus_one() {
        // First place one time in three, paid 2.79 x: 0.93 of the buy-in comes back.
        let profit = pool_ev_profit(0.0, 1.0, 2.79);
        assert!((profit - (-0.07)).abs() < 1e-9);
    }

    #[test]
    fn chip_ev_moves_the_win_probability_and_is_clamped() {
        assert!(pool_ev_profit(100.0, 5.0, 2.79) > pool_ev_profit(0.0, 5.0, 2.79));
        assert_eq!(first_place_probability(10_000.0), 1.0);
        assert_eq!(first_place_probability(-10_000.0), 0.0);
    }

    #[test]
    fn a_buy_in_override_wins_over_the_room_table() {
        let tables = PoolEvTables::from_json(&json!({
            "Winamax": [{ "multiplier": 2, "weight": 1 }, { "multiplier": 4, "weight": 1 }],
            "winamax:5": [{ "multiplier": 10, "weight": 1 }],
        }));
        assert_eq!(tables.mean_for("winamax", 1.0), Some(3.0));
        assert_eq!(tables.mean_for("WINAMAX", 5.0), Some(10.0));
        assert_eq!(tables.mean_for("unibet", 1.0), None);
    }

    #[test]
    fn invalid_settings_give_empty_tables() {
        assert!(PoolEvTables::from_json(&json!("nope")).is_empty());
        assert!(PoolEvTables::from_json(&json!({ "winamax": "bad" })).is_empty());
    }

    #[test]
    fn buy_in_keys_drop_trailing_zeros() {
        assert_eq!(format_buy_in(5.0), "5");
        assert_eq!(format_buy_in(0.25), "0.25");
        assert_eq!(format_buy_in(2.5), "2.5");
    }
}
