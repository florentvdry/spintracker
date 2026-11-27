//! Results and table soft-ness by weekday and hour: a 7 x 24 grid, Monday first.

use chrono::{Datelike, NaiveDateTime, Timelike};
use serde::Serialize;

pub const WEEKDAYS: usize = 7;
pub const HOURS: usize = 24;

/// A tournament reduced to what the hourly view needs.
#[derive(Debug, Clone, PartialEq)]
pub struct TournamentSample {
    /// Start of the tournament (first hand).
    pub start: NaiveDateTime,
    /// Result in euros; 0 when the prize is unknown.
    pub euro_profit: f64,
}

/// One hand, with the opponents seen at its table.
#[derive(Debug, Clone, PartialEq)]
pub struct HandSample {
    pub time: NaiveDateTime,
    pub opponents: i64,
    pub regs: i64,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
pub struct ResultCell {
    pub tournaments: i64,
    pub profit: f64,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
pub struct FishCell {
    pub opponents: i64,
    pub fish: i64,
}

/// Monday = 0 ... Sunday = 6.
fn weekday_index(time: NaiveDateTime) -> usize {
    time.weekday().num_days_from_monday() as usize
}

fn hour_index(time: NaiveDateTime) -> usize {
    time.hour() as usize
}

/// Grid `[weekday][hour]` of tournament counts and euro results, by start time.
pub fn result_grid(samples: &[TournamentSample]) -> Vec<Vec<ResultCell>> {
    let mut grid = vec![vec![ResultCell::default(); HOURS]; WEEKDAYS];
    for sample in samples {
        let cell = &mut grid[weekday_index(sample.start)][hour_index(sample.start)];
        cell.tournaments += 1;
        cell.profit += sample.euro_profit;
    }
    grid
}

/// Euro results summed over the weekdays, for each hour of the day.
pub fn profit_by_hour(grid: &[Vec<ResultCell>]) -> Vec<ResultCell> {
    (0..HOURS)
        .map(|hour| {
            grid.iter().fold(ResultCell::default(), |mut acc, day| {
                acc.tournaments += day[hour].tournaments;
                acc.profit += day[hour].profit;
                acc
            })
        })
        .collect()
}

/// Opponents seen and how many of them were fish, for each weekday and hour.
pub fn fish_grid(hands: &[HandSample]) -> Vec<Vec<FishCell>> {
    let mut grid = vec![vec![FishCell::default(); HOURS]; WEEKDAYS];
    for hand in hands {
        let cell = &mut grid[weekday_index(hand.time)][hour_index(hand.time)];
        cell.opponents += hand.opponents;
        cell.fish += (hand.opponents - hand.regs).max(0);
    }
    grid
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn at(day: u32, hour: u32) -> NaiveDateTime {
        // 2026-01-05 is a Monday.
        NaiveDate::from_ymd_opt(2026, 1, 5 + day).unwrap().and_hms_opt(hour, 0, 0).unwrap()
    }

    #[test]
    fn grid_places_tournaments_by_weekday_and_hour() {
        let samples = vec![
            TournamentSample { start: at(0, 9), euro_profit: 5.0 },
            TournamentSample { start: at(0, 9), euro_profit: -2.0 },
            TournamentSample { start: at(6, 23), euro_profit: 1.0 },
        ];
        let grid = result_grid(&samples);
        assert_eq!(grid[0][9], ResultCell { tournaments: 2, profit: 3.0 });
        assert_eq!(grid[6][23], ResultCell { tournaments: 1, profit: 1.0 });
        assert_eq!(grid[3][3], ResultCell::default());
    }

    #[test]
    fn profit_by_hour_sums_every_weekday() {
        let samples = vec![
            TournamentSample { start: at(0, 9), euro_profit: 5.0 },
            TournamentSample { start: at(2, 9), euro_profit: 4.0 },
        ];
        let by_hour = profit_by_hour(&result_grid(&samples));
        assert_eq!(by_hour[9], ResultCell { tournaments: 2, profit: 9.0 });
        assert_eq!(by_hour.len(), HOURS);
    }

    #[test]
    fn fish_grid_counts_opponents_that_are_not_regulars() {
        let hands = vec![
            HandSample { time: at(1, 20), opponents: 2, regs: 1 },
            HandSample { time: at(1, 20), opponents: 2, regs: 0 },
        ];
        let grid = fish_grid(&hands);
        assert_eq!(grid[1][20], FishCell { opponents: 4, fish: 3 });
    }
}
