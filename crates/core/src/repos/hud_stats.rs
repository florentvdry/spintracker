//! Figures shown by the table HUD: a few preflop stats of a few players.
//!
//! The counting is the one behind the detailed statistics (`detailed_stats::Accumulator`), so a
//! HUD value always equals the matching figure of the Statistics page. Only the hands of one room
//! where one of the hero's accounts was seated are counted: player names are not unique across
//! rooms, and a hand the hero did not play is not data the user collected.

use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, ToSql};
use serde_json::{json, Value};

use std::collections::{HashMap, HashSet};

use super::detailed_stats::{pct, Accumulator, HudPart, Row};
use super::postflop_stats;
use super::hands_query::hero_resolution_sql;
use crate::stats::custom::store as custom_store;
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

/// Sections that are not in the stat registry: the postflop figures, the shove figures (counted from
/// the push/fold flags) and plain hand counts.
const POSTFLOP: &str = "postflop";
const SHOVE: &str = "shove";
const META: &str = "meta";
/// Stats the user defined; the label of a request is the stat id.
const CUSTOM: &str = "custom";
const SHOVE_LABELS: [&str; 5] = ["Open Shove", "Iso Shove", "Rejam", "Call Shove", "Fold vs Shove"];

/// Stack depths a table can be split by, in big blinds: `(name, above, up to and including)`.
/// The player's own stack at the start of the hand is used.
const BUCKETS: [(&str, f64, f64); 6] = [
    ("20+", 20.0, f64::INFINITY),
    ("16-20", 16.0, 20.0),
    ("13-16", 13.0, 16.0),
    ("10-13", 10.0, 13.0),
    ("8-10", 8.0, 10.0),
    ("3-8", 3.0, 8.0),
];

/// Index in `BUCKETS` of a stack in big blinds.
fn bucket_index(bb: f64) -> Option<u8> {
    BUCKETS.iter().position(|(_, above, up_to)| bb > *above && bb <= *up_to).map(|i| i as u8)
}

const COLUMNS: [&str; 8] = ["tot", "hu", "three_way", "btn", "sb_hu", "sb_3w", "bb_hu", "bb_3w"];

/// The columns a row belongs to, as a bit per entry of `COLUMNS`.
fn column_mask(row: &Row) -> u16 {
    let (position, players) = (row.position(), row.player_count());
    let member = [
        true,
        players == 2,
        players == 3,
        position == "BTN",
        position == "SB" && players == 2,
        position == "SB" && players == 3,
        position == "BB" && players == 2,
        position == "BB" && players == 3,
    ];
    member.iter().enumerate().fold(0, |mask, (bit, yes)| if *yes { mask | 1 << bit } else { mask })
}

/// One stat asked for: its section, its label and, where a section has several table columns,
/// which one. `bucket` limits it to one stack depth.
#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HudStatRequest {
    pub section: String,
    pub label: String,
    #[serde(default)]
    pub column: Option<String>,
    #[serde(default)]
    pub bucket: Option<String>,
}

/// Whether a request asks for a stat the user defined.
pub fn is_custom(request: &HudStatRequest) -> bool {
    request.section == CUSTOM
}

/// The catalog plus the stats the user defined (their label is the id, `name` is what to show).
pub fn catalog_with_custom(conn: &Connection) -> Result<Value> {
    let mut catalog = catalog();
    if let Some(stats) = catalog["stats"].as_array_mut() {
        for stat in custom_store::load_all(conn)? {
            stats.push(json!({
                "section": CUSTOM, "label": stat.id.to_string(), "name": stat.def.name, "id": format!("{CUSTOM}:{}", stat.id),
                "fixedSeat": false, "ready": stat.ready,
            }));
        }
    }
    Ok(catalog)
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
    let mut stats = stats;
    for name in postflop_stats::figure_names() {
        stats.push(json!({ "section": POSTFLOP, "label": name, "id": format!("{POSTFLOP}:{name}"), "fixedSeat": false }));
    }
    for label in SHOVE_LABELS {
        stats.push(json!({ "section": SHOVE, "label": label, "id": format!("{SHOVE}:{label}"), "fixedSeat": false }));
    }
    stats.push(json!({ "section": META, "label": "hands", "id": format!("{META}:hands"), "fixedSeat": false }));
    json!({ "stats": stats, "buckets": BUCKETS.map(|(name, _, _)| name) })
}

/// The custom-stat hits of a player by hand.
fn load_custom_hits(conn: &Connection, player: &str) -> Result<HashMap<String, Vec<(i64, u8)>>> {
    let mut hits: HashMap<String, Vec<(i64, u8)>> = HashMap::new();
    let mut stmt = conn.prepare_cached("SELECT hand_id, stat_id, bits FROM custom_stat_hits WHERE player_name = ?1")?;
    let rows = stmt.query_map([player], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)? as u8)))?;
    for row in rows {
        let (hand, stat, bits) = row?;
        hits.entry(hand).or_default().push((stat, bits));
    }
    Ok(hits)
}

