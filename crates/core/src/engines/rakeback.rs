//! Rakeback: the share of the rake a room gives back to the player.

use std::collections::HashMap;

/// Share of the buy-in the room keeps as rake (the published prize tables return 93% of the buy-ins).
pub const RAKE_SHARE: f64 = 0.07;

/// Rakeback percentages by room key, as saved in the settings (`{ "winamax": 30 }`).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RakebackRates {
    percent: HashMap<String, f64>,
}

impl RakebackRates {
    pub fn from_json(value: &serde_json::Value) -> Self {
        let Some(map) = value.as_object() else { return Self::default() };
        let percent = map
            .iter()
            .filter_map(|(room, pct)| Some((room.to_ascii_lowercase(), pct.as_f64()?)))
            .filter(|(_, pct)| *pct > 0.0 && *pct <= 100.0)
            .collect();
        Self { percent }
    }

    /// Euros given back for a tournament of this room and buy-in.
    pub fn amount(&self, room: &str, buy_in: f64) -> f64 {
        self.percent.get(&room.to_ascii_lowercase()).map_or(0.0, |pct| buy_in * RAKE_SHARE * pct / 100.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rakeback_is_a_percentage_of_the_rake_and_ignores_invalid_rates() {
        let rates = RakebackRates::from_json(&json!({ "Winamax": 30, "betclic": -5, "unibet": 400, "x": "a" }));
        assert!((rates.amount("winamax", 10.0) - 0.21).abs() < 1e-9);
        assert_eq!(rates.amount("betclic", 10.0), 0.0);
        assert_eq!(rates.amount("unibet", 10.0), 0.0);
    }
}
