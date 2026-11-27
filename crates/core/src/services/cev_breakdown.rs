//! Application entry point for the CEV breakdown: validates the request, reads the hero's hands
//! and aggregates them with the pure engine.

use rusqlite::Connection;
use serde_json::Value;

use crate::engines::cev_breakdown::{self as engine, DEFAULT_BAD_BEAT_EQUITY, DEFAULT_BAD_BEAT_WINDOW, MAX_BAD_BEAT_WINDOW};
use crate::repos::cev_breakdown as repo;
use crate::Result;

#[derive(Debug, Clone, Default)]
pub struct BreakdownQuery {
    pub hero_name: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub buy_in: Option<f64>,
    /// Tournaments read after each bad beat.
    pub bad_beat_window: Option<i64>,
    /// Hero equity (percent) that makes a lost all-in a bad beat.
    pub bad_beat_equity: Option<f64>,
}

pub fn breakdown(conn: &Connection, query: &BreakdownQuery) -> Result<Value> {
    let window = query
        .bad_beat_window
        .map(|w| w.clamp(1, MAX_BAD_BEAT_WINDOW as i64) as usize)
        .unwrap_or(DEFAULT_BAD_BEAT_WINDOW);
    let equity = query
        .bad_beat_equity
        .filter(|e| e.is_finite() && (0.0..=100.0).contains(e))
        .unwrap_or(DEFAULT_BAD_BEAT_EQUITY);
    let hands = repo::hero_hands(conn, query.hero_name.as_deref(), query.date_from.as_deref(), query.date_to.as_deref(), query.buy_in)?;
    Ok(serde_json::to_value(engine::compute(&hands, window, equity))?)
}
