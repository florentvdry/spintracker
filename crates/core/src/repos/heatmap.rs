//! Profit by starting hand ("AKs", "77", "T9o").

use std::collections::BTreeMap;

use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, ToSql};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::hands_query::hero_resolution_sql;
use crate::Result;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RangeHeatmapQuery {
    pub hero_name: Option<String>,
}

const RANK_ORDER: &str = "AKQJT98765432";

/// "As Kh" -> "AKo": ranks high to low, then `s` for suited, `o` for offsuit, nothing for pairs.
pub fn normalize_cards(raw: &str) -> Option<String> {
    let parts: Vec<&str> = raw.split(' ').filter(|p| !p.is_empty()).collect();
    let [a, b] = parts[..] else { return None };
    let (mut c1, mut c2) = (a.chars(), b.chars());
    let (mut r1, mut s1, mut r2, mut s2) = (c1.next()?, c1.next()?, c2.next()?, c2.next()?);
    let (i1, i2) = (RANK_ORDER.find(r1)?, RANK_ORDER.find(r2)?);
    if i1 > i2 {
        std::mem::swap(&mut r1, &mut r2);
        std::mem::swap(&mut s1, &mut s2);
    }
    Some(if r1 == r2 {
        format!("{r1}{r2}")
    } else if s1 == s2 {
        format!("{r1}{r2}s")
    } else {
        format!("{r1}{r2}o")
    })
}

pub fn range_heatmap(conn: &Connection, q: &RangeHeatmapQuery) -> Result<Value> {
    let hero = q.hero_name.as_deref().filter(|h| !h.is_empty());
    let (join, binds): (String, Vec<(&str, SqlValue)>) = match hero {
        Some(name) => (
            format!("JOIN player_hands ph ON hands.id = ph.hand_id AND ph.player_name IN {}", hero_resolution_sql("@heroName")),
            vec![("@heroName", SqlValue::Text(name.into()))],
        ),
        None => (
            "JOIN player_hands ph ON hands.id = ph.hand_id AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = hands.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)".into(),
            Vec::new(),
        ),
    };
    let mut stmt = conn.prepare(&format!(
        "SELECT ph.cards, ph.net_profit FROM hands {join} WHERE ph.cards IS NOT NULL AND ph.cards != '' AND hands.player_count <= 3"
    ))?;
    let params: Vec<(&str, &dyn ToSql)> = binds.iter().map(|(n, v)| (*n, v as &dyn ToSql)).collect();
    let mut entries: BTreeMap<String, (i64, f64)> = BTreeMap::new();
    let mut rows = stmt.query(&params[..])?;
    while let Some(r) = rows.next()? {
        let (cards, profit): (String, f64) = (r.get(0)?, r.get(1)?);
        if let Some(hand) = normalize_cards(&cards) {
            let e = entries.entry(hand).or_default();
            e.0 += 1;
            e.1 += profit;
        }
    }
    Ok(Value::Object(
        entries
            .into_iter()
            .map(|(hand, (count, total))| (hand, json!({ "count": count, "total_profit": total, "avg_profit": total / count as f64 })))
            .collect(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hands_are_normalised() {
        assert_eq!(normalize_cards("As Kh").as_deref(), Some("AKo"));
        assert_eq!(normalize_cards("Kh As").as_deref(), Some("AKo"));
        assert_eq!(normalize_cards("9d Td").as_deref(), Some("T9s"));
        assert_eq!(normalize_cards("7c 7s").as_deref(), Some("77"));
        assert_eq!(normalize_cards("As"), None);
        assert_eq!(normalize_cards("Xs Kh"), None);
    }
}
