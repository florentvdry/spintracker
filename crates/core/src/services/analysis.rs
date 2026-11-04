//! Hand analysis: filtering the hero's (or the field's) hands by situation, action and stack,
//! the statistics of the result, the range breakdown and the hand replayer.
//!
//! Port of the former `AnalysisService`. The filters read the stored action text, line by line,
//! in the three room formats ("Name: action", "Name action", with or without a timestamp).

use std::cmp::Ordering;
use std::collections::{BTreeMap, HashMap};

use chrono::NaiveDateTime;
use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, ToSql};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::engines::actions::{parse_actions, ActionKind};
use crate::parsers::regex;
use crate::repos::hands_query::{self, hero_resolution_sql};
use crate::repos::heatmap::normalize_cards;
use crate::util::{eq_ic, starts_with_ic};
use crate::Result;

const KNOWN_ACTIONS: [&str; 6] = ["posts", "calls", "bets", "raises", "folds", "checks"];
const DEFAULT_PAGE_SIZE: i64 = 50;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AnalysisFilters {
    pub hero_name: Option<String>,
    pub situation: Option<String>,
    pub action: Option<String>,
    pub preflop_btn_action: Option<String>,
    pub preflop_sb_action: Option<String>,
    pub preflop_bb_action: Option<String>,
    pub flop_btn_action: Option<String>,
    pub flop_sb_action: Option<String>,
    pub flop_bb_action: Option<String>,
    pub turn_btn_action: Option<String>,
    pub turn_sb_action: Option<String>,
    pub turn_bb_action: Option<String>,
    pub river_btn_action: Option<String>,
    pub river_sb_action: Option<String>,
    pub river_bb_action: Option<String>,
    #[serde(rename = "minStackBB")]
    pub min_stack_bb: Option<f64>,
    #[serde(rename = "maxStackBB")]
    pub max_stack_bb: Option<f64>,
    pub positions: Option<Vec<String>>,
    pub player_count: Option<i32>,
    /// Ordered preflop sequence such as `["BTN:Raise", "SB:Call"]`.
    pub action_sequence: Option<Vec<String>>,
    /// Preflop situation such as "rfi" or "limp".
    pub situation_id: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    /// "all", "reg" or "fish".
    pub opponent_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AnalysisHandsRequest {
    #[serde(flatten)]
    pub filters: AnalysisFilters,
    pub page: i64,
    pub limit: i64,
    pub sort_by: String,
}

impl Default for AnalysisHandsRequest {
    fn default() -> Self {
        Self { filters: AnalysisFilters::default(), page: 1, limit: DEFAULT_PAGE_SIZE, sort_by: "date_desc".into() }
    }
}

/// One player's hand, as the analysis reads it.
#[derive(Debug, Clone)]
pub struct AnalysisHand {
    pub hand_id: String,
    /// The player analysed in this hand (the actual name behind an alias).
    pub hero_name: Option<String>,
    pub date: NaiveDateTime,
    pub profit: f64,
    pub preflop: String,
    pub flop: String,
    pub turn: String,
    pub river: String,
    pub hero_position: String,
    pub hero_stack: f64,
    pub blinds: String,
    pub went_to_showdown: bool,
    pub ev_chips: Option<f64>,
    /// "Player1:BTN|Player2:SB"
    pub player_positions: String,
    pub hero_cards: Option<String>,
}

fn min_date() -> NaiveDateTime {
    chrono::NaiveDate::from_ymd_opt(1, 1, 1).and_then(|d| d.and_hms_opt(0, 0, 0)).expect("valid date")
}

fn parse_date(raw: &str) -> NaiveDateTime {
    ["%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"]
        .iter()
        .find_map(|f| NaiveDateTime::parse_from_str(raw.trim(), f).ok())
        .unwrap_or_else(min_date)
}

fn iso(date: NaiveDateTime) -> String {
    date.format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn non_empty(v: &Option<String>) -> Option<&str> {
    v.as_deref().filter(|s| !s.is_empty())
}

// ---------------------------------------------------------------------------------------------
// Reading the hands
// ---------------------------------------------------------------------------------------------

/// The hands matching the database-level filters (hero, dates, seats, table size).
pub fn hands_for_analysis(conn: &Connection, f: &AnalysisFilters) -> Result<Vec<AnalysisHand>> {
    let mut clauses = vec!["h.player_count <= 3".to_string()];
    let mut binds: Vec<(String, SqlValue)> = Vec::new();

    if let Some(name) = non_empty(&f.hero_name) {
        clauses.push(format!("ph.player_name IN {}", hero_resolution_sql("@heroName")));
        binds.push(("@heroName".into(), SqlValue::Text(name.into())));
    } else {
        // Field analysis: every player whose cards are known.
        clauses.push("(ph.cards IS NOT NULL AND ph.cards != '')".into());
    }
    if let Some(d) = non_empty(&f.date_from) {
        clauses.push("h.date_time >= @dateFrom".into());
        binds.push(("@dateFrom".into(), SqlValue::Text(d.into())));
    }
    if let Some(d) = non_empty(&f.date_to) {
        let d = if d.len() == 10 { format!("{d} 23:59:59") } else { d.to_string() };
        clauses.push("h.date_time <= @dateTo".into());
        binds.push(("@dateTo".into(), SqlValue::Text(d)));
    }
    if let Some(positions) = f.positions.as_ref().filter(|p| !p.is_empty()) {
        let mut seat_clauses = Vec::new();
        for (i, position) in positions.iter().enumerate() {
            let mut clause = format!("(ph.position = @pos{i} OR ph.position LIKE @posLike{i})");
            binds.push((format!("@pos{i}"), SqlValue::Text(position.clone())));
            binds.push((format!("@posLike{i}"), SqlValue::Text(format!("%({position})%"))));
            // Heads-up the small blind is also the button.
            if f.player_count == Some(2) && position == "SB" {
                clause = format!("({clause} OR ph.position = @posBtn{i} OR ph.position = @posBtnSb{i})");
                binds.push((format!("@posBtn{i}"), SqlValue::Text("BTN".into())));
                binds.push((format!("@posBtnSb{i}"), SqlValue::Text("BTN SB".into())));
            }
            seat_clauses.push(clause);
        }
        clauses.push(format!("({})", seat_clauses.join(" OR ")));
    }
    if let Some(n) = f.player_count {
        clauses.push("h.player_count = @playerCount".into());
        binds.push(("@playerCount".into(), SqlValue::Integer(n.into())));
    }

    let mut stmt = conn.prepare(&format!(
        "SELECT h.id, h.date_time, ph.net_profit, h.preflop_action, h.flop_action, h.turn_action, h.river_action,
                ph.position, ph.stack, h.blinds, ph.went_to_showdown, h.total_pot, ph.investment, ph.player_name,
                h.flop, h.turn, h.river, ph.ev_chips,
                (SELECT GROUP_CONCAT(player_name || ':' || position, '|') FROM player_hands ph_inner WHERE ph_inner.hand_id = h.id) as player_positions_map,
                ph.cards
         FROM hands h
         JOIN player_hands ph ON h.id = ph.hand_id
         WHERE {}
         ORDER BY h.date_time ASC",
        clauses.join(" AND ")
    ))?;
    let params: Vec<(&str, &dyn ToSql)> = binds.iter().map(|(n, v)| (n.as_str(), v as &dyn ToSql)).collect();
    let text = |r: &rusqlite::Row, i: usize| -> rusqlite::Result<String> { Ok(r.get::<_, Option<String>>(i)?.unwrap_or_default()) };
    let rows = stmt
        .query_map(&params[..], |r| {
            Ok(AnalysisHand {
                hand_id: r.get(0)?,
                date: parse_date(&text(r, 1)?),
                profit: r.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
                preflop: text(r, 3)?,
                flop: text(r, 4)?,
                turn: text(r, 5)?,
                river: text(r, 6)?,
                hero_position: text(r, 7)?,
                hero_stack: r.get::<_, Option<f64>>(8)?.unwrap_or(0.0),
                blinds: text(r, 9)?,
                went_to_showdown: r.get::<_, Option<i64>>(10)?.unwrap_or(0) == 1,
                hero_name: r.get(13)?,
                ev_chips: r.get(17)?,
                player_positions: text(r, 18)?,
                hero_cards: r.get(19)?,
            })
        })?
        .collect::<std::result::Result<_, _>>()?;
    Ok(rows)
}

// ---------------------------------------------------------------------------------------------
// Reading action lines
// ---------------------------------------------------------------------------------------------

/// The line without its "HH:MM:SS - " prefix.
fn strip_timestamp(line: &str) -> String {
    let line = line.trim();
    match line.split_once(" - ") {
        Some((_, rest)) => rest.trim().to_string(),
        None => line.to_string(),
    }
}

/// Splits "Name: action" or "Name action" into the name and the lower-cased action text.
fn split_player_and_content(line: &str) -> Option<(String, String)> {
    let line = strip_timestamp(line);
    if let Some(colon) = line.find(':') {
        return Some((line[..colon].trim().to_string(), line[colon + 1..].trim().to_lowercase()));
    }
    let space = line.find(' ')?;
    Some((line[..space].trim().to_string(), line[space..].trim().to_lowercase()))
}

/// The action text when `line` is an action of `player`.
fn action_of_player(line: &str, player: &str) -> Option<String> {
    if line.trim().is_empty() {
        return None;
    }
    let line = strip_timestamp(line);
    if starts_with_ic(&line, &format!("{player}:")) {
        return Some(line[player.len() + 1..].trim().to_string());
    }
    if starts_with_ic(&line, &format!("{player} ")) {
        let potential = line[player.len()..].trim();
        let first = potential.split(' ').next().unwrap_or("").to_lowercase();
        if KNOWN_ACTIONS.contains(&first.as_str()) {
            return Some(potential.to_string());
        }
    }
    None
}

fn player_positions(map: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for pair in map.split('|') {
        let parts: Vec<&str> = pair.split(':').collect();
        if let [name, position] = parts[..] {
            out.insert(name.to_lowercase(), position.to_string());
        }
    }
    out
}

fn big_blind(blinds: &str) -> f64 {
    let parts: Vec<&str> = blinds.split('/').collect();
    match parts[..] {
        [_, bb] => bb.trim().parse().unwrap_or(0.0),
        _ => 0.0,
    }
}

// ---------------------------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------------------------

fn matches_verb(content: &str, filter: &str) -> bool {
    let f = filter.to_lowercase();
    match f.as_str() {
        "any" => true,
        "bet" => content.contains("bet"),
        "raise" => content.contains("raise"),
        "check" => content.contains("check"),
        "call" => content.contains("call"),
        "fold" => content.contains("fold"),
        "all-in" => content.contains("all-in"),
        other => content.contains(other),
    }
}

/// Every seat named in the filter must have taken the wanted action at some point.
fn matches_street_by_position(text: &str, btn: &Option<String>, sb: &Option<String>, bb: &Option<String>, hand: &AnalysisHand) -> bool {
    let (btn, sb, bb) = (non_empty(btn), non_empty(sb), non_empty(bb));
    if btn.is_none() && sb.is_none() && bb.is_none() {
        return true;
    }
    if text.is_empty() {
        return false;
    }
    let seats = player_positions(&hand.player_positions);
    let (mut btn_ok, mut sb_ok, mut bb_ok) = (btn.is_none(), sb.is_none(), bb.is_none());

    for line in text.split('\n').filter(|l| !l.is_empty()) {
        let Some((player, content)) = split_player_and_content(line) else { continue };
        let Some(position) = seats.get(&player.to_lowercase()) else { continue };
        match position.as_str() {
            "BTN" if !btn_ok => btn_ok = btn.is_some_and(|f| matches_verb(&content, f)),
            "SB" if !sb_ok => sb_ok = sb.is_some_and(|f| matches_verb(&content, f)),
            "BB" if !bb_ok => bb_ok = bb.is_some_and(|f| matches_verb(&content, f)),
            _ => {}
        }
    }
    btn_ok && sb_ok && bb_ok
}

/// The preflop actions as "POSITION:verb" in order, posts excluded.
fn preflop_sequence(hand: &AnalysisHand) -> Vec<String> {
    let seats = player_positions(&hand.player_positions);
    let mut out = Vec::new();
    for line in hand.preflop.split('\n').filter(|l| !l.is_empty()) {
        let Some((player, content)) = split_player_and_content(line) else { continue };
        let Some(position) = seats.get(&player.to_lowercase()) else { continue };
        let verb = if content.contains("all-in") {
            "all-in"
        } else if content.contains("raises") {
            "raise"
        } else if content.contains("bets") {
            "bet"
        } else if content.contains("calls") {
            "call"
        } else if content.contains("checks") {
            "check"
        } else if content.contains("folds") {
            "fold"
        } else {
            // Posts, antes and anything unknown are skipped.
            continue;
        };
        out.push(format!("{position}:{verb}"));
    }
    out
}

fn matches_action_sequence(hand: &AnalysisHand, sequence: &[String]) -> bool {
    if sequence.is_empty() {
        return true;
    }
    if hand.preflop.is_empty() {
        return false;
    }
    let actual = preflop_sequence(hand);
    actual.len() >= sequence.len() && sequence.iter().zip(&actual).all(|(wanted, got)| wanted.eq_ignore_ascii_case(got))
}

fn matches_situation(hand: &AnalysisHand, situation: &str) -> bool {
    match situation.to_lowercase().as_str() {
        "flop" => !hand.flop.is_empty(),
        "turn" => !hand.turn.is_empty(),
        "river" => !hand.river.is_empty(),
        _ => true,
    }
}

fn matches_action(hand: &AnalysisHand, situation: Option<&str>, action: &str, hero: Option<&str>) -> bool {
    let Some(hero) = hand.hero_name.as_deref().or(hero).filter(|h| !h.is_empty()) else { return false };
    let all = format!("{}\n{}\n{}\n{}", hand.preflop, hand.flop, hand.turn, hand.river);
    let target = match situation.map(str::to_lowercase).as_deref() {
        Some("preflop") => hand.preflop.clone(),
        Some("flop") => hand.flop.clone(),
        Some("turn") => hand.turn.clone(),
        Some("river") => hand.river.clone(),
        _ => all,
    };
    if target.is_empty() {
        return false;
    }
    for line in target.split('\n') {
        if let Some(act) = action_of_player(line, hero) {
            let act = act.to_lowercase();
            match action.to_lowercase().as_str() {
                "bet" => return act.contains("bets"),
                "raise" => return act.contains("raises"),
                "check" => return act.contains("checks"),
                "fold" => return act.contains("folds"),
                "call" => return act.contains("calls"),
                _ => {}
            }
        }
    }
    false
}

/// The hero's first raise, call or all-in before the flop: `(action, amount in big blinds)`.
fn parse_hero_action(hand: &AnalysisHand, hero_position: &str) -> Option<(&'static str, f64)> {
    if hand.preflop.is_empty() || hero_position.is_empty() {
        return None;
    }
    let seats = player_positions(&hand.player_positions);
    let bb = big_blind(&hand.blinds);
    let amount_after = |content: &str, pattern: &regex::Regex| -> Option<f64> {
        pattern.captures(content).and_then(|c| c[1].parse::<f64>().ok())
    };

    for line in hand.preflop.split('\n').filter(|l| !l.is_empty()) {
        let Some((player, content)) = split_player_and_content(line) else { continue };
        let is_hero = hand.hero_name.as_deref().is_some_and(|h| !h.is_empty() && eq_ic(&player, h))
            || (!seats.is_empty() && seats.get(&player.to_lowercase()).is_some_and(|p| eq_ic(p, hero_position)));
        if !is_hero {
            continue;
        }

        let raise_amount = |content: &str| {
            amount_after(content, regex!(r"to\s+(\d+\.?\d*)")).or_else(|| amount_after(content, regex!(r"raises\s+(\d+\.?\d*)")))
        };
        let result = if content.contains("all-in") {
            ("all-in", raise_amount(&content).filter(|_| bb > 0.0).map_or(0.0, |a| a / bb))
        } else if content.contains("raises") {
            ("raise", raise_amount(&content).filter(|_| bb > 0.0).map_or(0.0, |a| a / bb))
        } else if content.contains("calls") {
            ("call", amount_after(&content, regex!(r"(\d+\.?\d*)")).filter(|_| bb > 0.0).map_or(0.0, |a| a / bb))
        } else {
            continue;
        };
        return Some(result);
    }
    None
}

fn matches_situation_id(hand: &AnalysisHand, situation_id: &str, positions: Option<&Vec<String>>) -> bool {
    if situation_id.is_empty() {
        return true;
    }
    if hand.preflop.is_empty() {
        return false;
    }
    let hero_position = positions.and_then(|p| p.first()).map_or(hand.hero_position.as_str(), String::as_str);
    let Some((action, amount_bb)) = parse_hero_action(hand, hero_position) else { return false };

    let id = situation_id.to_lowercase();
    let id = id.as_str();
    if ["rfi", "sb_rfi", "hu_sb_rfi"].contains(&id) {
        return action == "raise" || action == "all-in";
    }
    if ["limp", "vs_btn_limp", "hu_sb_limp"].contains(&id) {
        // Calling about one big blind (the small blind completes for half of one), or all-in.
        return (action == "call" && (0.3..=1.5).contains(&amount_bb)) || action == "all-in";
    }
    if ["vs_sb_open", "vs_btn_open_sb_fold", "vs_btn_open_sb_call"].contains(&id) {
        return matches!(action, "raise" | "all-in" | "call");
    }
    if ["vs_sb_limp", "vs_btn_limp_sb_limp", "vs_btn_limp_sb_fold", "hu_vs_sb_limp"].contains(&id) {
        // The big blind cannot call a limp: any action but folding is a choice.
        return action != "fold";
    }
    true
}

fn opponent_is_reg(conn: &Connection, hand: &AnalysisHand, hero: Option<&str>) -> Result<bool> {
    let Some(hero) = hero.or(hand.hero_name.as_deref()).filter(|h| !h.is_empty()) else { return Ok(false) };
    for pair in hand.player_positions.split('|') {
        let parts: Vec<&str> = pair.split(':').collect();
        if parts.len() < 2 {
            continue;
        }
        let name = parts[0].trim();
        if eq_ic(name, hero) {
            continue;
        }
        // Only the first other player decides.
        let reg = conn.query_row("SELECT is_reg FROM players WHERE name = ?1", [name], |r| r.get::<_, Option<i64>>(0)).ok().flatten();
        return Ok(reg == Some(1));
    }
    Ok(false)
}

fn filter_hands(conn: &Connection, hands: Vec<AnalysisHand>, f: &AnalysisFilters) -> Result<Vec<AnalysisHand>> {
    let mut out = Vec::new();
    'hands: for hand in hands {
        let hero = hand.hero_name.clone().or_else(|| f.hero_name.clone());

        if f.min_stack_bb.is_some() || f.max_stack_bb.is_some() {
            let bb = big_blind(&hand.blinds);
            if bb > 0.0 {
                let stack_bb = hand.hero_stack / bb;
                if f.min_stack_bb.is_some_and(|min| stack_bb < min) || f.max_stack_bb.is_some_and(|max| stack_bb > max) {
                    continue;
                }
            }
        }
        if let Some(kind) = non_empty(&f.opponent_type).filter(|k| *k != "all") {
            let reg = opponent_is_reg(conn, &hand, hero.as_deref())?;
            if (kind == "reg" && !reg) || (kind == "fish" && reg) {
                continue;
            }
        }
        if let Some(situation) = non_empty(&f.situation) {
            if !matches_situation(&hand, situation) {
                continue;
            }
        }
        if let Some(action) = non_empty(&f.action) {
            if !matches_action(&hand, f.situation.as_deref().filter(|s| !s.is_empty()), action, hero.as_deref()) {
                continue;
            }
        }
        match f.action_sequence.as_ref().filter(|s| !s.is_empty()) {
            Some(sequence) => {
                if !matches_action_sequence(&hand, sequence) {
                    continue;
                }
            }
            None => {
                let streets = [
                    (&hand.preflop, &f.preflop_btn_action, &f.preflop_sb_action, &f.preflop_bb_action),
                    (&hand.flop, &f.flop_btn_action, &f.flop_sb_action, &f.flop_bb_action),
                    (&hand.turn, &f.turn_btn_action, &f.turn_sb_action, &f.turn_bb_action),
                    (&hand.river, &f.river_btn_action, &f.river_sb_action, &f.river_bb_action),
                ];
                for (text, btn, sb, bb) in streets {
                    if !matches_street_by_position(text, btn, sb, bb, &hand) {
                        continue 'hands;
                    }
                }
            }
        }
        if let Some(id) = non_empty(&f.situation_id) {
            if !matches_situation_id(&hand, id, f.positions.as_ref()) {
                continue;
            }
        }
        out.push(hand);
    }
    Ok(out)
}

// ---------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------

/// The filtered hands, sorted and paged, with their full details.
pub fn analysis_hands(conn: &Connection, request: &AnalysisHandsRequest) -> Result<Value> {
    let hands = filter_hands(conn, hands_for_analysis(conn, &request.filters)?, &request.filters)?;

    let mut hands = hands;
    let by_f64 = |a: f64, b: f64| a.partial_cmp(&b).unwrap_or(Ordering::Equal);
    match request.sort_by.to_lowercase().as_str() {
        "date_asc" => hands.sort_by(|a, b| a.date.cmp(&b.date)),
        "profit_desc" => hands.sort_by(|a, b| by_f64(b.profit, a.profit)),
        "profit_asc" => hands.sort_by(|a, b| by_f64(a.profit, b.profit)),
        "ev_desc" => hands.sort_by(|a, b| by_f64(b.ev_chips.unwrap_or(0.0), a.ev_chips.unwrap_or(0.0))),
        "ev_asc" => hands.sort_by(|a, b| by_f64(a.ev_chips.unwrap_or(0.0), b.ev_chips.unwrap_or(0.0))),
        _ => hands.sort_by(|a, b| b.date.cmp(&a.date)),
    }

    let total = hands.len() as i64;
    let page = request.page.max(1);
    let limit = if request.limit < 1 { DEFAULT_PAGE_SIZE } else { request.limit };
    let ids: Vec<String> = hands.iter().skip(((page - 1) * limit) as usize).take(limit as usize).map(|h| h.hand_id.clone()).collect();

    let full = hands_query::get_hands_by_ids(conn, &ids, request.filters.hero_name.as_deref())?;
    // The database returns them by date: restore the requested order.
    let ordered: Vec<Value> = ids.iter().filter_map(|id| full.iter().find(|h| h["id"].as_str() == Some(id)).cloned()).collect();

    Ok(json!({ "hands": ordered, "total": total, "page": page, "limit": limit, "pages": (total as f64 / limit as f64).ceil() as i64 }))
}

/// Bets, raises, calls, folds and checks of the hero on one street.
fn count_aggression(text: &str, hero: &str, counts: &mut [u32; 5]) {
    for line in text.split('\n') {
        if let Some(act) = action_of_player(line, hero) {
            let act = act.to_lowercase();
            let slot = if act.contains("bets") {
                0
            } else if act.contains("raises") {
                1
            } else if act.contains("calls") {
                2
            } else if act.contains("folds") {
                3
            } else if act.contains("checks") {
                4
            } else {
                continue;
            };
            counts[slot] += 1;
        }
    }
}

/// Summary statistics and the profit curve of the filtered hands.
pub fn analysis_stats(conn: &Connection, filters: &AnalysisFilters) -> Result<Value> {
    let hands = filter_hands(conn, hands_for_analysis(conn, filters)?, filters)?;
    let total = hands.len();
    let total_profit: f64 = hands.iter().map(|h| h.profit).sum();
    let mut stats = json!({
        "totalHands": total, "totalProfit": total_profit, "vpip": 0.0, "pfr": 0.0, "threeBet": 0.0,
        "wtsd": 0.0, "wsd": 0.0, "aggressionFreq": 0.0, "graphData": [],
    });
    if total == 0 {
        return Ok(stats);
    }

    let mut sorted = hands;
    sorted.sort_by_key(|h| h.date);

    let (mut vpip, mut pfr, mut three_bet, mut three_bet_opp) = (0f64, 0f64, 0f64, 0f64);
    let (mut saw_flop, mut wtsd, mut wsd) = (0f64, 0f64, 0f64);
    let mut aggression = [0u32; 5];
    let mut cumulative = 0.0;
    let mut graph = Vec::with_capacity(total);

    for hand in &sorted {
        let Some(hero) = hand.hero_name.as_deref().or(filters.hero_name.as_deref()).filter(|h| !h.is_empty()) else { continue };

        cumulative += hand.profit;
        graph.push(json!({ "date": hand.date.format("%Y-%m-%d %H:%M:%S").to_string(), "profit": hand.profit, "cumulativeProfit": cumulative }));

        let (mut is_vpip, mut is_pfr, mut is_3bet, mut has_3bet_opp) = (false, false, false, false);
        let mut folded_preflop = false;
        if !hand.preflop.is_empty() {
            // A 3-bet is a raise made facing exactly one earlier raise.
            let mut raises_before = 0;
            for act in parse_actions(&hand.preflop) {
                if act.kind == ActionKind::Post {
                    continue;
                }
                if eq_ic(&act.player, hero) {
                    folded_preflop |= act.kind == ActionKind::Fold;
                    if matches!(act.kind, ActionKind::Call | ActionKind::Raise | ActionKind::Bet) {
                        is_vpip = true;
                    }
                    if act.kind.is_aggressive() {
                        is_pfr = true;
                    }
                    if raises_before == 1 {
                        has_3bet_opp = true;
                        is_3bet |= act.kind.is_aggressive();
                    }
                }
                if act.kind.is_aggressive() {
                    raises_before += 1;
                }
            }
        }
        vpip += f64::from(is_vpip);
        pfr += f64::from(is_pfr);
        three_bet += f64::from(is_3bet);
        three_bet_opp += f64::from(has_3bet_opp);

        // A flop was dealt, but the hero only saw it when he did not fold before.
        if !hand.flop.is_empty() && !folded_preflop {
            saw_flop += 1.0;
            if hand.went_to_showdown {
                wtsd += 1.0;
                if hand.profit > 0.0 {
                    wsd += 1.0;
                }
            }
        }
        for street in [&hand.flop, &hand.turn, &hand.river] {
            count_aggression(street, hero, &mut aggression);
        }
    }

    let n = total as f64;
    let acting: u32 = aggression.iter().sum();
    let object = stats.as_object_mut().expect("an object");
    object.insert("vpip".into(), json!(vpip / n * 100.0));
    object.insert("pfr".into(), json!(pfr / n * 100.0));
    if saw_flop > 0.0 {
        object.insert("wtsd".into(), json!(wtsd / saw_flop * 100.0));
    }
    if wtsd > 0.0 {
        object.insert("wsd".into(), json!(wsd / wtsd * 100.0));
    }
    if acting > 0 {
        object.insert("aggressionFreq".into(), json!(f64::from(aggression[0] + aggression[1]) / f64::from(acting) * 100.0));
    }
    if three_bet_opp > 0.0 {
        object.insert("threeBet".into(), json!(three_bet / three_bet_opp * 100.0));
    }
    object.insert("graphData".into(), Value::Array(graph));
    Ok(stats)
}

// ---------------------------------------------------------------------------------------------
// Range breakdown
// ---------------------------------------------------------------------------------------------

fn normalize_compact_cards(raw: Option<&str>) -> Option<String> {
    let clean: String = raw?.chars().filter(|c| *c != ' ' && *c != ',').collect();
    let chars: Vec<char> = clean.chars().collect();
    if chars.len() != 4 {
        return None;
    }
    normalize_cards(&format!("{}{} {}{}", chars[0].to_ascii_uppercase(), chars[1], chars[2].to_ascii_uppercase(), chars[3]))
}

fn action_amount_bb(act: &str, blinds: &str) -> f64 {
    let bb = big_blind(blinds);
    match regex!(r"to\s+(\d+\.?\d*)").captures(act).and_then(|c| c[1].parse::<f64>().ok()) {
        Some(amount) if bb > 0.0 => amount / bb,
        _ => 0.0,
    }
}

/// How the player first acted on the street under analysis.
fn determine_action_type(hand: &AnalysisHand, situation: Option<&str>, situation_id: Option<&str>, hero: &str) -> &'static str {
    let text = match situation.map(str::to_lowercase).as_deref() {
        None | Some("") | Some("preflop") => &hand.preflop,
        Some("flop") => &hand.flop,
        Some("turn") => &hand.turn,
        Some("river") => &hand.river,
        _ => return "None",
    };
    if text.is_empty() {
        return "None";
    }
    let rfi = situation_id.is_some_and(|id| ["rfi", "sb_rfi", "hu_sb_rfi"].contains(&id.to_lowercase().as_str()));
    for line in text.split('\n') {
        if let Some(act) = action_of_player(line, hero) {
            let act = act.to_lowercase();
            if act.contains("all-in") {
                return "AllIn";
            }
            if act.contains("raises") {
                return if rfi {
                    if action_amount_bb(&act, &hand.blinds) >= 4.0 { "Raise4BB" } else { "Raise2_3BB" }
                } else {
                    "Raise"
                };
            }
            for (word, kind) in [("bets", "Bet"), ("calls", "Call"), ("folds", "Fold"), ("checks", "Check")] {
                if act.contains(word) {
                    return kind;
                }
            }
        }
    }
    "None"
}

