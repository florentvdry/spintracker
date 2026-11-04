//! Dashboard, session, chart and multiplier statistics of the hero.
//!
//! The SQL is the former backend's, statement for statement: SQLite's handling of bare columns
//! in grouped queries is part of the figures, so rewriting a query would change them. What was
//! duplicated three times in C# (the euro result of a tournament) is written once.

use std::collections::{BTreeMap, HashMap};

use chrono::{Datelike, NaiveDate, NaiveDateTime, Utc};
use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, ToSql};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::Result;

/// Players resolved from a name: the player itself, or every player linked to the alias of that name.
fn hero_resolution_sql(param: &str) -> String {
    format!(
        "(SELECT name FROM players WHERE name = {param} UNION SELECT p.name FROM players p JOIN aliases a ON p.alias_id = a.id WHERE a.name = {param})"
    )
}

/// Join selecting the hero's row of each hand; without a hero, the first player with known cards.
fn hero_join(hero: Option<&str>) -> String {
    match hero {
        Some(_) => format!("JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name IN {}", hero_resolution_sql("@heroName")),
        None => "JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = h.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)".to_string(),
    }
}

/// The hero: the name given, or the player with the most hands whose cards are known.
pub fn resolve_hero(conn: &Connection, hero_name: Option<&str>) -> Result<Option<String>> {
    if let Some(name) = hero_name.filter(|n| !n.is_empty()) {
        return Ok(Some(name.to_string()));
    }
    let found = conn
        .query_row(
            "SELECT player_name FROM (
                SELECT ph.player_name, COUNT(*) as cnt
                FROM player_hands ph
                JOIN hands h ON h.id = ph.hand_id
                WHERE ph.cards IS NOT NULL AND ph.cards != ''
                GROUP BY ph.player_name
                ORDER BY cnt DESC
                LIMIT 1
            )",
            [],
            |r| r.get::<_, String>(0),
        )
        .map(Some)
        .or_else(|e| if e == rusqlite::Error::QueryReturnedNoRows { Ok(None) } else { Err(e) })?;
    Ok(found)
}

/// Filters shared by the hero's statistics. JSON uses camelCase, like the former API bodies.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StatsQuery {
    pub hero_name: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub buy_in: Option<f64>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChartQuery {
    pub hero_name: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub buy_in: Option<f64>,
    /// "HU_SB", "3W_BTN"...: table size and seat.
    pub position: Option<String>,
}

