//! Custom stats in the database: definitions, per-hand hits and their recomputation.
//!
//! A stat is "ready" when `computed_hash` equals `definition_hash`: its hits were computed for the
//! current definition over every hand. Editing a definition clears its hits and makes it pending
//! again, so a recomputation that was interrupted is simply started over.

use std::collections::HashSet;

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, OptionalExtension, ToSql};
use serde_json::{json, Value};

use super::eval::{CompiledStat, HandContext, SeatContext, DEN_BIT, NUM_BIT};
use super::model::{definition_hash, parse_definition, CustomStatDef, MAX_CUSTOM_STATS};
use crate::engines::actions::parse_actions;
use crate::stats::flags::Flags;
use crate::Result;

/// Hands processed per transaction while recomputing.
const RECOMPUTE_BATCH: usize = 500;
/// Hands a preview looks at (the most recent ones).
pub const PREVIEW_HANDS: i64 = 2000;

/// A stat as read from the database.
pub struct StoredStat {
    pub id: i64,
    pub def: CustomStatDef,
    pub ready: bool,
    compiled: CompiledStat,
}

/// A problem caused by what the user asked, as opposed to a failure of the database.
#[derive(Debug)]
pub enum SaveError {
    Invalid(String),
    Internal(crate::Error),
}

impl From<rusqlite::Error> for SaveError {
    fn from(e: rusqlite::Error) -> Self {
        SaveError::Internal(e.into())
    }
}

impl From<crate::Error> for SaveError {
    fn from(e: crate::Error) -> Self {
        SaveError::Internal(e)
    }
}

/// Every stored definition; rows that no longer validate are skipped (and logged).
pub fn load_all(conn: &Connection) -> Result<Vec<StoredStat>> {
    let mut stmt = conn.prepare_cached("SELECT id, definition, definition_hash, computed_hash FROM custom_stats ORDER BY id")?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?)))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let mut stats = Vec::with_capacity(rows.len());
    for (id, json, hash, computed) in rows {
        let parsed = serde_json::from_str::<Value>(&json).map_err(|e| e.to_string()).and_then(|v| parse_definition(&v));
        match parsed {
            Ok(def) => stats.push(StoredStat { id, compiled: CompiledStat::new(&def), def, ready: hash == computed }),
            Err(e) => log::warn!("[custom stats] stat {id} skipped: {e}"),
        }
    }
    Ok(stats)
}

/// Ids of the stats whose hits are up to date.
pub fn ready_ids(conn: &Connection) -> Result<HashSet<i64>> {
    let mut stmt = conn.prepare_cached("SELECT id FROM custom_stats WHERE definition_hash = computed_hash")?;
    let ids = stmt.query_map([], |r| r.get::<_, i64>(0))?.collect::<std::result::Result<HashSet<_>, _>>()?;
    Ok(ids)
}

pub fn count(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row("SELECT COUNT(*) FROM custom_stats", [], |r| r.get(0))?)
}

/// Number of stats still waiting for their hits.
pub fn pending_count(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row("SELECT COUNT(*) FROM custom_stats WHERE definition_hash != computed_hash", [], |r| r.get(0))?)
}

/// The stats for the API: id, name, definition and whether the figures are ready.
pub fn list_json(conn: &Connection) -> Result<Vec<Value>> {
    Ok(load_all(conn)?
        .into_iter()
        .map(|s| json!({ "id": s.id, "name": s.def.name, "definition": s.def, "ready": s.ready }))
        .collect())
}

fn name_taken(conn: &Connection, name: &str, except: i64) -> Result<bool> {
    let found: Option<i64> = conn
        .query_row("SELECT id FROM custom_stats WHERE name = ?1 AND id != ?2", params![name, except], |r| r.get(0))
        .optional()?;
    Ok(found.is_some())
}

