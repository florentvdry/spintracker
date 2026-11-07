//! Reading hands: lists, one hand with its players, a tournament's hands, and the hands played
//! against one opponent.
//!
//! A hand is returned as a JSON object holding the `hands` columns plus the hero's figures
//! (`hero_cards`, `hero_profit`...), with the same keys as the former backend.

use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{Connection, Row, ToSql};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::Result;

/// Players resolved from a name: the player itself or every player linked to the alias.
pub(crate) fn hero_resolution_sql(param: &str) -> String {
    format!(
        "(SELECT name FROM players WHERE name = {param} UNION SELECT p.name FROM players p JOIN aliases a ON p.alias_id = a.id WHERE a.name = {param})"
    )
}

/// Join selecting the hero's row of each hand; without a name, the first player with known cards.
pub(crate) fn hero_join(hero: Option<&str>) -> String {
    match hero {
        Some(_) => format!("CROSS JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name IN {}", hero_resolution_sql("@heroName")),
        None => "JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = h.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)".to_string(),
    }
}

const HAND_FIELDS: &str = "h.*, ph.ev_chips, ph.equity_preflop, ph.equity_flop, ph.equity_turn, ph.equity_river, \
    ph.net_profit as dyn_hero_profit, ph.cards as dyn_hero_cards, ph.position as dyn_hero_position, \
    ph.is_all_in as dyn_hero_all_in, ph.went_to_showdown as dyn_went_to_showdown, ph.player_name as dyn_hero_name";

pub const DEFAULT_PAGE_SIZE: i64 = 50;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HandsQuery {
    pub page: i64,
    pub limit: i64,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub position: Option<String>,
    pub result: Option<String>,
    pub game_type: Option<String>,
    pub min_pot: Option<f64>,
    pub max_pot: Option<f64>,
    pub hero_name: Option<String>,
    pub sort_by: Option<String>,
}

impl Default for HandsQuery {
    fn default() -> Self {
        Self {
            page: 1,
            limit: DEFAULT_PAGE_SIZE,
            date_from: None,
            date_to: None,
            position: None,
            result: None,
            game_type: None,
            min_pot: None,
            max_pot: None,
            hero_name: None,
            sort_by: None,
        }
    }
}

fn non_empty(v: &Option<String>) -> Option<&str> {
    v.as_deref().filter(|s| !s.is_empty())
}

fn params<'a>(binds: &'a [(&'static str, SqlValue)]) -> Vec<(&'a str, &'a dyn ToSql)> {
    binds.iter().map(|(n, v)| (*n, v as &dyn ToSql)).collect()
}

fn json_of(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Integer(i) => json!(i),
        ValueRef::Real(f) => json!(f),
        ValueRef::Text(t) => json!(String::from_utf8_lossy(t)),
        ValueRef::Null | ValueRef::Blob(_) => Value::Null,
    }
}

/// The columns a hand row is built from, looked up by name like a data reader would.
struct Columns<'a> {
    names: Vec<String>,
    row: &'a Row<'a>,
}

impl<'a> Columns<'a> {
    fn new(row: &'a Row<'a>) -> Self {
        Self { names: row.as_ref().column_names().iter().map(|n| n.to_string()).collect(), row }
    }

    fn index(&self, name: &str) -> Option<usize> {
        self.names.iter().position(|n| n.eq_ignore_ascii_case(name))
    }

    fn value(&self, name: &str) -> Option<Value> {
        let i = self.index(name)?;
        self.row.get_ref(i).ok().map(json_of)
    }

    fn text(&self, name: &str) -> Value {
        match self.value(name) {
            Some(v @ Value::String(_)) => v,
            _ => Value::Null,
        }
    }

    fn number(&self, name: &str) -> Value {
        match self.value(name) {
            Some(Value::Number(n)) => json!(n.as_f64()),
            _ => Value::Null,
        }
    }

    fn integer(&self, name: &str) -> Value {
        match self.value(name) {
            Some(Value::Number(n)) => n.as_i64().map_or(Value::Null, |i| json!(i)),
            _ => Value::Null,
        }
    }

    fn flag(&self, name: &str) -> Option<bool> {
        match self.value(name) {
            Some(Value::Number(n)) => Some(n.as_i64() == Some(1)),
            _ => None,
        }
    }
}

const CORE_FIELDS: [&str; 25] = [
    "id", "game_id", "hand_id", "room", "game_mode", "game_type", "game_name", "prize_pool", "multiplier", "buy_in", "date_time",
    "table_id", "blinds", "total_pot", "rake", "preflop_action", "flop", "flop_action", "turn", "turn_action", "river",
    "river_action", "showdown", "result", "player_count",
];