/// Hands played, grouped by starting hand, with the action taken.
pub fn range_breakdown(conn: &Connection, filters: &AnalysisFilters) -> Result<Value> {
    let hands = filter_hands(conn, hands_for_analysis(conn, filters)?, filters)?;

    let target_position = filters
        .positions
        .as_ref()
        .and_then(|p| p.first().cloned())
        .or_else(|| filters.action_sequence.as_ref().and_then(|s| s.last()).and_then(|last| last.split(':').next()).map(|p| p.trim().to_string()));

    let mut ranges: BTreeMap<String, Value> = BTreeMap::new();
    for hand in &hands {
        let Some(hero) = hand.hero_name.as_deref().or(filters.hero_name.as_deref()).filter(|h| !h.is_empty()) else { continue };
        if let Some(target) = &target_position {
            if !eq_ic(&hand.hero_position, target) {
                continue;
            }
        }
        let Some(cards) = normalize_compact_cards(hand.hero_cards.as_deref()) else { continue };
        let action = determine_action_type(hand, filters.situation.as_deref(), filters.situation_id.as_deref(), hero);
        if action == "None" {
            continue;
        }

        let entry = ranges.entry(cards.clone()).or_insert_with(|| {
            json!({ "hand": cards, "totalCount": 0, "totalProfit": 0.0, "totalEv": 0.0, "actions": {}, "hands": [] })
        });
        entry["totalCount"] = json!(entry["totalCount"].as_i64().unwrap_or(0) + 1);
        entry["totalProfit"] = json!(entry["totalProfit"].as_f64().unwrap_or(0.0) + hand.profit);
        entry["totalEv"] = json!(entry["totalEv"].as_f64().unwrap_or(0.0) + hand.ev_chips.unwrap_or(0.0));
        entry["hands"].as_array_mut().expect("hands is an array").push(json!({
            "id": hand.hand_id, "date": iso(hand.date), "profit": hand.profit, "ev": hand.ev_chips, "action": action,
        }));
        let count = entry["actions"][action].as_i64().unwrap_or(0) + 1;
        entry["actions"][action] = json!(count);
    }
    Ok(Value::Object(ranges.into_iter().collect()))
}