/// SQL pieces and bound values of a hero-scoped query.
struct Scope {
    join: String,
    where_clause: String,
    binds: Vec<(&'static str, SqlValue)>,
}

impl Scope {
    fn params(&self) -> Vec<(&str, &dyn ToSql)> {
        self.binds.iter().map(|(name, value)| (*name, value as &dyn ToSql)).collect()
    }
}

fn non_empty(v: &Option<String>) -> Option<&str> {
    v.as_deref().filter(|s| !s.is_empty())
}

/// `date_from` / `date_to` bounds; the charts widen a bare date to the whole day.
fn scope(
    hero: Option<&str>,
    date_from: Option<&str>,
    date_to: Option<&str>,
    buy_in: Option<f64>,
    whole_days: bool,
    extra: &[&str],
) -> Scope {
    let mut clauses = vec!["h.player_count <= 3".to_string()];
    let mut binds: Vec<(&'static str, SqlValue)> = Vec::new();
    if let Some(h) = hero {
        binds.push(("@heroName", SqlValue::Text(h.to_string())));
    }
    if let Some(d) = date_from {
        clauses.push("h.date_time >= @dateFrom".into());
        let d = if whole_days && !d.contains(' ') { format!("{d} 00:00:00") } else { d.to_string() };
        binds.push(("@dateFrom", SqlValue::Text(d)));
    }
    if let Some(d) = date_to {
        clauses.push("h.date_time <= @dateTo".into());
        let d = if whole_days && !d.contains(' ') { format!("{d} 23:59:59") } else { d.to_string() };
        binds.push(("@dateTo", SqlValue::Text(d)));
    }
    if let Some(b) = buy_in {
        clauses.push("h.buy_in = @buyIn".into());
        binds.push(("@buyIn", SqlValue::Real(b)));
    }
    clauses.extend(extra.iter().map(|c| c.to_string()));
    Scope { join: hero_join(hero), where_clause: format!("WHERE {}", clauses.join(" AND ")), binds }
}

/// Rounds to `digits` decimals, ties to even (the former `Math.Round`).
fn round_to(value: f64, digits: i32) -> f64 {
    let factor = 10f64.powi(digits);
    (value * factor).round_ties_even() / factor
}

// ---------------------------------------------------------------------------------------------
// Tournament result in euros
// ---------------------------------------------------------------------------------------------

/// What one tournament's hands say about its result.
#[derive(Debug, Clone, Copy)]
pub(crate) struct TournamentFigures {
    pub(crate) room: Room,
    pub(crate) buy_in: f64,
    pub(crate) prize_pool: f64,
    pub(crate) multiplier: i32,
    /// Hero's finishing place when known, 0 otherwise.
    pub(crate) position: i32,
    /// Smallest table size the hero played (2 means the hero reached heads-up).
    pub(crate) lowest_player_count: i32,
    pub(crate) chip_profit: f64,
}

/// The rooms do not share their prize pool the same way, so the room is part of a result.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Room {
    Winamax,
    Unibet,
    Betclic,
    Other,
}

impl Room {
    pub(crate) fn from_name(name: &str) -> Room {
        match name.trim().to_ascii_lowercase().as_str() {
            "winamax" => Room::Winamax,
            "unibet" => Room::Unibet,
            "betclic" => Room::Betclic,
            _ => Room::Other,
        }
    }
}

/// Shares of the prize pool going to the first, second and third place.
type Shares = (f64, f64, f64);

const SHARES_75_15_10: Shares = (0.75, 0.15, 0.10);
const SHARES_80_12_8: Shares = (0.80, 0.12, 0.08);
const SHARES_80_10_10: Shares = (0.80, 0.10, 0.10);

/// Winamax Expresso and Unibet Power Spin share from x100, Unibet also at x10; Betclic from x20.
/// Below that the winner takes the whole pool. These are the prize tables published by the rooms.
const WINAMAX_SHARING_MULTIPLIER: i32 = 100;
const UNIBET_SHARING_MULTIPLIER: i32 = 100;
const UNIBET_SMALL_SHARING_MULTIPLIER: i32 = 10;
const BETCLIC_SHARING_MULTIPLIER: i32 = 20;

fn prize_shares(room: Room, multiplier: i32) -> Option<Shares> {
    match room {
        Room::Winamax if multiplier >= WINAMAX_SHARING_MULTIPLIER => Some(SHARES_80_12_8),
        Room::Unibet if multiplier >= UNIBET_SHARING_MULTIPLIER => Some(SHARES_80_12_8),
        Room::Unibet if multiplier >= UNIBET_SMALL_SHARING_MULTIPLIER => Some(SHARES_80_10_10),
        Room::Betclic | Room::Other if multiplier >= BETCLIC_SHARING_MULTIPLIER => Some(SHARES_75_15_10),
        _ => None,
    }
}

impl TournamentFigures {
    fn is_prized(&self) -> bool {
        self.prize_pool > 0.0 || self.multiplier > 0
    }

    /// What the player paid to enter: `buy_in` already includes the fee in every room.
    fn total_cost(&self) -> f64 {
        self.buy_in
    }

    /// The multiplier, or the one the prize pool implies when it was not recorded.
    fn effective_multiplier(&self) -> i32 {
        let cost = self.total_cost();
        if self.multiplier > 0 {
            self.multiplier
        } else if cost > 0.0 {
            (self.prize_pool / cost).round() as i32
        } else {
            0
        }
    }

    fn shares(&self) -> Option<Shares> {
        prize_shares(self.room, self.effective_multiplier())
    }

    fn has_sharing(&self) -> bool {
        self.shares().is_some()
    }

    /// Finishing place: the recorded one, else deduced from the chips and the table size.
    fn finish_position(&self) -> i32 {
        match self.position {
            0 if self.chip_profit > 0.0 => 1,
            0 if self.lowest_player_count == 2 => 2,
            0 => 3,
            p => p,
        }
    }

    fn win_amount(&self) -> f64 {
        let cost = self.total_cost();
        let m = self.multiplier as f64;
        let total_prize = if self.prize_pool > m * cost * 0.5 { self.prize_pool } else { cost * m };
        match (self.finish_position(), self.shares()) {
            (1, Some((first, _, _))) => total_prize * first,
            (1, None) => total_prize,
            (2, Some((_, second, _))) => total_prize * second,
            (3, Some((_, _, third))) => total_prize * third,
            _ => 0.0,
        }
    }

    /// Result in euros; tournaments with no prize information fall back to the chips result.
    pub(crate) fn euro_profit(&self) -> f64 {
        if self.is_prized() {
            self.win_amount() - self.total_cost()
        } else {
            self.chip_profit
        }
    }

