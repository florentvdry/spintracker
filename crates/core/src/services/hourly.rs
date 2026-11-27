//! Hourly analysis: when the hero wins, and how soft the tables are at each hour.

use rusqlite::Connection;
use serde_json::{json, Value};

use crate::engines::hourly::{fish_grid, profit_by_hour, result_grid};
use crate::repos::hourly::{self as repo, HourlyScope};
use crate::Result;

pub fn analysis(conn: &Connection, scope: &HourlyScope) -> Result<Value> {
    let tournaments = repo::tournaments(conn, scope)?;
    let hands = repo::hands(conn, scope)?;
    let results = result_grid(&tournaments);
    let by_hour = profit_by_hour(&results);
    Ok(json!({
        "results": results,
        "by_hour": by_hour,
        "fish": fish_grid(&hands),
    }))
}