/// Placeholder range kept for the API (it never depended on the data).
pub fn analyze_range(position: Option<&str>, action: Option<&str>, stack: i64) -> Value {
    json!({
        "position": position.unwrap_or("BTN"), "action": action.unwrap_or("Open"), "stack": stack,
        "range": "22+, A2s+, K5s+, Q8s+, J8s+, T8s+, 98s, A7o+, KTo+, QTo+, JTo",
        "vpip": 24.5, "pfr": 18.2,
    })
}

// ---------------------------------------------------------------------------------------------
// Replayer
// ---------------------------------------------------------------------------------------------

fn clean_cards(raw: &str) -> String {
    raw.replace([' ', '[', ']', '|'], "")
}

struct Replay {
    actions: Vec<Value>,
}

impl Replay {
    fn push(&mut self, mut action: Value) {
        action["order"] = json!(self.actions.len() + 1);
        self.actions.push(action);
    }
}

fn action_value(street: &str, kind: &str) -> Value {
    json!({
        "order": 0, "street": street, "type": kind, "playerName": null, "amount": 0.0,
        "potBefore": 0.0, "potAfter": 0.0, "description": null, "cards": null,
    })
}

/// Adds the actions of one street; returns the pot afterwards.
fn parse_action_text(text: &str, street: &str, initial_pot: f64, replay: &mut Replay) -> f64 {
    let mut pot = initial_pot;
    for line in text.split('\n').filter(|l| !l.is_empty()) {
        let line = strip_timestamp(line);
        let (player, content) = match line.find(':') {
            Some(colon) => (line[..colon].trim().to_string(), line[colon + 1..].trim().to_lowercase()),
            None => match line.find(' ') {
                Some(space) => (line[..space].trim().to_string(), line[space + 1..].trim().to_lowercase()),
                None => continue,
            },
        };
        if player.is_empty() {
            continue;
        }

        let number = |pattern: &regex::Regex| pattern.captures(&content).and_then(|c| c.get(1)).and_then(|m| m.as_str().parse::<f64>().ok());
        let first_number = regex!(r"(\d+\.?\d*)");
        let (mut kind, mut amount) = ("Unknown", 0.0);

        if content.contains("posts sb") || content.contains("posts small blind") {
            (kind, amount) = ("PostSB", number(first_number).unwrap_or(0.0));
        } else if content.contains("posts bb") || content.contains("posts big blind") {
            (kind, amount) = ("PostBB", number(first_number).unwrap_or(0.0));
        } else if content.contains("fold") || content.contains("se couche") {
            kind = "Fold";
        } else if content.contains("check") || content.contains("parole") {
            kind = "Check";
        } else if content.contains("call") || content.contains("paye") || content.contains("suit") {
            (kind, amount) = ("Call", number(first_number).unwrap_or(0.0));
        } else if content.contains("raise") || content.contains("relance") || content.contains("mise") {
            // Only the "to <amount>" form is read; a bare amount leaves 0, as before.
            (kind, amount) = ("Raise", number(regex!(r"to\s+(\d+\.?\d*)|(\d+\.?\d*)")).unwrap_or(0.0));
        } else if content.contains("bet") {
            (kind, amount) = ("Bet", number(first_number).unwrap_or(0.0));
        }
        if content.contains("all-in") || content.contains("all in") || content.contains("tapis") {
            (kind, amount) = ("AllIn", number(first_number).unwrap_or(0.0));
        }
        if kind == "Unknown" {
            continue;
        }

        let added = if matches!(kind, "Call" | "Bet" | "Raise" | "AllIn") { amount } else { 0.0 };
        pot += added;
        let mut action = action_value(street, kind);
        action["playerName"] = json!(player);
        action["amount"] = json!(amount);
        action["potBefore"] = json!(pot - added);
        action["potAfter"] = json!(pot);
        action["description"] = json!(line);
        replay.push(action);
    }
    pot
}