/// Everything the HUD needs of one player: the rows of the hands that count. `with_custom` also
/// reads the hits of the custom stats; a request that asks for none pays nothing for them.
pub(crate) fn load_rows(conn: &Connection, room: &str, hero: &str, player: &str, with_custom: bool) -> Result<Vec<Row>> {
    Ok(query_rows(conn, room, hero, player, with_custom, false)?.into_iter().map(|hand| hand.row).collect())
}

/// A row with the hand it comes from, for listing the hands behind a figure.
pub(crate) struct HandRow {
    pub hand_id: String,
    pub played_at: String,
    pub row: Row,
}

/// The rows of `load_rows`, each with its hand id and date. Read on demand, never cached: only a
/// list of hands needs them.
pub(crate) fn load_identified_rows(conn: &Connection, room: &str, hero: &str, player: &str, with_custom: bool) -> Result<Vec<HandRow>> {
    query_rows(conn, room, hero, player, with_custom, true)
}

/// The hand id and date are read only when asked for (or, for the id, when custom hits are joined):
/// the figures of the HUD do not need them.
fn query_rows(conn: &Connection, room: &str, hero: &str, player: &str, with_custom: bool, with_ids: bool) -> Result<Vec<HandRow>> {
    let hand_column = if with_custom || with_ids { "ph.hand_id" } else { "NULL" };
    let date_column = if with_ids { "h.date_time" } else { "NULL" };
    let sql = format!(
        "SELECT h.player_count, ph.position, f.flags_0, f.flags_1, f.flags_2, f.flags_3, f.street_counts, ph.stack, h.blinds, {hand_column}, {date_column}
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
    let mut custom = if with_custom { load_custom_hits(conn, player)? } else { HashMap::new() };
    let mut stmt = conn.prepare_cached(&sql)?;
    let rows = stmt
        .query_map(&params[..], |r| {
            let word = |i: usize| -> rusqlite::Result<u64> { Ok(r.get::<_, Option<i64>>(i)?.unwrap_or(0) as u64) };
            let position: Option<String> = r.get(1)?;
            let flags = Flags::from_words([word(2)?, word(3)?, word(4)?, word(5)?]);
            let blinds: Option<String> = r.get(8)?;
            let hand: Option<String> = r.get(9)?;
            let played_at: Option<String> = r.get(10)?;
            let hits = if with_custom { hand.as_deref().and_then(|id| custom.remove(id)).unwrap_or_default() } else { Vec::new() };
            let row = Row::lean(
                r.get::<_, Option<i32>>(0)?.unwrap_or(0),
                position.as_deref().unwrap_or(""),
                flags,
                word(6)?,
                r.get::<_, Option<i64>>(7)?.unwrap_or(0),
                blinds.as_deref().unwrap_or(""),
            )
            .with_custom(hits);
            Ok(HandRow { hand_id: hand.unwrap_or_default(), played_at: played_at.unwrap_or_default(), row })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Rows grouped the way the requests ask: by stack depth and, for figures counted over the rows of
/// a table column, by that column. Each group is counted once, however many figures read it.
struct Groups<'a> {
    rows: &'a [Row],
    /// Stack depth and column membership of each row, worked out once.
    buckets: Vec<Option<u8>>,
    masks: Vec<u16>,
    counted: HashMap<(Option<String>, Option<String>, HudPart), Accumulator>,
}

impl<'a> Groups<'a> {
    fn new(rows: &'a [Row]) -> Self {
        let buckets = rows.iter().map(|r| r.stack_bb().and_then(bucket_index)).collect();
        let masks = rows.iter().map(column_mask).collect();
        Groups { rows, buckets, masks, counted: HashMap::new() }
    }

    fn get(&mut self, bucket: Option<&str>, column: Option<&str>, part: HudPart) -> &Accumulator {
        let key = (bucket.map(str::to_string), column.map(str::to_string), part);
        let (rows, buckets, masks) = (self.rows, &self.buckets, &self.masks);
        // Unknown names select nothing; callers check them first.
        let wanted_bucket = bucket.map(|b| BUCKETS.iter().position(|(name, _, _)| *name == b).map_or(u8::MAX, |i| i as u8));
        let wanted_bit = column.map(|c| COLUMNS.iter().position(|name| *name == c).map_or(0, |i| 1u16 << i));
        self.counted.entry(key).or_insert_with(|| {
            let mut acc = Accumulator::new();
            for (i, row) in rows.iter().enumerate() {
                let in_bucket = wanted_bucket.map_or(true, |b| buckets[i] == Some(b));
                let in_column = wanted_bit.map_or(true, |bit| masks[i] & bit != 0);
                if in_bucket && in_column {
                    acc.consume_hud(row, part);
                }
            }
            acc
        })
    }
}

fn counts_of(groups: &mut Groups, req: &HudStatRequest, ready: &HashSet<i64>) -> Option<(u64, u64)> {
    let bucket = req.bucket.as_deref();
    if bucket.is_some_and(|b| !BUCKETS.iter().any(|(name, _, _)| *name == b)) {
        return None;
    }
    let column = req.column.as_deref();
    match req.section.as_str() {
        CUSTOM => {
            // A stat still being computed has no figure yet.
            let id: i64 = req.label.parse().ok().filter(|id| ready.contains(id))?;
            if column.is_some_and(|c| !COLUMNS.contains(&c)) {
                return None;
            }
            Some(groups.get(bucket, column, HudPart::Custom).custom_counts(id))
        }
        POSTFLOP | SHOVE | META => {
            // Figures counted over the rows of one column: unknown columns are refused.
            if column.is_some_and(|c| !COLUMNS.contains(&c)) {
                return None;
            }
            match req.section.as_str() {
                POSTFLOP => groups.get(bucket, column, HudPart::Postflop).postflop_counts(&req.label),
                SHOVE => groups.get(bucket, column, HudPart::Shove).shove_counts(&req.label),
                _ => {
                    let rows = groups.get(bucket, column, HudPart::Rows).row_count();
                    (req.label == "hands").then_some((rows, rows))
                }
            }
        }
        other => parse_section(other).and_then(|section| groups.get(bucket, None, HudPart::Preflop).counts(section, &req.label, column)),
    }
}

/// Which hands behind a figure to list.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HandsOf {
    /// The hands the figure counts in its numerator: where the player did it.
    Done,
    /// The hands it counts in its denominator: every chance the player had to do it.
    Chances,
}

/// A hand behind a figure, and whether the player did what the figure counts in it (always so for
/// [`HandsOf::Done`]; a chance may have been let go).
pub(crate) struct FigureHand {
    pub hand_id: String,
    pub done: bool,
}

/// The newest hands behind a figure, at most `limit`, and how many there are in all. Each hand is
/// counted on its own with the very code that counts the figure, so a list can never disagree with
/// the number shown. `buckets` are the stack depths of a group (several add up), none meaning the
/// request's own.
pub(crate) fn figure_hand_ids(rows: &[HandRow], request: &HudStatRequest, buckets: &[String], ready: &HashSet<i64>, which: HandsOf, limit: usize) -> (Vec<FigureHand>, u64) {
    let mut newest: Vec<&HandRow> = rows.iter().collect();
    newest.sort_by(|a, b| b.played_at.cmp(&a.played_at).then_with(|| a.hand_id.cmp(&b.hand_id)));
    let depths: Vec<Option<String>> = if buckets.is_empty() { vec![request.bucket.clone()] } else { buckets.iter().cloned().map(Some).collect() };

    let mut listed = Vec::new();
    let mut total = 0;
    for hand in newest {
        let mut groups = Groups::new(std::slice::from_ref(&hand.row));
        let (mut done, mut chance) = (false, false);
        for bucket in &depths {
            let asked = HudStatRequest { bucket: bucket.clone(), ..request.clone() };
            if let Some((num, den)) = counts_of(&mut groups, &asked, ready) {
                done |= num > 0;
                chance |= den > 0;
            }
        }
        let counted = match which {
            HandsOf::Done => done,
            HandsOf::Chances => chance,
        };
        if counted {
            total += 1;
            if listed.len() < limit {
                listed.push(FigureHand { hand_id: hand.hand_id.clone(), done });
            }
        }
    }
    (listed, total)
}

/// The requested figures of one player over `rows`: `(hands, one entry per requested stat)`.
/// `ready` holds the ids of the custom stats whose figures are up to date.
pub(crate) fn compute(rows: &[Row], requests: &[HudStatRequest], ready: &HashSet<i64>) -> (u64, Vec<Value>) {
    let mut groups = Groups::new(rows);
    let hands = rows.len() as u64;
    let stats = requests
        .iter()
        .map(|req| match counts_of(&mut groups, req, ready) {
            Some((num, den)) => json!({
                "section": req.section, "label": req.label, "column": req.column, "bucket": req.bucket,
                "num": num, "den": den, "pct": pct(num, den),
            }),
            None => json!({
                "section": req.section, "label": req.label, "column": req.column, "bucket": req.bucket,
                "num": null, "den": null, "pct": null,
            }),
        })
        .collect();
    (hands, stats)
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
