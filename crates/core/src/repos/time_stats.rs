//! Reads the hero's tournaments for the time-of-day, weekday and volume statistics.

use std::collections::HashMap;

use chrono::{NaiveDateTime, Utc};
use rusqlite::Connection;
use serde_json::{json, Value};

use super::app_settings;
use super::stats::{non_empty, parse_date_time, resolve_hero, scope, Room, StatsQuery, TournamentFigures};
use crate::engines::time_stats::{compute, TournamentRow, VolumeGoals};
use crate::Result;

const GOALS_KEY: &str = "volume_goals";

/// A tournament being assembled from its hands.
struct Game {
    start: NaiveDateTime,
    end: NaiveDateTime,
    figures: TournamentFigures,
    ev_chips: f64,
    opponents: f64,
    fish: f64,
}

pub fn time_stats(conn: &Connection, q: &StatsQuery) -> Result<Value> {
    let hero = resolve_hero(conn, q.hero_name.as_deref())?;
    let scope = scope(hero.as_deref(), non_empty(&q.date_from), non_empty(&q.date_to), q.buy_in, false, &[]);

    let sql = format!(
        "SELECT h.date_time, h.game_id, h.room, h.buy_in, h.prize_pool, ph.net_profit, h.player_count, h.multiplier, h.position,
                COALESCE(ph.net_won_adjusted, 0),
                (SELECT COUNT(*) FROM player_hands p2 JOIN players pl ON pl.name = p2.player_name
                  WHERE p2.hand_id = h.id AND p2.player_name != ph.player_name AND COALESCE(pl.is_reg, 0) = 1)
         FROM {} {} {}
         ORDER BY h.date_time ASC, h.id ASC",
        scope.hands, scope.join, scope.where_clause
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(&scope.params()[..])?;

    let mut games: HashMap<String, Game> = HashMap::new();
    while let Some(r) = rows.next()? {
        let Some(time) = r.get::<_, Option<String>>(0)?.as_deref().and_then(parse_date_time) else { continue };
        let Some(game_id) = r.get::<_, Option<String>>(1)?.filter(|id| !id.is_empty()) else { continue };
        let player_count = r.get::<_, Option<i32>>(6)?.unwrap_or(3);
        let multiplier = r.get::<_, Option<i32>>(7)?.unwrap_or(0);
        let position = r.get::<_, Option<i32>>(8)?.unwrap_or(0);
        let profit = r.get::<_, Option<f64>>(5)?.unwrap_or(0.0);
        let regs = f64::from(r.get::<_, i32>(10)?);
        let opponents = f64::from((player_count - 1).max(0));

        let game = games.entry(game_id).or_insert_with(|| Game {
            start: time,
            end: time,
            figures: TournamentFigures {
                room: Room::from_name(&r.get::<_, Option<String>>(2).ok().flatten().unwrap_or_default()),
                buy_in: r.get::<_, Option<f64>>(3).ok().flatten().unwrap_or(0.0),
                prize_pool: r.get::<_, Option<f64>>(4).ok().flatten().unwrap_or(0.0),
                multiplier,
                position,
                lowest_player_count: player_count,
                chip_profit: 0.0,
            },
            ev_chips: 0.0,
            opponents: 0.0,
            fish: 0.0,
        });
        game.start = game.start.min(time);
        game.end = game.end.max(time);
        game.figures.multiplier = game.figures.multiplier.max(multiplier);
        game.figures.position = game.figures.position.max(position);
        game.figures.lowest_player_count = game.figures.lowest_player_count.min(player_count);
        game.figures.chip_profit += profit;
        game.ev_chips += r.get::<_, f64>(9)?;
        game.opponents += opponents;
        game.fish += (opponents - regs).max(0.0);
    }

    let tournaments: Vec<TournamentRow> = games
        .into_values()
        .map(|g| TournamentRow {
            start: g.start,
            end: g.end,
            euro: g.figures.euro_profit(),
            ev_chips: g.ev_chips,
            opponents: g.opponents,
            fish_opponents: g.fish,
        })
        .collect();

    let goals = load_goals(conn)?;
    Ok(serde_json::to_value(compute(&tournaments, goals, Utc::now().naive_utc()))?)
}

pub fn load_goals(conn: &Connection) -> Result<VolumeGoals> {
    Ok(app_settings::get(conn, GOALS_KEY)?.and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default())
}

/// The goals as saved, for the settings screen.
pub fn goals_json(conn: &Connection) -> Result<Value> {
    let goals = load_goals(conn)?;
    Ok(json!({ "weekly": goals.weekly, "monthly": goals.monthly }))
}
