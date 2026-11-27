//! Expected value of an all-in: what the chips put in are worth at the equity the player had.

/// Expected result of an all-in, in big blinds: the share of the pot the equity gives, minus what
/// was put in. None when an input cannot be real (no big blind, equity outside 0 to 100).
pub fn all_in_ev_bb(equity_percent: f64, pot: f64, invested: f64, big_blind: f64) -> Option<f64> {
    if big_blind <= 0.0 || !(0.0..=100.0).contains(&equity_percent) || pot < 0.0 || invested < 0.0 {
        return None;
    }
    let expected_chips = equity_percent / 100.0 * pot - invested;
    Some(expected_chips / big_blind)
}

/// The equity to judge an all-in with: the one of the street where the chips went in, else the
/// latest street that has a value.
pub fn all_in_equity(preflop: Option<f64>, flop: Option<f64>, turn: Option<f64>, river: Option<f64>, street: &str) -> Option<f64> {
    let by_street = match street.to_ascii_lowercase().as_str() {
        "preflop" => preflop,
        "flop" => flop,
        "turn" => turn,
        "river" => river,
        _ => None,
    };
    by_street.or(river).or(turn).or(flop).or(preflop)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn even_equity_on_an_even_pot_is_a_break_even_all_in() {
        assert!((all_in_ev_bb(50.0, 100.0, 50.0, 10.0).unwrap()).abs() < 1e-9);
    }

    #[test]
    fn favourite_gains_the_share_above_what_it_paid() {
        // 75 % of a 100-chip pot is 75, minus 50 paid: +25 chips, +2.5 bb at a 10-chip big blind.
        assert!((all_in_ev_bb(75.0, 100.0, 50.0, 10.0).unwrap() - 2.5).abs() < 1e-9);
    }

    #[test]
    fn impossible_inputs_give_no_value() {
        assert_eq!(all_in_ev_bb(50.0, 100.0, 50.0, 0.0), None);
        assert_eq!(all_in_ev_bb(120.0, 100.0, 50.0, 10.0), None);
        assert_eq!(all_in_ev_bb(50.0, -1.0, 50.0, 10.0), None);
    }

    #[test]
    fn equity_is_taken_from_the_street_of_the_all_in_then_the_latest_known() {
        assert_eq!(all_in_equity(Some(40.0), Some(55.0), None, Some(60.0), "flop"), Some(55.0));
        assert_eq!(all_in_equity(Some(40.0), None, None, None, "Preflop"), Some(40.0));
        assert_eq!(all_in_equity(Some(40.0), Some(55.0), None, None, "unknown"), Some(55.0));
        assert_eq!(all_in_equity(None, None, None, None, "river"), None);
    }
}
