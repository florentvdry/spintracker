//! Pool average of a HUD stat, read from the player's own database, and the colour band a
//! player's value falls in against it.

/// A player counts in the pool average once he has this many hands of the format.
pub const POOL_MIN_HANDS: i64 = 30;
/// At most this many players are read: the most played ones.
pub const POOL_MAX_PLAYERS: i64 = 300;
/// Distance, in percentage points, from the pool average that still counts as "within".
pub const DEFAULT_BAND_POINTS: f64 = 5.0;

/// Where a value sits against the pool average.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Band {
    Below,
    Within,
    Above,
}

/// Percentage of `num` over `den`, pooled over every player counted (not an average of averages).
/// None when nothing was counted.
pub fn pooled_percent(num: u64, den: u64) -> Option<f64> {
    (den > 0).then(|| num as f64 * 100.0 / den as f64)
}

/// `Above` or `Below` once the value is further than `threshold` points from the pool average.
pub fn band(value: f64, pool: f64, threshold: f64) -> Band {
    if value > pool + threshold {
        Band::Above
    } else if value < pool - threshold {
        Band::Below
    } else {
        Band::Within
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pooled_percent_weighs_every_hand_not_every_player() {
        // Player A: 1 of 1 (100 %). Player B: 1 of 9 (11 %). Pooled: 2 of 10 = 20 %.
        assert!((pooled_percent(1 + 1, 1 + 9).unwrap() - 20.0).abs() < 1e-9);
        assert_eq!(pooled_percent(0, 0), None);
    }

    #[test]
    fn band_separates_below_within_and_above() {
        assert_eq!(band(30.0, 20.0, DEFAULT_BAND_POINTS), Band::Above);
        assert_eq!(band(10.0, 20.0, DEFAULT_BAND_POINTS), Band::Below);
        assert_eq!(band(24.0, 20.0, DEFAULT_BAND_POINTS), Band::Within);
        // Exactly on the threshold is still within.
        assert_eq!(band(25.0, 20.0, DEFAULT_BAND_POINTS), Band::Within);
    }
}
