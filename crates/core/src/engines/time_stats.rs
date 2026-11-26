//! Results and volume by time of day and day of week, profit per hour and volume goals.
//!
//! Pure computation over the hero's tournaments; `repos::time_stats` feeds it.

use std::collections::BTreeMap;

use chrono::{Datelike, NaiveDate, NaiveDateTime, Timelike};
use serde::{Deserialize, Serialize};


/// A pause longer than this starts a new session.
pub(crate) const SESSION_GAP_HOURS: f64 = 2.0;
const MINUTES_PER_HOUR: f64 = 60.0;
const SECONDS_PER_HOUR: f64 = 3600.0;
const HOURS_PER_DAY: usize = 24;

/// One tournament of the hero.
#[derive(Debug, Clone)]
pub struct TournamentRow {
    pub start: NaiveDateTime,
    pub end: NaiveDateTime,
    pub euro: f64,
    pub ev_chips: f64,
    /// Opponents faced over the tournament's hands, and how many of them were not regulars.
    pub opponents: f64,
    pub fish_opponents: f64,
}

/// Weekly and monthly tournament targets; 0 means no goal.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct VolumeGoals {
    pub weekly: u32,
    pub monthly: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Cell {
    /// 0 = Monday.
    pub weekday: u32,
    pub hour: u32,
    pub tournaments: i64,
    pub euro: f64,
    pub ev_chips: f64,
    /// Share of the opponents who were not regulars, `None` without opponent data.
    pub fish_share: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct GoalProgress {
    pub target: u32,
    pub done: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct TimeStats {
    pub tournaments: i64,
    pub cells: Vec<Cell>,
    pub by_hour: Vec<i64>,
    pub hours_played: f64,
    pub profit_per_hour: f64,
    pub avg_duration_minutes: f64,
    pub week: Option<GoalProgress>,
    pub month: Option<GoalProgress>,
}

#[derive(Default)]
struct CellTotals {
    tournaments: i64,
    euro: f64,
    ev_chips: f64,
    opponents: f64,
    fish: f64,
}

/// Hours of play: sessions are the tournaments chained with less than the session gap between
/// them, so tables played in parallel are counted once.
pub fn hours_played(rows: &[TournamentRow]) -> f64 {
    let mut spans: Vec<(NaiveDateTime, NaiveDateTime)> = rows.iter().map(|r| (r.start, r.end.max(r.start))).collect();
    spans.sort();
    let mut total_seconds = 0.0;
    let mut current: Option<(NaiveDateTime, NaiveDateTime)> = None;
    for (start, end) in spans {
        current = match current {
            Some((s, e)) if (start - e).num_seconds() as f64 / SECONDS_PER_HOUR <= SESSION_GAP_HOURS => Some((s, e.max(end))),
            Some((s, e)) => {
                total_seconds += (e - s).num_seconds() as f64;
                Some((start, end))
            }
            None => Some((start, end)),
        };
    }
    if let Some((s, e)) = current {
        total_seconds += (e - s).num_seconds() as f64;
    }
    total_seconds / SECONDS_PER_HOUR
}

fn start_of_week(day: NaiveDate) -> NaiveDate {
    day - chrono::Duration::days(i64::from(day.weekday().num_days_from_monday()))
}

pub fn compute(rows: &[TournamentRow], goals: VolumeGoals, now: NaiveDateTime) -> TimeStats {
    let mut cells: BTreeMap<(u32, u32), CellTotals> = BTreeMap::new();
    let mut by_hour = vec![0i64; HOURS_PER_DAY];
    let (mut total_euro, mut total_minutes) = (0.0, 0.0);
    let (mut week, mut month) = (0i64, 0i64);

    let this_week = start_of_week(now.date());
    for row in rows {
        let key = (row.start.weekday().num_days_from_monday(), row.start.hour());
        let cell = cells.entry(key).or_default();
        cell.tournaments += 1;
        cell.euro += row.euro;
        cell.ev_chips += row.ev_chips;
        cell.opponents += row.opponents;
        cell.fish += row.fish_opponents;
        by_hour[row.start.hour() as usize] += 1;
        total_euro += row.euro;
        total_minutes += (row.end - row.start).num_seconds().max(0) as f64 / MINUTES_PER_HOUR;
        if start_of_week(row.start.date()) == this_week {
            week += 1;
        }
        if row.start.year() == now.year() && row.start.month() == now.month() {
            month += 1;
        }
    }

    let hours = hours_played(rows);
    let count = rows.len() as i64;
    TimeStats {
        tournaments: count,
        cells: cells
            .into_iter()
            .map(|((weekday, hour), c)| Cell {
                weekday,
                hour,
                tournaments: c.tournaments,
                euro: c.euro,
                ev_chips: c.ev_chips,
                fish_share: (c.opponents > 0.0).then(|| c.fish / c.opponents),
            })
            .collect(),
        by_hour,
        hours_played: hours,
        profit_per_hour: if hours > 0.0 { total_euro / hours } else { 0.0 },
        avg_duration_minutes: if count > 0 { total_minutes / count as f64 } else { 0.0 },
        week: (goals.weekly > 0).then_some(GoalProgress { target: goals.weekly, done: week }),
        month: (goals.monthly > 0).then_some(GoalProgress { target: goals.monthly, done: month }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(day: u32, hour: u32, minute: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 11, day).unwrap().and_hms_opt(hour, minute, 0).unwrap()
    }

    fn row(start: NaiveDateTime, minutes: i64, euro: f64) -> TournamentRow {
        TournamentRow { start, end: start + chrono::Duration::minutes(minutes), euro, ev_chips: 10.0, opponents: 2.0, fish_opponents: 1.0 }
    }

    #[test]
    fn results_are_grouped_by_weekday_and_start_hour() {
        // 2026-11-02 is a Monday.
        let rows = [row(at(2, 21, 5), 8, 2.0), row(at(2, 21, 40), 8, -1.0), row(at(3, 9, 0), 8, 5.0)];
        let stats = compute(&rows, VolumeGoals::default(), at(4, 12, 0));
        assert_eq!(stats.cells.len(), 2);
        let monday_evening = &stats.cells[0];
        assert_eq!((monday_evening.weekday, monday_evening.hour, monday_evening.tournaments), (0, 21, 2));
        assert_eq!(monday_evening.euro, 1.0);
        assert_eq!(monday_evening.fish_share, Some(0.5));
        assert_eq!(stats.by_hour[21], 2);
        assert_eq!(stats.by_hour[9], 1);
    }

    #[test]
    fn parallel_tables_are_not_counted_twice_in_the_hours_played() {
        // Two overlapping 10-minute tournaments, then a break of five hours and one more.
        let rows = [row(at(2, 20, 0), 10, 0.0), row(at(2, 20, 5), 10, 0.0), row(at(3, 2, 0), 10, 0.0)];
        let hours = hours_played(&rows);
        assert!((hours - (15.0 + 10.0) / 60.0).abs() < 1e-9, "got {hours}");
    }

    #[test]
    fn profit_per_hour_and_average_duration() {
        let rows = [row(at(2, 20, 0), 30, 3.0), row(at(2, 20, 40), 30, 3.0)];
        let stats = compute(&rows, VolumeGoals::default(), at(2, 23, 0));
        // One 70 minute session for 6 euros.
        assert!((stats.profit_per_hour - 6.0 / (70.0 / 60.0)).abs() < 1e-9);
        assert!((stats.avg_duration_minutes - 30.0).abs() < 1e-9);
    }

    #[test]
    fn goals_count_the_current_week_and_month_only() {
        let rows = [row(at(2, 10, 0), 5, 0.0), row(at(5, 10, 0), 5, 0.0), row(at(1, 10, 0), 5, 0.0)];
        let goals = VolumeGoals { weekly: 50, monthly: 0 };
        // Thursday 5 November: the week started on Monday the 2nd, so Sunday the 1st is the previous week.
        let stats = compute(&rows, goals, at(5, 18, 0));
        assert_eq!(stats.week, Some(GoalProgress { target: 50, done: 2 }));
        assert_eq!(stats.month, None);
        let monthly = compute(&rows, VolumeGoals { weekly: 0, monthly: 100 }, at(5, 18, 0));
        assert_eq!(monthly.month, Some(GoalProgress { target: 100, done: 3 }));
    }

    #[test]
    fn no_tournament_gives_empty_figures() {
        let stats = compute(&[], VolumeGoals::default(), at(5, 18, 0));
        assert_eq!(stats.tournaments, 0);
        assert_eq!(stats.profit_per_hour, 0.0);
        assert!(stats.cells.is_empty());
    }
}
