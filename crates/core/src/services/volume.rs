//! Volume of play and goals: the summary for the dashboard, and the goal settings.

use chrono::{Local, NaiveDate};
use rusqlite::Connection;
use serde_json::{json, Value};

use crate::engines::volume::{goal_progress, period_start, volume, GoalPeriod};
use crate::error::Error;
use crate::repos::volume::{self as repo, VolumeScope};
use crate::Result;

/// Targets are counts of tournaments; a month cannot reasonably hold more than this.
const MAX_TARGET: i64 = 100_000;

pub fn summary(conn: &Connection, scope: &VolumeScope) -> Result<Value> {
    let spans = repo::spans(conn, scope)?;
    let today = Local::now().date_naive();

    // Goals count the hero's tournaments from the start of the current period, whatever the filters.
    let goals = repo::goals(conn)?;
    let earliest = earliest_period_start(&goals, today);
    let earliest_text = earliest.map(|d| d.format("%Y-%m-%d").to_string());
    let goal_scope = VolumeScope { hero_name: scope.hero_name, date_from: earliest_text.as_deref(), date_to: None, buy_in: None };
    let goal_starts: Vec<_> = repo::spans(conn, &goal_scope)?.iter().map(|s| s.start).collect();
    let goal_rows: Vec<Value> = goals
        .into_iter()
        .map(|(period, target)| serde_json::to_value(goal_progress(period, target, &goal_starts, today)))
        .collect::<std::result::Result<_, _>>()?;

    Ok(json!({ "volume": volume(&spans), "goals": goal_rows }))
}

/// Earliest first day among the periods that have a goal, so only that much history is read.
fn earliest_period_start(goals: &[(GoalPeriod, i64)], today: NaiveDate) -> Option<NaiveDate> {
    goals.iter().map(|(period, _)| period_start(*period, today)).min()
}

/// Sets a goal, or removes it when the target is missing.
pub fn save_goal(conn: &Connection, period: &str, target: Option<i64>) -> Result<()> {
    let period = GoalPeriod::parse(period).ok_or_else(|| Error::Message(format!("unknown goal period: {period}")))?;
    match target {
        None => repo::delete_goal(conn, period),
        Some(target) if (1..=MAX_TARGET).contains(&target) => repo::set_goal(conn, period, target),
        Some(_) => Err(Error::Message(format!("goal target must be between 1 and {MAX_TARGET}"))),
    }
}