/// Stores a new stat (pending until it is computed) and returns its id.
pub fn create(conn: &Connection, def: &CustomStatDef) -> std::result::Result<i64, SaveError> {
    def.validate().map_err(SaveError::Invalid)?;
    if count(conn)? as usize >= MAX_CUSTOM_STATS {
        return Err(SaveError::Invalid(format!("at most {MAX_CUSTOM_STATS} custom stats")));
    }
    if name_taken(conn, &def.name, 0)? {
        return Err(SaveError::Invalid("a custom stat already has this name".into()));
    }
    conn.execute(
        "INSERT INTO custom_stats (name, definition, definition_hash) VALUES (?1, ?2, ?3)",
        params![def.name, def.to_json(), definition_hash(def)],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Replaces a definition. The hits are dropped when its meaning changed. `false` for an unknown id.
pub fn update(conn: &Connection, id: i64, def: &CustomStatDef) -> std::result::Result<bool, SaveError> {
    def.validate().map_err(SaveError::Invalid)?;
    if name_taken(conn, &def.name, id)? {
        return Err(SaveError::Invalid("a custom stat already has this name".into()));
    }
    let previous: Option<String> = conn.query_row("SELECT definition_hash FROM custom_stats WHERE id = ?1", [id], |r| r.get(0)).optional()?;
    let Some(previous) = previous else { return Ok(false) };
    let hash = definition_hash(def);
    if previous != hash {
        conn.execute("DELETE FROM custom_stat_hits WHERE stat_id = ?1", [id])?;
        conn.execute(
            "UPDATE custom_stats SET name = ?2, definition = ?3, definition_hash = ?4, computed_hash = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![id, def.name, def.to_json(), hash],
        )?;
    } else {
        conn.execute("UPDATE custom_stats SET name = ?2, definition = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?1", params![id, def.name, def.to_json()])?;
    }
    Ok(true)
}

/// Makes every stat pending again (the flags they read were recomputed). Their hits are
/// dropped by the next recomputation.
pub fn invalidate_all(conn: &Connection) -> Result<()> {
    conn.execute("UPDATE custom_stats SET computed_hash = ''", [])?;
    Ok(())
}

pub fn delete(conn: &Connection, id: i64) -> Result<bool> {
    conn.execute("DELETE FROM custom_stat_hits WHERE stat_id = ?1", [id])?;
    Ok(conn.execute("DELETE FROM custom_stats WHERE id = ?1", [id])? > 0)
}

/// One player's hits of every stat for a hand: `(stat id, player, bits)`.
pub fn hits_for_hand(stats: &[StoredStat], hand: &HandContext, seats: &[SeatContext]) -> Vec<(i64, String, u8)> {
    let mut hits = Vec::new();
    for seat in seats {
        for stat in stats {
            let bits = stat.compiled.evaluate(hand, seat);
            if bits != 0 {
                hits.push((stat.id, seat.name.to_string(), bits));
            }
        }
    }
    hits
}

pub fn save_hits(conn: &Connection, hand_id: &str, hits: &[(i64, String, u8)]) -> Result<()> {
    let mut stmt = conn.prepare_cached("INSERT OR REPLACE INTO custom_stat_hits (stat_id, hand_id, player_name, bits) VALUES (?1, ?2, ?3, ?4)")?;
    for (stat_id, player, bits) in hits {
        stmt.execute(params![stat_id, hand_id, player, bits])?;
    }
    Ok(())
}

/// Removes every hit (used when the hands are wiped).
pub fn delete_all(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM custom_stat_hits", [])?;
    Ok(())
}

/// A hand read back from the database, with the flags of its players.
struct StoredHand {
    preflop: String,
    flop: String,
    turn: String,
    river: String,
    blinds: String,
    player_count: i32,
    seats: Vec<(String, String, i64, Flags)>,
}

fn load_hand(conn: &Connection, id: &str) -> Result<Option<StoredHand>> {
    let mut hand_stmt = conn.prepare_cached(
        "SELECT COALESCE(preflop_action, ''), COALESCE(flop_action, ''), COALESCE(turn_action, ''), COALESCE(river_action, ''),
                COALESCE(blinds, ''), COALESCE(player_count, 2)
         FROM hands WHERE id = ?1",
    )?;
    let head = hand_stmt
        .query_row([id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, i32>(5)?)))
        .optional()?;
    let Some((preflop, flop, turn, river, blinds, player_count)) = head else { return Ok(None) };
    let mut seat_stmt = conn.prepare_cached(
        "SELECT ph.player_name, COALESCE(ph.position, ''), COALESCE(ph.stack, 0),
                COALESCE(f.flags_0, 0), COALESCE(f.flags_1, 0), COALESCE(f.flags_2, 0), COALESCE(f.flags_3, 0)
         FROM player_hands ph
         LEFT JOIN hand_player_flags f ON f.hand_id = ph.hand_id AND f.player_name = ph.player_name
         WHERE ph.hand_id = ?1",
    )?;
    let seats = seat_stmt
        .query_map([id], |r| {
            let word = |i: usize| -> rusqlite::Result<u64> { Ok(r.get::<_, i64>(i)? as u64) };
            Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)?, Flags::from_words([word(3)?, word(4)?, word(5)?, word(6)?])))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(Some(StoredHand { preflop, flop, turn, river, blinds, player_count, seats }))
}