fn hand_json(row: &Row) -> Value {
    let c = Columns::new(row);
    let mut hand = Map::new();
    for field in CORE_FIELDS {
        if let Some(v) = c.value(field) {
            hand.insert(field.into(), v);
        }
    }
    hand.insert("limit_type".into(), c.text("limit_type"));
    hand.insert("game_variant".into(), c.text("game_variant"));
    hand.insert("currency".into(), c.text("currency"));
    hand.insert("button_seat".into(), c.integer("button_seat"));
    hand.insert("ante".into(), c.number("ante"));
    hand.insert("tournament_id".into(), c.text("tournament_id"));
    hand.insert("tournament_name".into(), c.text("tournament_name"));
    hand.insert("tournament_level".into(), c.integer("tournament_level"));
    hand.insert("buyin_currency".into(), c.text("buyin_currency"));
    hand.insert("rake_per_player".into(), c.number("rake_per_player"));
    hand.insert("structured_actions".into(), c.text("structured_actions"));

    hand.insert("hero_position".into(), c.text("dyn_hero_position"));
    hand.insert("opponent_position".into(), c.text("opponent_position"));
    hand.insert("hero_stack".into(), c.number("dyn_hero_stack"));
    hand.insert("hero_cards".into(), c.text("dyn_hero_cards"));
    hand.insert("hero_name".into(), c.text("dyn_hero_name"));
    hand.insert("hero_profit".into(), c.number("dyn_hero_profit"));
    hand.insert("hero_all_in".into(), json!(c.flag("dyn_hero_all_in").unwrap_or(false)));
    hand.insert("went_to_showdown".into(), json!(c.flag("dyn_went_to_showdown").or_else(|| c.flag("went_to_showdown")).unwrap_or(false)));
    hand.insert("ev_chips".into(), c.number("ev_chips"));
    for street in ["equity_preflop", "equity_flop", "equity_turn", "equity_river"] {
        hand.insert(street.into(), c.number(street));
    }
    Value::Object(hand)
}

fn pages(total: i64, limit: i64) -> i64 {
    (total as f64 / limit.max(1) as f64).ceil() as i64
}