/// A hand laid out as an ordered list of actions with the pot after each.
pub fn hand_replay(conn: &Connection, hand_id: &str, hero_name: Option<&str>) -> Result<Option<Value>> {
    let Some(hand) = hands_query::get_hand_by_id(conn, hand_id, hero_name)? else { return Ok(None) };
    let text = |key: &str| hand[key].as_str().unwrap_or("").to_string();
    let blinds = text("blinds");
    let bb = big_blind(&blinds);
    let sb = bb / 2.0;

    let board: String = ["flop", "turn", "river"].iter().map(|k| text(k)).filter(|s| !s.is_empty()).map(|s| clean_cards(&s)).collect();
    let players: Vec<Value> = hand["players"].as_array().cloned().unwrap_or_default();

    let replay_players: Vec<Value> = players
        .iter()
        .map(|p| {
            let mut cards = clean_cards(p["cards"].as_str().unwrap_or(""));
            cards.truncate(4);
            json!({
                "name": p["name"], "position": p["position"], "initialStack": p["stack"], "cards": cards, "isHero": p["isHero"],
            })
        })
        .collect();

    let mut replay = Replay { actions: Vec::new() };
    let mut deal = action_value("Preflop", "DealCards");
    deal["description"] = json!("Dealing hole cards");
    replay.push(deal);

    let mut pot = 0.0;
    for p in &replay_players {
        let position = p["position"].as_str().unwrap_or("");
        let (kind, amount) = if position.contains("SB") {
            ("PostSB", sb)
        } else if position.contains("BB") {
            ("PostBB", bb)
        } else {
            continue;
        };
        let name = p["name"].as_str().unwrap_or("");
        let mut action = action_value("Preflop", kind);
        action["playerName"] = json!(name);
        action["amount"] = json!(amount);
        action["potBefore"] = json!(pot);
        action["potAfter"] = json!(pot + amount);
        action["description"] = json!(format!("{name} posts {} {amount}", if kind == "PostSB" { "SB" } else { "BB" }));
        replay.push(action);
        pot += amount;
    }

    pot = parse_action_text(&text("preflop_action"), "Preflop", pot, &mut replay);
    for (street, cards_key, action_key) in [("Flop", "flop", "flop_action"), ("Turn", "turn", "turn_action"), ("River", "river", "river_action")] {
        let cards = text(cards_key);
        if cards.is_empty() {
            continue;
        }
        let mut deal = action_value(street, "DealCards");
        deal["cards"] = json!(clean_cards(&cards));
        deal["description"] = json!(format!("{street}: {cards}"));
        replay.push(deal);
        pot = parse_action_text(&text(action_key), street, pot, &mut replay);
    }

    if hand["went_to_showdown"].as_bool().unwrap_or(false) {
        for p in &players {
            let cards = p["cards"].as_str().unwrap_or("");
            if !cards.is_empty() {
                let name = p["name"].as_str().unwrap_or("");
                let mut action = action_value("Showdown", "ShowCards");
                action["playerName"] = json!(name);
                action["cards"] = json!(clean_cards(cards));
                action["description"] = json!(format!("{name} shows {cards}"));
                replay.push(action);
            }
        }
    }

    let winners: Vec<&Value> = players.iter().filter(|p| p["chipsWon"].as_f64().unwrap_or(0.0) > 0.0).collect();
    let total_pot = hand["total_pot"].as_f64().unwrap_or(0.0);
    let collect = |name: &str, amount: f64, pot_before: f64| {
        let mut action = action_value("Showdown", "CollectPot");
        action["playerName"] = json!(name);
        action["amount"] = json!(amount);
        action["potBefore"] = json!(pot_before);
        action["potAfter"] = json!(0.0);
        action["description"] = json!(format!("{name} wins {amount}"));
        action
    };
    if !winners.is_empty() {
        for w in winners {
            replay.push(collect(w["name"].as_str().unwrap_or(""), w["chipsWon"].as_f64().unwrap_or(0.0), pot));
        }
    } else if total_pot > 0.0 {
        let last = text("river_action").split('\n').rev().find(|l| !l.is_empty()).map(str::to_string);
        if let Some(last) = last {
            let winner = last.find(':').filter(|i| *i > 0).map_or("Unknown".to_string(), |i| last[..i].trim().to_string());
            replay.push(collect(&winner, total_pot, pot));
        }
    }

    Ok(Some(json!({
        "handId": text("id"), "room": text("room"), "blinds": blinds, "date": text("date_time"),
        "buyIn": hand["buy_in"].as_f64().unwrap_or(0.0), "players": replay_players, "actions": replay.actions,
        "board": board, "totalPot": total_pot,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hand(preflop: &str, positions: &str) -> AnalysisHand {
        AnalysisHand {
            hand_id: "h".into(),
            hero_name: Some("Hero".into()),
            date: min_date(),
            profit: 0.0,
            preflop: preflop.into(),
            flop: String::new(),
            turn: String::new(),
            river: String::new(),
            hero_position: "BTN".into(),
            hero_stack: 1000.0,
            blinds: "10/20".into(),
            went_to_showdown: false,
            ev_chips: None,
            player_positions: positions.into(),
            hero_cards: None,
        }
    }

    #[test]
    fn lines_of_the_three_formats_are_read() {
        assert_eq!(action_of_player("22:53:09 - Hero: Raises to 680", "Hero").as_deref(), Some("Raises to 680"));
        assert_eq!(action_of_player("Hero raises 20 to 60", "hero").as_deref(), Some("raises 20 to 60"));
        assert_eq!(action_of_player("Heroine raises 20", "Hero"), None, "a name prefix is not the player");
        assert_eq!(action_of_player("", "Hero"), None);
    }

    #[test]
    fn aggression_counts_checks_among_the_actions() {
        let mut counts = [0u32; 5];
        count_aggression("Hero: Checks\nHero: Bets 40\nVillain: Folds", "Hero", &mut counts);
        assert_eq!(counts, [1, 0, 0, 0, 1]);
    }

    #[test]
    fn action_sequences_match_in_order() {
        let h = hand("SB: Posts SB 10\nBB: Posts BB 20\nHero: Raises to 50\nSB: Calls 40\nBB: Folds", "Hero:BTN|SB:SB|BB:BB");
        assert!(matches_action_sequence(&h, &["BTN:raise".into(), "SB:call".into()]));
        assert!(matches_action_sequence(&h, &["btn:Raise".into()]));
        assert!(!matches_action_sequence(&h, &["BTN:call".into()]));
        assert!(!matches_action_sequence(&h, &["BTN:raise".into(), "SB:call".into(), "BB:fold".into(), "BTN:check".into()]));
    }

    #[test]
    fn street_filters_need_every_named_seat_to_act() {
        let h = hand("SB: Posts SB 10\nHero: Raises to 50\nSB: Folds", "Hero:BTN|SB:SB|BB:BB");
        let (btn, sb, bb) = (Some("raise".to_string()), Some("fold".to_string()), None);
        assert!(matches_street_by_position(&h.preflop, &btn, &sb, &bb, &h));
        assert!(!matches_street_by_position(&h.preflop, &btn, &Some("call".to_string()), &bb, &h));
        assert!(matches_street_by_position("", &None, &None, &None, &h));
    }

    #[test]
    fn situations_by_id() {
        let open = hand("Hero: Raises to 50", "Hero:BTN");
        assert!(matches_situation_id(&open, "rfi", None));
        assert!(!matches_situation_id(&open, "limp", None));
        let limp = hand("Hero: Calls 20", "Hero:BTN");
        assert!(matches_situation_id(&limp, "limp", None));
        assert!(!matches_situation_id(&limp, "rfi", None));
        let fold = hand("Hero: Folds", "Hero:BTN");
        assert!(!matches_situation_id(&fold, "rfi", None), "folding is no action here");
    }

    #[test]
    fn range_hands_and_actions() {
        assert_eq!(normalize_compact_cards(Some("As Kh")).as_deref(), Some("AKo"));
        assert_eq!(normalize_compact_cards(Some("AsKs")).as_deref(), Some("AKs"));
        assert_eq!(normalize_compact_cards(Some("As")), None);
        let h = hand("Hero: Raises to 100", "Hero:BTN");
        assert_eq!(determine_action_type(&h, None, Some("rfi"), "Hero"), "Raise4BB");
        assert_eq!(determine_action_type(&h, None, None, "Hero"), "Raise");
        assert_eq!(determine_action_type(&h, Some("flop"), None, "Hero"), "None");
    }

    #[test]
    fn replayer_actions_track_the_pot() {
        let mut replay = Replay { actions: Vec::new() };
        let pot = parse_action_text("22:00:01 - Bob: Raises to 60\n22:00:02 - Ann: Calls 40\nAnn: Folds", "Preflop", 30.0, &mut replay);
        assert_eq!(pot, 130.0);
        assert_eq!(replay.actions.len(), 3);
        assert_eq!(replay.actions[0]["type"], "Raise");
        assert_eq!(replay.actions[0]["potBefore"], 30.0);
        assert_eq!(replay.actions[1]["potAfter"], 130.0);
        assert_eq!(replay.actions[2]["type"], "Fold");
    }
}
