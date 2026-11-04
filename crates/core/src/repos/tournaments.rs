//! The tournaments list: one row per tournament with its euro result.

use chrono::NaiveDateTime;
use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, ToSql};
use serde::Serialize;

use super::hands_query::{hero_join, hero_resolution_sql, HandsQuery};
use super::stats::{Room, TournamentFigures};
use crate::Result;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TournamentSummary {
    pub game_id: String,
    pub room: String,
    /// Start of the tournament, ISO 8601 without a zone (`0001-01-01T00:00:00` when unreadable).
    pub date_time: String,
    pub buy_in: f64,
    pub prize_pool: f64,
    pub multiplier: i32,
    pub position: i32,
    pub net_profit: f64,
    pub chip_profit: f64,
    pub avg_cev: f64,
    pub hand_count: i64,
    #[serde(skip)]
    sort_time: NaiveDateTime,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TournamentsResult {
    pub tournaments: Vec<TournamentSummary>,
    pub total: usize,
    pub page: i64,
    pub limit: i64,
    pub pages: i64,
}

const ISO: &str = "%Y-%m-%dT%H:%M:%S";

fn parse_start(raw: &str) -> NaiveDateTime {
    ["%Y-%m-%d %H:%M:%S", ISO]
        .iter()
        .find_map(|f| NaiveDateTime::parse_from_str(raw.trim(), f).ok())
        .unwrap_or(NaiveDateTime::MIN.max(chrono::NaiveDate::from_ymd_opt(1, 1, 1).unwrap().and_hms_opt(0, 0, 0).unwrap()))
}

pub fn get_tournaments(conn: &Connection, q: &HandsQuery) -> Result<TournamentsResult> {
    let mut clauses = vec!["h.player_count <= 3".to_string()];
    let mut binds: Vec<(&'static str, SqlValue)> = Vec::new();
    let hero = q.hero_name.as_deref().filter(|h| !h.is_empty());
    if let Some(name) = hero {
        clauses.push(format!(
            "EXISTS (SELECT 1 FROM player_hands ph WHERE ph.hand_id = h.id AND ph.player_name IN {})",
            hero_resolution_sql("@heroName")
        ));
        binds.push(("@heroName", SqlValue::Text(name.into())));
    }
    if let Some(d) = q.date_from.as_deref().filter(|d| !d.is_empty()) {
        clauses.push("h.date_time >= @dateFrom".into());
        let d = if d.contains(' ') { d.to_string() } else { format!("{d} 00:00:00") };
        binds.push(("@dateFrom", SqlValue::Text(d)));
    }
    if let Some(d) = q.date_to.as_deref().filter(|d| !d.is_empty()) {
        clauses.push("h.date_time <= @dateTo".into());
        let d = if d.contains(' ') { d.to_string() } else { format!("{d} 23:59:59") };
        binds.push(("@dateTo", SqlValue::Text(d)));
    }

    let sql = format!(
        "SELECT h.game_id, h.room, MIN(h.date_time) as start_time, h.buy_in, h.prize_pool, COUNT(*) as hand_count,
                SUM(ph.net_profit) as chip_profit, AVG(ph.ev_chips) as avg_cev, MIN(h.player_count) as lowest_players,
                MAX(h.multiplier) as multiplier, MAX(h.position) as position
         FROM hands h
         {}
         WHERE {}
         GROUP BY h.game_id",
        hero_join(hero),
        clauses.join(" AND ")
    );
    let params: Vec<(&str, &dyn ToSql)> = binds.iter().map(|(n, v)| (*n, v as &dyn ToSql)).collect();
    let mut stmt = conn.prepare(&sql)?;
    let mut all: Vec<TournamentSummary> = stmt
        .query_map(&params[..], |r| {
            let start = parse_start(&r.get::<_, String>(2)?);
            let buy_in = r.get::<_, Option<f64>>(3)?.unwrap_or(0.0);
            let prize_pool = r.get::<_, Option<f64>>(4)?.unwrap_or(0.0);
            let chip_profit = r.get::<_, Option<f64>>(6)?.unwrap_or(0.0);
            let multiplier = r.get::<_, Option<i32>>(9)?.unwrap_or(0);
            let position = r.get::<_, Option<i32>>(10)?.unwrap_or(0);
            let net_profit = TournamentFigures {
                room: Room::from_name(&r.get::<_, Option<String>>(1)?.unwrap_or_default()),
                buy_in,
                prize_pool,
                multiplier,
                position,
                lowest_player_count: r.get::<_, Option<i32>>(8)?.unwrap_or(3),
                chip_profit,
            }
            .euro_profit();
            Ok(TournamentSummary {
                game_id: r.get(0)?,
                room: r.get::<_, Option<String>>(1)?.unwrap_or_else(|| "Unknown".into()),
                date_time: start.format(ISO).to_string(),
                buy_in,
                prize_pool,
                multiplier,
                position,
                net_profit,
                chip_profit,
                avg_cev: r.get::<_, Option<f64>>(7)?.unwrap_or(0.0),
                hand_count: r.get(5)?,
                sort_time: start,
            })
        })?
        .collect::<std::result::Result<_, _>>()?;

    match q.result.as_deref().map(str::to_lowercase).as_deref() {
        Some("won") => all.retain(|t| t.net_profit > 0.0),
        Some("lost") => all.retain(|t| t.net_profit <= 0.0),
        _ => {}
    }
    let total = all.len();

    // Stable sorts, as the former LINQ ordering.
    let float = |a: f64, b: f64| a.total_cmp(&b);
    match q.sort_by.as_deref().map(str::to_lowercase).as_deref() {
        Some("date_asc") => all.sort_by(|a, b| a.sort_time.cmp(&b.sort_time)),
        Some("room_asc") => all.sort_by(|a, b| a.room.cmp(&b.room)),
        Some("room_desc") => all.sort_by(|a, b| b.room.cmp(&a.room)),
        Some("buyin_asc") => all.sort_by(|a, b| float(a.buy_in, b.buy_in)),
        Some("buyin_desc") => all.sort_by(|a, b| float(b.buy_in, a.buy_in)),
        Some("hands_asc") => all.sort_by(|a, b| a.hand_count.cmp(&b.hand_count)),
        Some("hands_desc") => all.sort_by(|a, b| b.hand_count.cmp(&a.hand_count)),
        Some("profit_asc") => all.sort_by(|a, b| float(a.net_profit, b.net_profit)),
        Some("profit_desc") => all.sort_by(|a, b| float(b.net_profit, a.net_profit)),
        Some("cev_asc") => all.sort_by(|a, b| float(a.avg_cev, b.avg_cev)),
        Some("cev_desc") => all.sort_by(|a, b| float(b.avg_cev, a.avg_cev)),
        _ => all.sort_by(|a, b| b.sort_time.cmp(&a.sort_time)),
    }

    let page = q.page.max(1);
    let limit = if q.limit < 1 { 50 } else { q.limit };
    let tournaments = all.into_iter().skip(((page - 1) * limit) as usize).take(limit as usize).collect();
    Ok(TournamentsResult { tournaments, total, page, limit, pages: (total as f64 / limit as f64).ceil() as i64 })
}