fn evaluate_stored(stats: &[StoredStat], hand: &StoredHand) -> Vec<(i64, String, u8)> {
    let streets = [hand.preflop.as_str(), hand.flop.as_str(), hand.turn.as_str(), hand.river.as_str()];
    evaluate_hand(stats, streets, &hand.blinds, hand.player_count, &hand.seats)
}

/// Hits of every stat for a hand given as the texts of its four streets and its seats `(name,
/// position, stack, flags)`.
pub fn evaluate_hand(stats: &[StoredStat], streets: [&str; 4], blinds: &str, player_count: i32, seats: &[(String, String, i64, Flags)]) -> Vec<(i64, String, u8)> {
    if stats.is_empty() {
        return Vec::new();
    }
    let [preflop, flop, turn, river] = streets.map(parse_actions);
    let context = HandContext { preflop: &preflop, flop: &flop, turn: &turn, river: &river, blinds, player_count };
    let seats: Vec<SeatContext> =
        seats.iter().map(|(name, position, stack, flags)| SeatContext { name, position, stack: *stack, flags: *flags }).collect();
    hits_for_hand(stats, &context, &seats)
}

/// Computes the hits of every pending stat over all hands. `progress(done, total)` is called
/// after each batch. Returns the number of hands processed.
pub fn recompute_pending(conn: &mut Connection, mut progress: impl FnMut(u64, u64)) -> Result<u64> {
    let pending: Vec<StoredStat> = load_all(conn)?.into_iter().filter(|s| !s.ready).collect();
    if pending.is_empty() {
        return Ok(0);
    }
    for stat in &pending {
        conn.execute("DELETE FROM custom_stat_hits WHERE stat_id = ?1", [stat.id])?;
    }
    let ids: Vec<String> = {
        let mut stmt = conn.prepare("SELECT id FROM hands")?;
        let ids = stmt.query_map([], |r| r.get::<_, String>(0))?.collect::<std::result::Result<_, _>>()?;
        ids
    };
    let total = ids.len() as u64;
    let mut done = 0u64;
    for chunk in ids.chunks(RECOMPUTE_BATCH) {
        let tx = conn.transaction()?;
        for id in chunk {
            if let Some(hand) = load_hand(&tx, id)? {
                save_hits(&tx, id, &evaluate_stored(&pending, &hand))?;
            }
        }
        tx.commit()?;
        done += chunk.len() as u64;
        progress(done, total);
    }
    // A definition edited while this ran has another hash and stays pending.
    let mut mark = conn.prepare("UPDATE custom_stats SET computed_hash = ?2 WHERE id = ?1 AND definition_hash = ?2")?;
    for stat in &pending {
        mark.execute(params![stat.id, definition_hash(&stat.def)])?;
    }
    Ok(done)
}

/// The figure of a draft definition over the latest hands (nothing is stored).
/// `hero` limits it to that player (and the accounts linked to it).
pub fn preview(conn: &Connection, def: &CustomStatDef, hero: Option<&str>) -> std::result::Result<Value, SaveError> {
    def.validate().map_err(SaveError::Invalid)?;
    let stat = StoredStat { id: 0, def: def.clone(), ready: true, compiled: CompiledStat::new(def) };
    let ids: Vec<String> = {
        let mut stmt = conn.prepare("SELECT id FROM hands ORDER BY date_time DESC, id LIMIT ?1")?;
        let ids = stmt.query_map([PREVIEW_HANDS], |r| r.get::<_, String>(0))?.collect::<std::result::Result<_, _>>()?;
        ids
    };
    let allowed: Option<HashSet<String>> = match hero.filter(|h| !h.trim().is_empty()) {
        None => None,
        Some(name) => {
            let sql = format!("SELECT name FROM players WHERE name IN {}", crate::repos::hands_query::hero_resolution_sql("@hero"));
            let value = SqlValue::Text(name.into());
            let params: [(&str, &dyn ToSql); 1] = [("@hero", &value)];
            let mut stmt = conn.prepare(&sql)?;
            let names = stmt.query_map(&params[..], |r| r.get::<_, String>(0))?.collect::<std::result::Result<HashSet<_>, _>>()?;
            Some(names)
        }
    };
    let (mut num, mut den, mut hands) = (0u64, 0u64, 0u64);
    for id in &ids {
        let Some(mut hand) = load_hand(conn, id)? else { continue };
        if let Some(allowed) = &allowed {
            hand.seats.retain(|(name, ..)| allowed.contains(name));
        }
        hands += 1;
        for (_, _, bits) in evaluate_stored(std::slice::from_ref(&stat), &hand) {
            den += u64::from(bits & DEN_BIT != 0);
            num += u64::from(bits & NUM_BIT != 0);
        }
    }
    Ok(json!({ "num": num, "den": den, "hands": hands, "pct": if den == 0 { Value::Null } else { json!(num as f64 / den as f64 * 100.0) } }))
}