/// One page of the hero's hands.
pub fn get_hands(conn: &Connection, q: &HandsQuery) -> Result<Value> {
    let mut clauses = vec!["h.player_count <= 3".to_string()];
    let mut binds: Vec<(&'static str, SqlValue)> = Vec::new();

    let hero = non_empty(&q.hero_name);
    let join = match hero {
        Some(name) => {
            clauses.push(format!("ph.player_name IN {}", hero_resolution_sql("@heroName")));
            binds.push(("@heroName", SqlValue::Text(name.into())));
            " JOIN player_hands ph ON h.id = ph.hand_id".to_string()
        }
        None => format!(" {}", hero_join(None)),
    };

    if let Some(d) = non_empty(&q.date_from) {
        clauses.push("h.date_time >= @dateFrom".into());
        binds.push(("@dateFrom", SqlValue::Text(d.into())));
    }
    if let Some(d) = non_empty(&q.date_to) {
        clauses.push("h.date_time <= @dateTo".into());
        binds.push(("@dateTo", SqlValue::Text(d.into())));
    }
    if let Some(position) = non_empty(&q.position) {
        if position.contains("HU") {
            clauses.push("player_count = 2".into());
        } else if position.contains("3W") {
            clauses.push("player_count >= 3".into());
        }
        let seat = position.split(' ').next_back().unwrap_or("");
        if matches!(seat, "SB" | "BB" | "BTN") {
            // The seat is stored as "SB", "BTN" or "BTN SB".
            clauses.push("(ph.position = @position OR ph.position LIKE @posLike)".into());
            binds.push(("@position", SqlValue::Text(seat.into())));
            binds.push(("@posLike", SqlValue::Text(format!("%({seat})%"))));
        }
    }
    if let Some(t) = non_empty(&q.game_type) {
        clauses.push("game_type = @gameType".into());
        binds.push(("@gameType", SqlValue::Text(t.into())));
    }
    if let Some(p) = q.min_pot {
        clauses.push("total_pot >= @minPot".into());
        binds.push(("@minPot", SqlValue::Real(p)));
    }
    if let Some(p) = q.max_pot {
        clauses.push("total_pot <= @maxPot".into());
        binds.push(("@maxPot", SqlValue::Real(p)));
    }
    match non_empty(&q.result).map(str::to_lowercase).as_deref() {
        Some("won") => clauses.push("ph.net_profit > 0".into()),
        Some("lost") => clauses.push("ph.net_profit < 0".into()),
        _ => {}
    }
    let where_clause = format!("WHERE {}", clauses.join(" AND "));

    let total: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM hands h {join} {where_clause}"), &params(&binds)[..], |r| r.get(0))?;

    let order_by = match q.sort_by.as_deref().filter(|s| !s.is_empty()) {
        Some("date_asc") => "h.date_time ASC",
        Some("cev_asc") => "ev_chips ASC",
        Some("cev_desc") => "ev_chips DESC",
        Some("profit_asc") => "net_profit ASC",
        Some("profit_desc") => "net_profit DESC",
        _ => "h.date_time DESC",
    };
    let limit = q.limit.max(1);
    let offset = (q.page - 1) * limit;
    binds.push(("@limit", SqlValue::Integer(limit)));
    binds.push(("@offset", SqlValue::Integer(offset)));

    let mut stmt = conn.prepare(&format!(
        "SELECT {HAND_FIELDS} FROM hands h {join} {where_clause} ORDER BY {order_by} LIMIT @limit OFFSET @offset"
    ))?;
    let hands: Vec<Value> = stmt.query_map(&params(&binds)[..], |r| Ok(hand_json(r)))?.collect::<std::result::Result<_, _>>()?;

    Ok(json!({ "hands": hands, "total": total, "page": q.page, "limit": q.limit, "pages": pages(total, q.limit) }))
}

/// One hand with every player's figures; `None` when it does not exist (or has more than 3 players).
pub fn get_hand_by_id(conn: &Connection, hand_id: &str, hero_name: Option<&str>) -> Result<Option<Value>> {
    let hero = hero_name.filter(|n| !n.is_empty());
    let join_hero = match hero {
        Some(_) => format!("AND ph.player_name IN {}", hero_resolution_sql("@heroName")),
        None => "AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = h.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)".into(),
    };
    let mut binds: Vec<(&'static str, SqlValue)> = vec![("@handId", SqlValue::Text(hand_id.into()))];
    if let Some(name) = hero {
        binds.push(("@heroName", SqlValue::Text(name.into())));
    }

    let mut stmt = conn.prepare(&format!(
        "SELECT h.*, ph.ev_chips, ph.equity_preflop, ph.equity_flop, ph.equity_turn, ph.equity_river,
                ph.net_profit as dyn_hero_profit, ph.cards as dyn_hero_cards, ph.position as dyn_hero_position,
                ph.is_all_in as dyn_hero_all_in, ph.went_to_showdown as dyn_went_to_showdown, ph.player_name as dyn_hero_name,
                ph.stack as dyn_hero_stack
         FROM hands h
         LEFT JOIN player_hands ph ON h.id = ph.hand_id {join_hero}
         WHERE h.id = @handId AND h.player_count <= 3"
    ))?;
    let mut rows = stmt.query(&params(&binds)[..])?;
    let Some(row) = rows.next()? else { return Ok(None) };
    let mut hand = hand_json(row);
    drop(rows);

    let mut players_stmt = conn.prepare(
        "SELECT player_name, position, stack, cards, investment, chips_won, net_profit, is_all_in, went_to_showdown,
                ev_chips, equity_preflop, equity_flop, equity_turn, equity_river
         FROM player_hands WHERE hand_id = ?1",
    )?;
    let mut is_hero_stmt = conn.prepare(&format!("SELECT 1 WHERE @pName IN {}", hero_resolution_sql("@heroName")))?;
    let mut players = Vec::new();
    let mut rows = players_stmt.query([hand_id])?;
    while let Some(r) = rows.next()? {
        let name: String = r.get(0)?;
        let is_hero = match hero {
            Some(h) => is_hero_stmt.exists(&[("@pName", &name as &dyn ToSql), ("@heroName", &h as &dyn ToSql)][..]).unwrap_or(false),
            None => false,
        };
        let optional = |i: usize| -> rusqlite::Result<Value> { Ok(r.get::<_, Option<f64>>(i)?.map_or(Value::Null, |v| json!(v))) };
        players.push(json!({
            "name": name,
            "position": r.get::<_, Option<String>>(1)?.unwrap_or_default(),
            "stack": r.get::<_, f64>(2)?,
            "cards": r.get::<_, Option<String>>(3)?,
            "investment": r.get::<_, f64>(4)?,
            "chipsWon": r.get::<_, f64>(5)?,
            "netProfit": r.get::<_, f64>(6)?,
            "isAllIn": r.get::<_, i64>(7)? != 0,
            "wentToShowdown": r.get::<_, i64>(8)? != 0,
            "evChips": optional(9)?,
            "equityPreflop": optional(10)?,
            "equityFlop": optional(11)?,
            "equityTurn": optional(12)?,
            "equityRiver": optional(13)?,
            "isHero": is_hero,
        }));
    }
    hand.as_object_mut().expect("a hand is an object").insert("players".into(), Value::Array(players));
    Ok(Some(hand))
}

/// The hero's hands of one tournament, oldest first.
pub fn get_tournament_hands(conn: &Connection, game_id: &str, hero_name: Option<&str>) -> Result<Vec<Value>> {
    let hero = hero_name.filter(|n| !n.is_empty());
    let mut binds: Vec<(&'static str, SqlValue)> = vec![("@gameId", SqlValue::Text(game_id.into()))];
    if let Some(name) = hero {
        binds.push(("@heroName", SqlValue::Text(name.into())));
    }
    let mut stmt = conn.prepare(&format!(
        "SELECT {HAND_FIELDS} FROM hands h {} WHERE h.game_id = @gameId AND h.player_count <= 3 ORDER BY h.date_time ASC",
        hero_join(hero)
    ))?;
    let hands = stmt.query_map(&params(&binds)[..], |r| Ok(hand_json(r)))?.collect::<std::result::Result<_, _>>()?;
    Ok(hands)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HandsAgainstQuery {
    pub hero_name: Option<String>,
    pub limit: i64,
    pub page: i64,
}

impl Default for HandsAgainstQuery {
    fn default() -> Self {
        Self { hero_name: None, limit: DEFAULT_PAGE_SIZE, page: 1 }
    }
}

/// The hands where `opponent` played, from the point of view of that opponent.
pub fn get_hands_against(conn: &Connection, opponent: &str, q: &HandsAgainstQuery) -> Result<Value> {
    let mut clauses = vec!["h.player_count <= 3".to_string(), "ph.player_name = @opponentName".to_string()];
    let mut binds: Vec<(&'static str, SqlValue)> = vec![("@opponentName", SqlValue::Text(opponent.into()))];
    if let Some(hero) = non_empty(&q.hero_name) {
        clauses.push(format!("h.id IN (SELECT hand_id FROM player_hands WHERE player_name IN {})", hero_resolution_sql("@heroName")));
        binds.push(("@heroName", SqlValue::Text(hero.into())));
    }
    let where_clause = format!("WHERE {}", clauses.join(" AND "));

    let total: i64 = conn.query_row(
        &format!("SELECT COUNT(*) FROM hands h JOIN player_hands ph ON h.id = ph.hand_id {where_clause}"),
        &params(&binds)[..],
        |r| r.get(0),
    )?;

    let limit = q.limit.max(1);
    binds.push(("@limit", SqlValue::Integer(limit)));
    binds.push(("@offset", SqlValue::Integer((q.page - 1) * limit)));
    let mut stmt = conn.prepare(&format!(
        "SELECT h.*, ph.ev_chips, ph.equity_preflop, ph.equity_flop, ph.equity_turn, ph.equity_river,
                ph.net_profit as dyn_hero_profit, ph.cards as dyn_hero_cards, ph.position as opponent_position,
                ph.is_all_in as dyn_hero_all_in, ph.went_to_showdown as dyn_went_to_showdown, ph.player_name as dyn_hero_name
         FROM hands h JOIN player_hands ph ON h.id = ph.hand_id
         {where_clause} ORDER BY h.date_time DESC LIMIT @limit OFFSET @offset"
    ))?;
    let hands: Vec<Value> = stmt.query_map(&params(&binds)[..], |r| Ok(hand_json(r)))?.collect::<std::result::Result<_, _>>()?;
    Ok(json!({ "hands": hands, "total": total, "page": q.page, "limit": q.limit, "pages": pages(total, q.limit) }))
}

/// The hero's hands with the given ids (newest first, like the former backend).
pub fn get_hands_by_ids(conn: &Connection, ids: &[String], hero_name: Option<&str>) -> Result<Vec<Value>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let hero = hero_name.filter(|n| !n.is_empty());
    let mut binds: Vec<(String, SqlValue)> = ids.iter().enumerate().map(|(i, id)| (format!("@id{i}"), SqlValue::Text(id.clone()))).collect();
    if let Some(name) = hero {
        binds.push(("@heroName".into(), SqlValue::Text(name.into())));
    }
    let placeholders = (0..ids.len()).map(|i| format!("@id{i}")).collect::<Vec<_>>().join(",");
    let mut stmt = conn.prepare(&format!(
        "SELECT {HAND_FIELDS} FROM hands h {} WHERE h.id IN ({placeholders}) AND h.player_count <= 3 ORDER BY h.date_time DESC",
        hero_join(hero)
    ))?;
    let params: Vec<(&str, &dyn ToSql)> = binds.iter().map(|(n, v)| (n.as_str(), v as &dyn ToSql)).collect();
    let hands = stmt.query_map(&params[..], |r| Ok(hand_json(r)))?.collect::<std::result::Result<_, _>>()?;
    Ok(hands)
}