    /// In the money: first place, or a shared prize.
    fn is_in_the_money(&self) -> bool {
        if self.is_prized() {
            let pos = self.finish_position();
            pos == 1 || (self.has_sharing() && (pos == 2 || pos == 3))
        } else {
            self.chip_profit > 0.0
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------------------------

/// Hands further apart than this belong to different sessions.
const SESSION_GAP_HOURS: f64 = 2.0;

#[derive(Debug, Clone)]
struct Session {
    start: NaiveDateTime,
    end: NaiveDateTime,
    room: String,
    tournaments: i64,
    hands: i64,
    profit: f64,
}

struct SessionHand {
    time: NaiveDateTime,
    room: String,
    game_id: String,
    figures: TournamentFigures,
    hand_profit: f64,
}

fn parse_date_time(raw: &str) -> Option<NaiveDateTime> {
    let cleaned = raw.replace("(UTC)", "");
    let cleaned = cleaned.trim();
    ["%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"]
        .iter()
        .find_map(|f| NaiveDateTime::parse_from_str(cleaned, f).ok())
        .or_else(|| NaiveDate::parse_from_str(cleaned, "%Y-%m-%d").ok().and_then(|d| d.and_hms_opt(0, 0, 0)))
}

fn sessions(conn: &Connection, q: &StatsQuery) -> Result<Vec<Session>> {
    let hero = resolve_hero(conn, q.hero_name.as_deref())?;
    let scope = scope(hero.as_deref(), non_empty(&q.date_from), non_empty(&q.date_to), q.buy_in, false, &[]);

    let sql = format!(
        "SELECT h.date_time, h.room, h.game_id, h.buy_in, h.prize_pool, ph.net_profit, h.player_count, h.multiplier, h.position
         FROM hands h
         {}
         {}
         ORDER BY h.date_time ASC",
        scope.join, scope.where_clause
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(&scope.params()[..], |r| {
        Ok((
            r.get::<_, Option<String>>(0)?.unwrap_or_default(),
            r.get::<_, Option<String>>(1)?.unwrap_or_else(|| "Unknown".into()),
            r.get::<_, Option<String>>(2)?.unwrap_or_default(),
            r.get::<_, Option<f64>>(3)?.unwrap_or(0.0),
            r.get::<_, Option<f64>>(4)?.unwrap_or(0.0),
            r.get::<_, Option<f64>>(5)?.unwrap_or(0.0),
            r.get::<_, Option<i32>>(6)?.unwrap_or(3),
            r.get::<_, Option<i32>>(7)?.unwrap_or(0),
            r.get::<_, Option<i32>>(8)?.unwrap_or(0),
        ))
    })?;

    let mut hands = Vec::new();
    for row in rows {
        let (date, room, game_id, buy_in, prize_pool, hand_profit, pc, multiplier, position) = row?;
        let Some(time) = parse_date_time(&date) else { continue };
        let room_kind = Room::from_name(&room);
        hands.push(SessionHand {
            time,
            room,
            game_id,
            hand_profit,
            figures: TournamentFigures {
                room: room_kind,
                buy_in,
                prize_pool,
                multiplier,
                position,
                lowest_player_count: pc,
                chip_profit: 0.0,
            },
        });
    }
    // Stable, like the former LINQ ordering: equal times keep the query order.
    hands.sort_by_key(|h| h.time);

    let mut out = Vec::new();
    let mut current: Vec<&SessionHand> = Vec::new();
    let mut last_time: Option<NaiveDateTime> = None;
    for hand in &hands {
        if let Some(last) = last_time {
            if (hand.time - last).num_milliseconds() as f64 / 3_600_000.0 > SESSION_GAP_HOURS && !current.is_empty() {
                out.push(session_of(&current));
                current.clear();
            }
        }
        current.push(hand);
        last_time = Some(hand.time);
    }
    if !current.is_empty() {
        out.push(session_of(&current));
    }
    Ok(out)
}

fn session_of(hands: &[&SessionHand]) -> Session {
    let start = hands.iter().map(|h| h.time).min().expect("a session has hands");
    let end = hands.iter().map(|h| h.time).max().expect("a session has hands");

    // Games in order of first appearance.
    let mut order: Vec<&str> = Vec::new();
    let mut by_game: HashMap<&str, Vec<&SessionHand>> = HashMap::new();
    for h in hands {
        by_game.entry(h.game_id.as_str()).or_insert_with(|| {
            order.push(h.game_id.as_str());
            Vec::new()
        });
        by_game.get_mut(h.game_id.as_str()).expect("just inserted").push(h);
    }

    let profit = order
        .iter()
        .map(|game| {
            let hands = &by_game[game];
            let first = hands[0].figures;
            TournamentFigures {
                multiplier: hands.iter().map(|h| h.figures.multiplier).max().unwrap_or(0),
                position: hands.iter().map(|h| h.figures.position).max().unwrap_or(0),
                lowest_player_count: hands.iter().map(|h| h.figures.lowest_player_count).min().unwrap_or(3),
                chip_profit: hands.iter().map(|h| h.hand_profit).sum(),
                ..first
            }
            .euro_profit()
        })
        .sum();

    Session { start, end, room: hands[0].room.clone(), tournaments: order.len() as i64, hands: hands.len() as i64, profit }
}

pub fn session_history(conn: &Connection, limit: usize, q: &StatsQuery) -> Result<Vec<Value>> {
    let mut all = sessions(conn, q)?;
    all.sort_by(|a, b| b.start.cmp(&a.start));
    let format = |t: NaiveDateTime| t.format("%Y-%m-%d %H:%M:%S").to_string();
    Ok(all
        .into_iter()
        .take(limit)
        .map(|s| {
            json!({
                "room": s.room,
                "tournaments": s.tournaments,
                "hands_played": s.hands,
                "profit": s.profit,
                "session_date": format(s.start),
                "session_end": format(s.end),
            })
        })
        .collect())
}

pub fn unique_buy_ins(conn: &Connection) -> Result<Vec<f64>> {
    let mut stmt = conn.prepare("SELECT DISTINCT buy_in FROM hands WHERE buy_in > 0 AND player_count <= 3 ORDER BY buy_in ASC")?;
    let rows = stmt.query_map([], |r| r.get::<_, f64>(0))?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}

// ---------------------------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------------------------

pub fn dashboard_stats(conn: &Connection, q: &StatsQuery) -> Result<Value> {
    let hero = resolve_hero(conn, q.hero_name.as_deref())?;
    let scope = scope(hero.as_deref(), non_empty(&q.date_from), non_empty(&q.date_to), q.buy_in, false, &[]);
    let (join, filter) = (&scope.join, &scope.where_clause);

    let (total_hands, hands_won, total_ev): (i64, i64, f64) = conn.query_row(
        &format!(
            "SELECT COUNT(*) as total_hands,
                    SUM(CASE WHEN ph.net_profit > 0 THEN 1 ELSE 0 END) as hands_won,
                    COALESCE(SUM(ph.net_won_adjusted), 0) as total_ev
             FROM hands h {join} {filter}"
        ),
        &scope.params()[..],
        |r| Ok((r.get(0)?, r.get::<_, Option<i64>>(1)?.unwrap_or(0), r.get::<_, Option<f64>>(2)?.unwrap_or(0.0))),
    )?;

    // One row per tournament: its figures decide the euro result and whether it was cashed.
    let mut tournaments_won = 0;
    let mut total_profit_euro = 0.0;
    {
        let mut stmt = conn.prepare(&format!(
            "SELECT h.buy_in, h.prize_pool, SUM(ph.net_profit) as chip_profit, MIN(h.player_count) as lowest_players,
                    MAX(h.multiplier) as multiplier, MAX(h.position) as position, h.room
             FROM hands h {join} {filter}
             GROUP BY h.game_id"
        ))?;
        let rows = stmt.query_map(&scope.params()[..], |r| {
            Ok(TournamentFigures {
                room: Room::from_name(&r.get::<_, Option<String>>(6)?.unwrap_or_default()),
                buy_in: r.get::<_, Option<f64>>(0)?.unwrap_or(0.0),
                prize_pool: r.get::<_, Option<f64>>(1)?.unwrap_or(0.0),
                chip_profit: r.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
                lowest_player_count: r.get::<_, Option<i32>>(3)?.unwrap_or(3),
                multiplier: r.get::<_, Option<i32>>(4)?.unwrap_or(0),
                position: r.get::<_, Option<i32>>(5)?.unwrap_or(0),
            })
        })?;
        for figures in rows {
            let figures = figures?;
            if figures.is_in_the_money() {
                tournaments_won += 1;
            }
            total_profit_euro += figures.euro_profit();
        }
    }

    // Chips EV by table size and seat.
    let mut cev_by_position = BTreeMap::new();
    let mut count_by_position = BTreeMap::new();
    let mut tournaments_by_position = BTreeMap::new();
    {
        let mut stmt = conn.prepare(&format!(
            "SELECT ph.position, COALESCE(SUM(ph.net_won_adjusted), 0) as pos_ev, h.player_count,
                    COUNT(*) as hand_count, COUNT(DISTINCT h.game_id) as tour_count
             FROM hands h {join} {filter}
             GROUP BY ph.position, h.player_count"
        ))?;
        let rows = stmt.query_map(&scope.params()[..], |r| {
            Ok((r.get::<_, Option<String>>(0)?, r.get::<_, f64>(1)?, r.get::<_, i32>(2)?, r.get::<_, i64>(3)?, r.get::<_, i64>(4)?))
        })?;
        for row in rows {
            let (position, ev, player_count, hands, tournaments) = row?;
            let key = format!("{}{}", if player_count == 2 { "HU_" } else { "3W_" }, position.unwrap_or_else(|| "Unknown".into()));
            cev_by_position.insert(key.clone(), ev);
            count_by_position.insert(key.clone(), hands);
            tournaments_by_position.insert(key, tournaments);
        }
    }

    // Three-handed small and big blinds, split by who put chips in before them.
    {
        let mut stmt = conn.prepare(&format!(
            "SELECT ph.position as hero_pos,
                    CASE
                        WHEN ph.position = 'SB' AND COALESCE(pp.btn_investment, 0) > COALESCE(h.ante, 0) THEN 'vs_BTN'
                        WHEN ph.position = 'SB' AND COALESCE(pp.btn_investment, 0) <= COALESCE(h.ante, 0) THEN 'vs_BB'
                        WHEN ph.position = 'BB' AND COALESCE(pp.btn_investment, 0) > COALESCE(h.ante, 0) THEN 'vs_BTN'
                        WHEN ph.position = 'BB' AND COALESCE(pp.btn_investment, 0) <= COALESCE(h.ante, 0) AND COALESCE(pp.sb_investment, 0) > (COALESCE(h.ante, 0) + CAST(REPLACE(SUBSTR(h.blinds, 1, INSTR(h.blinds, '/') - 1), ',', '.') AS REAL)) THEN 'vs_SB'
                        ELSE 'Other'
                    END as situation,
                    COALESCE(SUM(ph.net_won_adjusted), 0) as sub_ev
             FROM hands h
             {join}
             JOIN (
                 SELECT hand_id,
                        MAX(CASE WHEN position = 'BTN' THEN COALESCE(investment, 0) END) as btn_investment,
                        MAX(CASE WHEN position = 'SB' THEN COALESCE(investment, 0) END) as sb_investment
                 FROM player_hands
                 GROUP BY hand_id
             ) pp ON pp.hand_id = h.id
             {filter} AND h.player_count = 3 AND ph.position IN ('SB', 'BB')
             GROUP BY hero_pos, situation"
        ))?;
        let rows = stmt.query_map(&scope.params()[..], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, f64>(2)?)))?;
        for row in rows {
            let (position, situation, ev) = row?;
            if situation != "Other" {
                cev_by_position.insert(format!("3W_{position}_{situation}"), ev);
            }
        }
    }

    let sessions = sessions(conn, q)?;
    let total_tournaments: i64 = sessions.iter().map(|s| s.tournaments).sum();
    let avg_chips_ev = if total_tournaments > 0 { round_to(total_ev / total_tournaments as f64, 2) } else { 0.0 };

    let sessions_this_month = count_in_month_of(sessions.iter().map(|s| s.start), Utc::now().naive_utc());

    Ok(json!({
        "total_hands": total_hands,
        "hands_won": hands_won,
        "tournaments_won": tournaments_won,
        "total_profit": total_profit_euro,
        "total_ev": total_ev,
        "total_tournaments": total_tournaments,
        "avg_chips_ev": avg_chips_ev,
        "cev_by_position": cev_by_position,
        "count_by_position": count_by_position,
        "tournaments_by_position": tournaments_by_position,
        "sessions_this_month": sessions_this_month,
        "total_sessions": sessions.len(),
    }))
}

/// How many of the `starts` fall on or after the first day of `now`'s month.
fn count_in_month_of(starts: impl Iterator<Item = chrono::NaiveDateTime>, now: chrono::NaiveDateTime) -> usize {
    let start_of_month =
        NaiveDate::from_ymd_opt(now.year(), now.month(), 1).and_then(|d| d.and_hms_opt(0, 0, 0)).expect("valid first of month");
    starts.filter(|s| *s >= start_of_month).count()
}

#[cfg(test)]
mod month_tests {
    use super::count_in_month_of;
    use chrono::NaiveDate;

    fn at(y: i32, m: u32, d: u32, h: u32) -> chrono::NaiveDateTime {
        NaiveDate::from_ymd_opt(y, m, d).unwrap().and_hms_opt(h, 0, 0).unwrap()
    }

    #[test]
    fn only_sessions_from_the_first_of_the_current_month_count() {
        let now = at(2026, 11, 4, 12);
        let starts = [at(2026, 10, 31, 23), at(2026, 11, 1, 0), at(2026, 11, 4, 9), at(2025, 11, 10, 9)];
        assert_eq!(count_in_month_of(starts.into_iter(), now), 2);
    }

    #[test]
    fn the_month_boundary_is_inclusive_and_december_does_not_overflow() {
        assert_eq!(count_in_month_of([at(2026, 12, 1, 0)].into_iter(), at(2026, 12, 31, 23)), 1);
        assert_eq!(count_in_month_of(std::iter::empty(), at(2026, 1, 1, 0)), 0);
    }
}

// ---------------------------------------------------------------------------------------------
// Winrate chart
// ---------------------------------------------------------------------------------------------

struct ChartHand {
    date: String,
    cumulative_profit: f64,
    cumulative_showdown: f64,
    cumulative_no_showdown: f64,
    cumulative_ev: f64,
    game_id: Option<String>,
    figures: TournamentFigures,
    hand_profit: f64,
}

pub fn winrate_chart(conn: &Connection, q: &ChartQuery) -> Result<Vec<Value>> {
    let hero = resolve_hero(conn, q.hero_name.as_deref())?;

    let mut extra: Vec<&str> = Vec::new();
    let mut seat: Option<String> = None;
    if let Some(position) = non_empty(&q.position) {
        if let Some(rest) = position.strip_prefix("HU_") {
            extra.push("h.player_count = 2");
            seat = Some(rest.to_string());
        } else if let Some(rest) = position.strip_prefix("3W_") {
            extra.push("h.player_count = 3");
            seat = Some(rest.to_string());
        }
        if seat.is_some() {
            extra.push("ph.position = @pos");
        }
    }
    let mut scope = scope(hero.as_deref(), non_empty(&q.date_from), non_empty(&q.date_to), q.buy_in, true, &extra);
    if let Some(seat) = seat {
        scope.binds.push(("@pos", SqlValue::Text(seat)));
    }

    let sql = format!(
        "SELECT
            h.date_time,
            SUM(ph.net_profit) OVER (ORDER BY h.date_time, h.id) as cumulative_profit,
            SUM(COALESCE(CASE WHEN ph.went_to_showdown = 1 THEN ph.net_profit ELSE 0 END, 0)) OVER (ORDER BY h.date_time, h.id) as cumulative_showdown,
            SUM(COALESCE(CASE WHEN NOT (ph.went_to_showdown = 1) THEN ph.net_profit ELSE 0 END, 0)) OVER (ORDER BY h.date_time, h.id) as cumulative_no_showdown,
            SUM(COALESCE(ph.net_won_adjusted, ph.net_profit)) OVER (ORDER BY h.date_time, h.id) as cumulative_ev,
            h.game_id, h.buy_in, h.prize_pool, h.player_count,
            ph.net_profit as hand_profit, h.multiplier, h.position, h.room
         FROM hands h
         {}
         {}
         ORDER BY h.date_time ASC, h.id ASC",
        scope.join, scope.where_clause
    );
    let mut stmt = conn.prepare(&sql)?;
    let hands: Vec<ChartHand> = stmt
        .query_map(&scope.params()[..], |r| {
            let hand_profit: f64 = r.get(9)?;
            Ok(ChartHand {
                date: r.get(0)?,
                cumulative_profit: r.get(1)?,
                cumulative_showdown: r.get(2)?,
                cumulative_no_showdown: r.get(3)?,
                cumulative_ev: r.get(4)?,
                game_id: r.get(5)?,
                hand_profit,
                figures: TournamentFigures {
                    room: Room::from_name(&r.get::<_, Option<String>>(12)?.unwrap_or_default()),
                    buy_in: r.get::<_, Option<f64>>(6)?.unwrap_or(0.0),
                    prize_pool: r.get::<_, Option<f64>>(7)?.unwrap_or(0.0),
                    lowest_player_count: r.get::<_, Option<i32>>(8)?.unwrap_or(3),
                    multiplier: r.get::<_, Option<i32>>(10)?.unwrap_or(0),
                    position: r.get::<_, Option<i32>>(11)?.unwrap_or(0),
                    chip_profit: 0.0,
                },
            })
        })?
        .collect::<std::result::Result<_, _>>()?;

    // A tournament's euro result is booked on its last hand.
    let mut last_hand_of: HashMap<&str, usize> = HashMap::new();
    let mut games: Vec<&str> = Vec::new();
    for (i, h) in hands.iter().enumerate() {
        if let Some(id) = h.game_id.as_deref().filter(|id| !id.is_empty()) {
            if last_hand_of.insert(id, i).is_none() {
                games.push(id);
            }
        }
    }
    let euro_of_game: HashMap<&str, f64> = games
        .iter()
        .map(|&game| {
            let hands_of_game: Vec<&ChartHand> = hands.iter().filter(|h| h.game_id.as_deref() == Some(game)).collect();
            let figures = TournamentFigures {
                multiplier: hands_of_game.iter().map(|h| h.figures.multiplier).max().unwrap_or(0),
                position: hands_of_game.iter().map(|h| h.figures.position).max().unwrap_or(0),
                lowest_player_count: hands_of_game.iter().map(|h| h.figures.lowest_player_count).min().unwrap_or(3),
                chip_profit: hands_of_game.iter().map(|h| h.hand_profit).sum(),
                ..hands_of_game[0].figures
            };
            (game, figures.euro_profit())
        })
        .collect();

    let mut cumulative_euro = 0.0;
    Ok(hands
        .iter()
        .enumerate()
        .map(|(i, h)| {
            if let Some(id) = h.game_id.as_deref().filter(|id| !id.is_empty()) {
                if last_hand_of.get(id) == Some(&i) {
                    cumulative_euro += euro_of_game[id];
                }
            }
            json!({
                "date": h.date,
                "profit": h.cumulative_profit,
                "cumulative": h.cumulative_ev,
                "chips_won_showdown": h.cumulative_showdown,
                "chips_won_no_showdown": h.cumulative_no_showdown,
                "euro_profit": cumulative_euro,
            })
        })
        .collect())
}

// ---------------------------------------------------------------------------------------------
// Multipliers
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiplierStats {
    pub multiplier: i32,
    pub total_count: i64,
    pub percentage_of_total: f64,
    pub win_count: i64,
    pub loss_count: i64,
    pub win_percentage: f64,
}

pub fn multiplier_stats(conn: &Connection, q: &StatsQuery) -> Result<Vec<MultiplierStats>> {
    let hero = resolve_hero(conn, q.hero_name.as_deref())?;
    // This statistic never filters on the buy-in.
    let scope = scope(hero.as_deref(), non_empty(&q.date_from), non_empty(&q.date_to), None, true, &[]);

    let mut stmt = conn.prepare(&format!(
        "SELECT multiplier, COUNT(*) as total, SUM(CASE WHEN is_won THEN 1 ELSE 0 END) as wins
         FROM (
             SELECT h.game_id, MAX(h.multiplier) as multiplier,
                    (MAX(h.position) = 1 OR (MAX(h.position) = 0 AND SUM(ph.net_profit) > 0)) as is_won
             FROM hands h {} {}
             GROUP BY h.game_id
         )
         GROUP BY multiplier
         ORDER BY multiplier ASC",
        scope.join, scope.where_clause
    ))?;
    let mut stats: Vec<MultiplierStats> = stmt
        .query_map(&scope.params()[..], |r| {
            let total_count: i64 = r.get(1)?;
            let win_count: i64 = r.get::<_, Option<i64>>(2)?.unwrap_or(0);
            Ok(MultiplierStats {
                multiplier: r.get::<_, Option<i32>>(0)?.unwrap_or(0),
                total_count,
                percentage_of_total: 0.0,
                win_count,
                loss_count: total_count - win_count,
                win_percentage: if total_count > 0 { round_to(win_count as f64 / total_count as f64 * 100.0, 2) } else { 0.0 },
            })
        })?
        .collect::<std::result::Result<_, _>>()?;

    let grand_total: i64 = stats.iter().map(|s| s.total_count).sum();
    for s in &mut stats {
        s.percentage_of_total = if grand_total > 0 { round_to(s.total_count as f64 / grand_total as f64 * 100.0, 2) } else { 0.0 };
    }
    Ok(stats)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn figures(buy_in: f64, prize_pool: f64, multiplier: i32, position: i32, chips: f64, players: i32) -> TournamentFigures {
        TournamentFigures { room: Room::Betclic, buy_in, prize_pool, multiplier, position, lowest_player_count: players, chip_profit: chips }
    }

    fn in_room(room: Room, t: TournamentFigures) -> TournamentFigures {
        TournamentFigures { room, ..t }
    }

    #[test]
    fn winamax_shares_from_x100_with_80_12_8_and_not_before() {
        // Expresso 5: the 500 euro prize (x100) is split 400 / 60 / 40, the 100 euro one (x20) is not.
        let split = |position| in_room(Room::Winamax, figures(5.0, 500.0, 100, position, 0.0, 3)).euro_profit();
        assert!((split(1) - (400.0 - 5.0)).abs() < 1e-9);
        assert!((split(2) - (60.0 - 5.0)).abs() < 1e-9);
        assert!((split(3) - (40.0 - 5.0)).abs() < 1e-9);
        let x20 = |position| in_room(Room::Winamax, figures(5.0, 100.0, 20, position, 0.0, 3));
        assert_eq!(x20(1).euro_profit(), 100.0 - 5.0);
        assert_eq!(x20(2).euro_profit(), -5.0);
        assert!(!x20(2).is_in_the_money());
    }

    #[test]
    fn unibet_shares_80_10_10_at_x10_and_80_12_8_from_x100() {
        let at = |multiplier, pool, position| in_room(Room::Unibet, figures(250.0, pool, multiplier, position, 0.0, 3)).euro_profit();
        assert_eq!(at(10, 2500.0, 1), 2000.0 - 250.0);
        assert_eq!(at(10, 2500.0, 2), 250.0 - 250.0);
        assert_eq!(at(100, 25000.0, 2), 3000.0 - 250.0);
        assert_eq!(at(100, 25000.0, 3), 2000.0 - 250.0);
        assert_eq!(at(5, 1250.0, 1), 1250.0 - 250.0);
        assert_eq!(at(5, 1250.0, 2), -250.0);
    }

    #[test]
    fn betclic_shares_75_15_10_from_x20() {
        let at = |multiplier, pool, position| in_room(Room::Betclic, figures(1.0, pool, multiplier, position, 0.0, 3)).euro_profit();
        assert_eq!(at(20, 20.0, 2), 20.0 * 0.15 - 1.0);
        assert_eq!(at(10, 10.0, 1), 10.0 - 1.0);
        assert_eq!(at(10, 10.0, 2), -1.0);
    }

    #[test]
    fn winner_takes_all_without_sharing() {
        let t = figures(2.0, 4.0, 2, 1, 500.0, 2);
        assert!(!t.has_sharing());
        assert_eq!(t.euro_profit(), 4.0 - 2.0);
        assert!(t.is_in_the_money());
    }

    #[test]
    fn losing_costs_the_buy_in() {
        let t = figures(2.0, 4.0, 2, 2, -500.0, 2);
        assert_eq!(t.euro_profit(), -2.0);
        assert!(!t.is_in_the_money());
    }

    #[test]
    fn big_multipliers_share_the_prize() {
        let first = figures(1.0, 100.0, 100, 1, 500.0, 3);
        assert!(first.has_sharing());
        assert_eq!(first.euro_profit(), 100.0 * 0.75 - 1.0);
        let second = figures(1.0, 100.0, 100, 2, 0.0, 3);
        assert_eq!(second.euro_profit(), 100.0 * 0.15 - 1.0);
        assert!(second.is_in_the_money());
        let third = figures(1.0, 100.0, 100, 3, 0.0, 3);
        assert_eq!(third.euro_profit(), 100.0 * 0.10 - 1.0);
    }

    #[test]
    fn unknown_position_is_deduced_from_the_chips_and_table_size() {
        assert_eq!(figures(1.0, 3.0, 3, 0, 10.0, 3).finish_position(), 1);
        assert_eq!(figures(1.0, 3.0, 3, 0, -10.0, 2).finish_position(), 2);
        assert_eq!(figures(1.0, 3.0, 3, 0, -10.0, 3).finish_position(), 3);
    }

    #[test]
    fn no_prize_information_falls_back_to_chips() {
        let t = figures(0.0, 0.0, 0, 0, 120.0, 2);
        assert_eq!(t.euro_profit(), 120.0);
        assert!(t.is_in_the_money());
        assert!(!figures(0.0, 0.0, 0, 0, -1.0, 2).is_in_the_money());
    }

    #[test]
    fn dates_with_the_utc_suffix_parse() {
        assert!(parse_date_time("2026-01-02 22:53:05 (UTC)").is_some());
        assert!(parse_date_time("not a date").is_none());
    }

    #[test]
    fn rounding_is_to_even() {
        assert_eq!(round_to(0.125, 2), 0.12);
        assert_eq!(round_to(1.005, 2), 1.0);
        assert_eq!(round_to(85.954, 2), 85.95);
    }
}
