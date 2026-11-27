//! Volume of play: tournaments per hour, Spin duration, and progress towards weekly or monthly goals.

use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime};
use serde::Serialize;

/// Two tournaments further apart than this belong to different sessions.
pub const SESSION_GAP_MINUTES: i64 = 30;
pub const MINUTES_PER_HOUR: f64 = 60.0;

/// First and last hand of one tournament.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Span {
    pub start: NaiveDateTime,
    pub end: NaiveDateTime,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Volume {
    pub tournaments: usize,
    pub sessions: usize,
    /// Time from the first to the last tournament of each session, in hours.
    pub play_hours: f64,
    pub tournaments_per_hour: f64,
    pub average_duration_minutes: f64,
}

/// Summary of the tournaments, grouped into sessions by inactivity.
pub fn volume(spans: &[Span]) -> Volume {
    let mut sorted = spans.to_vec();
    sorted.sort_by_key(|s| s.start);

    let mut sessions = 0usize;
    let mut play_minutes = 0f64;
    let mut session_start: Option<NaiveDateTime> = None;
    let mut previous_end: Option<NaiveDateTime> = None;
    let mut duration_sum = 0f64;
    for span in &sorted {
        duration_sum += (span.end - span.start).num_seconds().max(0) as f64 / 60.0;
        let new_session = match previous_end {
            None => true,
            Some(end) => span.start - end > Duration::minutes(SESSION_GAP_MINUTES),
        };
        if new_session {
            if let (Some(start), Some(end)) = (session_start, previous_end) {
                play_minutes += (end - start).num_seconds() as f64 / 60.0;
            }
            sessions += 1;
            session_start = Some(span.start);
        }
        previous_end = Some(span.end.max(previous_end.unwrap_or(span.end)));
    }
    if let (Some(start), Some(end)) = (session_start, previous_end) {
        play_minutes += (end - start).num_seconds() as f64 / 60.0;
    }

    let tournaments = sorted.len();
    let play_hours = play_minutes / MINUTES_PER_HOUR;
    Volume {
        tournaments,
        sessions,
        play_hours,
        tournaments_per_hour: if play_hours > 0.0 { tournaments as f64 / play_hours } else { 0.0 },
        average_duration_minutes: if tournaments > 0 { duration_sum / tournaments as f64 } else { 0.0 },
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GoalPeriod {
    Week,
    Month,
}

impl GoalPeriod {
    pub fn parse(raw: &str) -> Option<GoalPeriod> {
        match raw {
            "week" => Some(GoalPeriod::Week),
            "month" => Some(GoalPeriod::Month),
            _ => None,
        }
    }
}

/// First day of the period that contains `day`: Monday for a week, the 1st for a month.
pub fn period_start(period: GoalPeriod, day: NaiveDate) -> NaiveDate {
    match period {
        GoalPeriod::Week => day - Duration::days(day.weekday().num_days_from_monday() as i64),
        GoalPeriod::Month => NaiveDate::from_ymd_opt(day.year(), day.month(), 1).unwrap_or(day),
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct GoalProgress {
    pub period: GoalPeriod,
    pub target: i64,
    pub done: i64,
}

/// Tournaments started in the period that contains `today`, against the target.
pub fn goal_progress(period: GoalPeriod, target: i64, starts: &[NaiveDateTime], today: NaiveDate) -> GoalProgress {
    let from = period_start(period, today);
    let done = starts.iter().filter(|start| start.date() >= from && start.date() <= today).count() as i64;
    GoalProgress { period, target, done }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn at(day: u32, hour: u32, minute: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 1, day).unwrap().and_hms_opt(hour, minute, 0).unwrap()
    }

    fn span(start: NaiveDateTime, minutes: i64) -> Span {
        Span { start, end: start + Duration::minutes(minutes) }
    }

    #[test]
    fn gaps_split_sessions_and_only_play_time_counts() {
        // Two tournaments back to back (10 min each), then a pause of 2 h, then one of 20 min.
        let spans = [span(at(5, 20, 0), 10), span(at(5, 20, 10), 10), span(at(5, 22, 20), 20)];
        let v = volume(&spans);
        assert_eq!(v.tournaments, 3);
        assert_eq!(v.sessions, 2);
        assert!((v.play_hours - (20.0 + 20.0) / 60.0).abs() < 1e-9);
        assert!((v.average_duration_minutes - 40.0 / 3.0).abs() < 1e-9);
        assert!((v.tournaments_per_hour - 3.0 / (40.0 / 60.0)).abs() < 1e-9);
    }

    #[test]
    fn empty_history_gives_zeros() {
        let v = volume(&[]);
        assert_eq!(v.tournaments, 0);
        assert_eq!(v.tournaments_per_hour, 0.0);
        assert_eq!(v.average_duration_minutes, 0.0);
    }

    #[test]
    fn weekly_goal_starts_on_monday() {
        // 2026-01-05 is a Monday; 2026-01-07 is a Wednesday of the same week.
        let today = NaiveDate::from_ymd_opt(2026, 1, 7).unwrap();
        assert_eq!(period_start(GoalPeriod::Week, today), NaiveDate::from_ymd_opt(2026, 1, 5).unwrap());
        let starts = [at(4, 12, 0), at(5, 9, 0), at(7, 9, 0)];
        let p = goal_progress(GoalPeriod::Week, 10, &starts, today);
        assert_eq!(p.done, 2);
    }

    #[test]
    fn monthly_goal_counts_from_the_first_of_the_month() {
        let today = NaiveDate::from_ymd_opt(2026, 1, 20).unwrap();
        let starts = [at(1, 9, 0), at(19, 9, 0)];
        assert_eq!(goal_progress(GoalPeriod::Month, 50, &starts, today).done, 2);
    }

    #[test]
    fn unknown_period_is_rejected() {
        assert_eq!(GoalPeriod::parse("year"), None);
        assert_eq!(GoalPeriod::parse("week"), Some(GoalPeriod::Week));
    }
}
