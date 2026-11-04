//! Per-hand analytics (all-in EV and the profit split).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HandAnalytics {
    pub hand_id: Option<String>,
    pub player_name: Option<String>,
    /// All-in adjusted result of the hero, in chips.
    pub ev_chips: Option<f64>,
    /// EV when it was computed, the actual profit otherwise.
    pub net_won_adjusted: Option<f64>,
    pub equity_preflop: Option<f64>,
    pub equity_flop: Option<f64>,
    pub equity_turn: Option<f64>,
    pub equity_river: Option<f64>,
    pub chips_won_showdown: Option<f64>,
    pub chips_won_no_showdown: Option<f64>,
    /// EV minus actual profit: the luck of the all-in.
    pub cev_contribution: Option<f64>,
}