/// The figure of every custom stat over the hands selected by `where_sql` (a condition on the
/// aliases `h`, `ph` and `p`) with its named `params`; stats still being computed have no figure.
pub fn report(conn: &Connection, where_sql: &str, params: &[(&str, &dyn ToSql)]) -> Result<Value> {
    let sql = format!(
        "SELECT c.stat_id, SUM(CASE WHEN (c.bits & {DEN_BIT}) != 0 THEN 1 ELSE 0 END), SUM(CASE WHEN (c.bits & {NUM_BIT}) != 0 THEN 1 ELSE 0 END)
         FROM custom_stat_hits c
         JOIN custom_stats cs ON cs.id = c.stat_id AND cs.definition_hash = cs.computed_hash
         JOIN hands h ON h.id = c.hand_id
         JOIN player_hands ph ON ph.hand_id = c.hand_id AND ph.player_name = c.player_name
         LEFT JOIN players p ON p.name = ph.player_name
         WHERE {where_sql}
         GROUP BY c.stat_id"
    );
    let mut stmt = conn.prepare(&sql)?;
    let counts = stmt
        .query_map(params, |r| Ok((r.get::<_, i64>(0)?, (r.get::<_, i64>(2)? as u64, r.get::<_, i64>(1)? as u64))))?
        .collect::<std::result::Result<std::collections::HashMap<_, _>, _>>()?;
    let figures = load_all(conn)?
        .into_iter()
        .map(|stat| {
            let figure = stat.ready.then(|| counts.get(&stat.id).copied().unwrap_or((0, 0)));
            let pct = figure.map(|(num, den)| if den == 0 { 0.0 } else { (num as f64 / den as f64 * 1000.0).round() / 10.0 });
            json!({ "id": stat.id, "name": stat.def.name, "ready": stat.ready, "num": figure.map(|f| f.0), "den": figure.map(|f| f.1), "pct": pct })
        })
        .collect();
    Ok(Value::Array(figures))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::stats::store::backfill;

    fn def(name: &str, action: &str) -> CustomStatDef {
        parse_definition(&json!({
            "schema": 1, "name": name,
            "numerator": { "type": "action", "street": "preflop", "action": action },
            "denominator": { "type": "flag", "name": "RfiOpp" },
        }))
        .unwrap()
    }

    fn insert_hand(conn: &Connection, id: &str) {
        conn.execute(
            "INSERT INTO hands (id, preflop_action, blinds, player_count) VALUES (?1, 'SB posts small blind 10\nBB posts big blind 20\nHero raises 20 to 50\nSB folds\nBB calls 30', '10/20', 3)",
            [id],
        )
        .unwrap();
        for (name, position) in [("Hero", "BTN"), ("SB", "SB"), ("BB", "BB")] {
            conn.execute("INSERT INTO player_hands (hand_id, player_name, position, stack) VALUES (?1, ?2, ?3, 400)", params![id, name, position]).unwrap();
        }
    }

    fn open() -> (tempfile::TempDir, Database) {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(dir.path().join("a.db")).unwrap();
        (dir, db)
    }

    fn hit(conn: &Connection, stat: i64, hand: &str, player: &str) -> Option<i64> {
        conn.query_row(
            "SELECT bits FROM custom_stat_hits WHERE stat_id = ?1 AND hand_id = ?2 AND player_name = ?3",
            params![stat, hand, player],
            |r| r.get(0),
        )
        .optional()
        .unwrap()
    }

    #[test]
    fn create_update_and_delete_enforce_names_and_limits() {
        let (_dir, db) = open();
        let conn = db.conn().unwrap();
        let a = create(&conn, &def("Open", "raise")).unwrap();
        assert!(matches!(create(&conn, &def("open", "raise")), Err(SaveError::Invalid(_))), "names are unique ignoring case");
        let b = create(&conn, &def("Limp", "call")).unwrap();
        assert!(matches!(update(&conn, b, &def("OPEN", "call")), Err(SaveError::Invalid(_))));
        assert!(update(&conn, b, &def("Limp2", "call")).unwrap());
        assert!(!update(&conn, 999, &def("X", "call")).unwrap());
        assert_eq!(pending_count(&conn).unwrap(), 2);
        assert!(delete(&conn, a).unwrap() && !delete(&conn, a).unwrap());
        assert_eq!(list_json(&conn).unwrap().len(), 1);
    }

    #[test]
    fn a_new_stat_is_pending_until_the_history_is_recomputed() {
        let (_dir, db) = open();
        let mut conn = db.conn().unwrap();
        for n in 0..3 {
            insert_hand(&conn, &format!("h{n}"));
        }
        backfill(&mut conn, |_, _| {}).unwrap();
        let id = create(&conn, &def("Open", "raise")).unwrap();
        assert!(ready_ids(&conn).unwrap().is_empty());

        let mut reports = Vec::new();
        assert_eq!(recompute_pending(&mut conn, |d, t| reports.push((d, t))).unwrap(), 3);
        assert_eq!(reports, vec![(3, 3)]);
        assert!(ready_ids(&conn).unwrap().contains(&id));
        assert_eq!(hit(&conn, id, "h1", "Hero"), Some(3), "the opener raised");
        assert_eq!(hit(&conn, id, "h1", "SB"), None, "SB had no first-in opportunity");
        assert_eq!(recompute_pending(&mut conn, |_, _| {}).unwrap(), 0, "nothing left to do");
    }

    #[test]
    fn editing_a_definition_drops_its_hits_and_recomputes_them() {
        let (_dir, db) = open();
        let mut conn = db.conn().unwrap();
        insert_hand(&conn, "h1");
        backfill(&mut conn, |_, _| {}).unwrap();
        let id = create(&conn, &def("Open", "raise")).unwrap();
        recompute_pending(&mut conn, |_, _| {}).unwrap();

        assert!(update(&conn, id, &def("Renamed", "raise")).unwrap());
        assert!(ready_ids(&conn).unwrap().contains(&id), "a rename keeps the figures");
        assert_eq!(hit(&conn, id, "h1", "Hero"), Some(3));

        assert!(update(&conn, id, &def("Renamed", "call")).unwrap());
        assert!(ready_ids(&conn).unwrap().is_empty());
        assert_eq!(hit(&conn, id, "h1", "Hero"), None);
        recompute_pending(&mut conn, |_, _| {}).unwrap();
        assert_eq!(hit(&conn, id, "h1", "Hero"), Some(1), "Hero raised, did not call: denominator only");
    }

    #[test]
    fn preview_counts_without_storing_anything() {
        let (_dir, db) = open();
        let mut conn = db.conn().unwrap();
        for n in 0..4 {
            insert_hand(&conn, &format!("h{n}"));
        }
        backfill(&mut conn, |_, _| {}).unwrap();
        let figure = preview(&conn, &def("Open", "raise"), None).unwrap();
        assert_eq!((figure["num"].as_u64(), figure["den"].as_u64(), figure["hands"].as_u64()), (Some(4), Some(4), Some(4)));
        assert_eq!(figure["pct"].as_f64(), Some(100.0));
        assert_eq!(count(&conn).unwrap(), 0);
        let none: i64 = conn.query_row("SELECT COUNT(*) FROM custom_stat_hits", [], |r| r.get(0)).unwrap();
        assert_eq!(none, 0);
        let other = preview(&conn, &def("Open", "raise"), Some("Nobody")).unwrap();
        assert_eq!(other["den"].as_u64(), Some(0));
        assert!(other["pct"].is_null());
    }

    #[test]
    fn invalidated_stats_are_computed_again() {
        let (_dir, db) = open();
        let mut conn = db.conn().unwrap();
        insert_hand(&conn, "h1");
        backfill(&mut conn, |_, _| {}).unwrap();
        let id = create(&conn, &def("Open", "raise")).unwrap();
        recompute_pending(&mut conn, |_, _| {}).unwrap();
        assert!(ready_ids(&conn).unwrap().contains(&id));

        invalidate_all(&conn).unwrap();
        assert!(ready_ids(&conn).unwrap().is_empty());
        assert_eq!(recompute_pending(&mut conn, |_, _| {}).unwrap(), 1);
        assert!(ready_ids(&conn).unwrap().contains(&id));
        assert_eq!(hit(&conn, id, "h1", "Hero"), Some(3));
    }

    #[test]
    fn delete_all_clears_the_hits() {
        let (_dir, db) = open();
        let mut conn = db.conn().unwrap();
        insert_hand(&conn, "h1");
        backfill(&mut conn, |_, _| {}).unwrap();
        let id = create(&conn, &def("Open", "raise")).unwrap();
        recompute_pending(&mut conn, |_, _| {}).unwrap();
        delete_all(&conn).unwrap();
        assert_eq!(hit(&conn, id, "h1", "Hero"), None);
    }
}
