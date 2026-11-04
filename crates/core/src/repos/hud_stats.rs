//! Figures shown by the table HUD: a few preflop stats of a few players.
//!
//! The counting is the one behind the detailed statistics (`detailed_stats::Accumulator`), so a
//! HUD value always equals the matching figure of the Statistics page. Only the hands of one room
//! where one of the hero's accounts was seated are counted: player names are not unique across
//! rooms, and a hand the hero did not play is not data the user collected.

use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, ToSql};
use serde_json::{json, Value};

use super::detailed_stats::{pct, Accumulator, Row};
use super::hands_query::hero_resolution_sql;
use crate::stats::flags::Flags;
use crate::stats::registry::{Section, STATS};
use crate::Result;

/// Sections whose stats the HUD can show (the postflop ones are not counted for it).
const SECTIONS: [(Section, &str); 6] = [
    (Section::Preflop, "preflop"),
    (Section::HuSb, "huSb"),
    (Section::HuBb, "huBb"),
    (Section::ThreeWayPreflop, "threeWayPreflop"),
    (Section::Steal, "steal"),
    (Section::VsSteal, "vsSteal"),
];

pub fn section_key(section: Section) -> Option<&'static str> {
    SECTIONS.iter().find(|(s, _)| *s == section).map(|(_, key)| *key)
}

pub fn parse_section(key: &str) -> Option<Section> {
    SECTIONS.iter().find(|(_, k)| *k == key).map(|(section, _)| *section)
}

/// One stat asked for: its section, its label in the registry and, where a section has several
/// table columns, which one.
#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HudStatRequest {
    pub section: String,
    pub label: String,
    #[serde(default)]
    pub column: Option<String>,
}

/// The stats the HUD can display, straight from the registry.
pub fn catalog() -> Value {
    let stats: Vec<Value> = STATS
        .iter()
        .filter_map(|def| {
            let section = section_key(def.section)?;
            Some(json!({
                "section": section,
                "label": def.label,
                "id": format!("{section}:{}", def.label),
                // Whether the registry fixes the table seat of the stat.
                "fixedSeat": def.segment.is_some(),
            }))
        })
        .collect();
    json!({ "stats": stats })
}

/// Everything the HUD needs of one player: the rows of the hands that count.
pub(crate) fn load_rows(conn: &Connection, room: &str, hero: &str, player: &str) -> Result<Vec<Row>> {
    let sql = format!(
        "SELECT h.player_count, ph.position, f.flags_0, f.flags_1, f.flags_2, f.flags_3
         FROM player_hands ph
         JOIN hands h ON h.id = ph.hand_id
         LEFT JOIN hand_player_flags f ON f.hand_id = ph.hand_id AND f.player_name = ph.player_name
         WHERE ph.player_name = @player AND h.room = @room AND h.player_count IN (2, 3)
           AND EXISTS (SELECT 1 FROM player_hands hp WHERE hp.hand_id = h.id AND hp.player_name IN {})",
        hero_resolution_sql("@hero")
    );
    let binds: [(&str, SqlValue); 3] = [
        ("@player", SqlValue::Text(player.into())),
        ("@room", SqlValue::Text(room.into())),
        ("@hero", SqlValue::Text(hero.into())),
    ];
    let params: Vec<(&str, &dyn ToSql)> = binds.iter().map(|(n, v)| (*n, v as &dyn ToSql)).collect();
    let mut stmt = conn.prepare_cached(&sql)?;
    let rows = stmt
        .query_map(&params[..], |r| {
            let word = |i: usize| -> rusqlite::Result<u64> { Ok(r.get::<_, Option<i64>>(i)?.unwrap_or(0) as u64) };
            let position: Option<String> = r.get(1)?;
            let flags = Flags::from_words([word(2)?, word(3)?, word(4)?, word(5)?]);
            Ok(Row::lean(r.get::<_, Option<i32>>(0)?.unwrap_or(0), position.as_deref().unwrap_or(""), flags))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// The requested figures of one player over `rows`: `(hands, one entry per requested stat)`.
pub(crate) fn compute(rows: &[Row], requests: &[HudStatRequest]) -> (u64, Vec<Value>) {
    let mut acc = Accumulator::new();
    for row in rows {
        acc.consume_preflop(row);
    }
    let stats = requests
        .iter()
        .map(|req| {
            let counts = parse_section(&req.section).and_then(|s| acc.counts(s, &req.label, req.column.as_deref()));
            match counts {
                Some((num, den)) => json!({
                    "section": req.section, "label": req.label, "column": req.column,
                    "num": num, "den": den, "pct": pct(num, den),
                }),
                None => json!({ "section": req.section, "label": req.label, "column": req.column, "num": null, "den": null, "pct": null }),
            }
        })
        .collect();
    (acc.hand_count(), stats)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_catalog_lists_registry_stats_with_unique_ids() {
        let catalog = catalog();
        let ids: Vec<&str> = catalog["stats"].as_array().unwrap().iter().map(|s| s["id"].as_str().unwrap()).collect();
        assert!(ids.contains(&"preflop:VPIP") && ids.contains(&"threeWayPreflop:BTN RFI"));
        let unique: std::collections::HashSet<_> = ids.iter().collect();
        assert_eq!(unique.len(), ids.len());
    }

    #[test]
    fn section_keys_round_trip() {
        for (section, key) in SECTIONS {
            assert_eq!(parse_section(key), Some(section));
            assert_eq!(section_key(section), Some(key));
        }
        assert_eq!(parse_section("flop"), None);
    }
}
