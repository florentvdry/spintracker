//! Reads the hero's hands for the chip EV breakdowns (composition, multiplier, session, bad beat).

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::stats::{non_empty, parse_date_time, resolve_hero, scope, StatsQuery};
use crate::engines::cev_breakdown::{compute, BadBeatParams, HandRow};
use crate::Result;

/// Filters of the stats plus the bad beat definition.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BreakdownQuery {
    #[serde(flatten)]
    pub stats: StatsQuery,
    #[serde(flatten)]
    pub bad_beat: BadBeatParams,
}

pub fn cev_breakdown(conn: &Connection, q: &BreakdownQuery) -> Result<Value> {
    let hero = resolve_hero(conn, q.stats.hero_name.as_deref())?;
    let scope = scope(hero.as_deref(), non_empty(&q.stats.date_from), non_empty(&q.stats.date_to), q.stats.buy_in, false, &[]);

    // The regular count is a per-hand lookup on the hand index: at most three rows each.
    let sql = format!(
        "SELECT h.date_time, h.game_id, h.multiplier, h.player_count,
                COALESCE(ph.net_won_adjusted, 0), COALESCE(ph.net_profit, 0), COALESCE(ph.is_all_in, 0),
                ph.ev_chips, COALESCE(ph.investment, 0), COALESCE(h.total_pot, 0),
                (SELECT COUNT(*) FROM player_hands p2 JOIN players pl ON pl.name = p2.player_name
                  WHERE p2.hand_id = h.id AND p2.player_name != ph.player_name AND COALESCE(pl.is_reg, 0) = 1)
         FROM {} {} {}
         ORDER BY h.date_time ASC, h.id ASC",
        scope.hands, scope.join, scope.where_clause
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(&scope.params()[..], |r| {
            Ok(HandRow {
                time: r.get::<_, Option<String>>(0)?.as_deref().and_then(parse_date_time),
                game_id: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                multiplier: r.get::<_, Option<i32>>(2)?.unwrap_or(0),
                player_count: r.get::<_, Option<i32>>(3)?.unwrap_or(3),
                ev: r.get(4)?,
                profit: r.get(5)?,
                all_in: r.get::<_, i64>(6)? != 0,
                ev_chips: r.get(7)?,
                investment: r.get(8)?,
                total_pot: r.get(9)?,
                regs: r.get(10)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    let breakdown = compute(&rows, &q.bad_beat);
    Ok(json!({
        "by_composition": breakdown.by_composition,
        "by_multiplier": breakdown.by_multiplier,
        "by_session_progress": breakdown.by_session_progress,
        "after_bad_beat": breakdown.after_bad_beat,
    }))
}
