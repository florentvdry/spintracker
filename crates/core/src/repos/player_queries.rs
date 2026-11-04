//! Reading and editing players and their aliases.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, ToSql};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::hands_query::hero_resolution_sql;
use crate::Result;

/// Filters of the players overview.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PlayersQuery {
    pub limit: Option<i64>,
    pub min_hands: Option<i64>,
    /// "reg" for regulars, anything else for the others.
    pub is_reg_filter: Option<String>,
}

fn player_json(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": r.get::<_, i64>(0)?,
        "name": r.get::<_, String>(1)?,
        "room": r.get::<_, Option<String>>(2)?,
        "total_hands": r.get::<_, i64>(3)?,
        "total_profit": r.get::<_, f64>(4)?,
        "is_reg": r.get::<_, i64>(5)? == 1,
        "is_reg_forced": r.get::<_, i64>(6)? == 1,
    }))
}

/// Players ordered by number of hands.
pub fn players_overview(conn: &Connection, q: &PlayersQuery) -> Result<Vec<Value>> {
    let mut clauses = Vec::new();
    let mut binds: Vec<(&str, SqlValue)> = Vec::new();
    if let Some(min) = q.min_hands {
        clauses.push("total_hands >= @minHands");
        binds.push(("@minHands", min.into()));
    }
    if let Some(filter) = q.is_reg_filter.as_deref().filter(|f| !f.is_empty()) {
        clauses.push("is_reg = @isReg");
        binds.push(("@isReg", i64::from(filter == "reg").into()));
    }
    let where_clause = if clauses.is_empty() { String::new() } else { format!("WHERE {}", clauses.join(" AND ")) };
    let limit = q.limit.map(|l| format!("LIMIT {l}")).unwrap_or_default();
    let mut stmt = conn.prepare(&format!(
        "SELECT id, name, room, total_hands, total_profit, is_reg, is_reg_forced FROM players {where_clause} ORDER BY total_hands DESC {limit}"
    ))?;
    let params: Vec<(&str, &dyn ToSql)> = binds.iter().map(|(n, v)| (*n, v as &dyn ToSql)).collect();
    let rows = stmt.query_map(&params[..], player_json)?.collect::<std::result::Result<_, _>>()?;
    Ok(rows)
}

/// Players met by the hero, most frequent first.
pub fn opponents_for_hero(conn: &Connection, hero_name: &str, limit: Option<i64>) -> Result<Vec<Value>> {
    let hero = hero_resolution_sql("@heroName");
    let mut stmt = conn.prepare(&format!(
        "SELECT p.id, v.player_name AS name, (SELECT h.room FROM hands h WHERE h.id = v.hand_id LIMIT 1) AS room,
                COUNT(DISTINCT v.hand_id) AS hands_vs_hero, COALESCE(p.total_profit, 0) AS total_profit,
                COALESCE(p.is_reg, 0) AS is_reg, COALESCE(p.is_reg_forced, 0) AS is_reg_forced
         FROM player_hands v
         JOIN player_hands hhero ON hhero.hand_id = v.hand_id AND hhero.player_name IN {hero}
         LEFT JOIN players p ON p.name = v.player_name
         WHERE v.player_name NOT IN {hero}
         GROUP BY v.player_name, p.id, p.total_profit, p.is_reg, p.is_reg_forced
         ORDER BY hands_vs_hero DESC {}",
        limit.map(|l| format!("LIMIT {l}")).unwrap_or_default()
    ))?;
    let rows = stmt
        .query_map(&[("@heroName", &hero_name as &dyn ToSql)][..], |r| {
            Ok(json!({
                "id": r.get::<_, Option<i64>>(0)?.unwrap_or(0),
                "name": r.get::<_, String>(1)?,
                "room": r.get::<_, Option<String>>(2)?,
                "total_hands": r.get::<_, i64>(3)?,
                "total_profit": r.get::<_, f64>(4)?,
                "is_reg": r.get::<_, i64>(5)? == 1,
                "is_reg_forced": r.get::<_, i64>(6)? == 1,
            }))
        })?
        .collect::<std::result::Result<_, _>>()?;
    Ok(rows)
}

/// Forces a player's regular status. False when the player does not exist.
pub fn set_reg_status(conn: &Connection, player_id: i64, is_reg: bool) -> Result<bool> {
    let changed = conn.execute(
        "UPDATE players SET is_reg = ?1, is_reg_forced = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![i64::from(is_reg), player_id],
    )?;
    Ok(changed > 0)
}

/// Aliases with the players linked to them.
pub fn aliases(conn: &Connection) -> Result<Vec<Value>> {
    let mut stmt = conn.prepare(
        "SELECT a.id, a.name, p.id, p.name, p.room FROM aliases a LEFT JOIN players p ON p.alias_id = a.id ORDER BY a.name, p.name",
    )?;
    let mut out: Vec<(i64, Value)> = Vec::new();
    let mut rows = stmt.query([])?;
    while let Some(r) = rows.next()? {
        let alias_id: i64 = r.get(0)?;
        if !out.iter().any(|(id, _)| *id == alias_id) {
            out.push((alias_id, json!({ "id": alias_id, "name": r.get::<_, String>(1)?, "players": [] })));
        }
        if let Some(player_id) = r.get::<_, Option<i64>>(2)? {
            let alias = &mut out.iter_mut().find(|(id, _)| *id == alias_id).expect("alias just added").1;
            alias["players"].as_array_mut().expect("players is an array").push(json!({
                "id": player_id,
                "name": r.get::<_, String>(3)?,
                "room": r.get::<_, Option<String>>(4)?,
            }));
        }
    }
    Ok(out.into_iter().map(|(_, v)| v).collect())
}

pub fn create_alias(conn: &Connection, name: &str) -> Result<i64> {
    conn.execute("INSERT INTO aliases (name) VALUES (?1)", [name])?;
    Ok(conn.last_insert_rowid())
}

/// Deletes an alias after unlinking its players.
pub fn delete_alias(conn: &mut Connection, alias_id: i64) -> Result<()> {
    let tx = conn.transaction()?;
    tx.execute("UPDATE players SET alias_id = NULL WHERE alias_id = ?1", [alias_id])?;
    tx.execute("DELETE FROM aliases WHERE id = ?1", [alias_id])?;
    tx.commit()?;
    Ok(())
}

pub fn link_player_to_alias(conn: &Connection, player_id: i64, alias_id: i64) -> Result<()> {
    conn.execute("UPDATE players SET alias_id = ?1 WHERE id = ?2", params![alias_id, player_id])?;
    Ok(())
}

pub fn unlink_player_from_alias(conn: &Connection, player_id: i64) -> Result<()> {
    conn.execute("UPDATE players SET alias_id = NULL WHERE id = ?1", [player_id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn fixture() -> (tempfile::TempDir, Database) {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(dir.path().join("a.db")).unwrap();
        let conn = db.conn().unwrap();
        for (name, hands) in [("alpha", 30), ("beta", 10), ("gamma", 20)] {
            conn.execute("INSERT INTO players (name, room, total_hands, total_profit) VALUES (?1, 'Betclic', ?2, 1.5)", params![name, hands]).unwrap();
        }
        (dir, db)
    }

    #[test]
    fn overview_is_sorted_filtered_and_limited() {
        let (_dir, db) = fixture();
        let conn = db.conn().unwrap();
        let all = players_overview(&conn, &PlayersQuery::default()).unwrap();
        assert_eq!(all.iter().map(|p| p["name"].as_str().unwrap()).collect::<Vec<_>>(), ["alpha", "gamma", "beta"]);
        let some = players_overview(&conn, &PlayersQuery { min_hands: Some(15), limit: Some(1), ..Default::default() }).unwrap();
        assert_eq!(some.len(), 1);
        assert_eq!(some[0]["is_reg"], false);
        let regs = players_overview(&conn, &PlayersQuery { is_reg_filter: Some("reg".into()), ..Default::default() }).unwrap();
        assert!(regs.is_empty());
    }

    #[test]
    fn forcing_regular_status_and_missing_players() {
        let (_dir, db) = fixture();
        let conn = db.conn().unwrap();
        assert!(set_reg_status(&conn, 1, true).unwrap());
        assert!(!set_reg_status(&conn, 999, true).unwrap());
        let first = &players_overview(&conn, &PlayersQuery { is_reg_filter: Some("reg".into()), ..Default::default() }).unwrap()[0];
        assert_eq!((first["is_reg"].as_bool(), first["is_reg_forced"].as_bool()), (Some(true), Some(true)));
    }

    #[test]
    fn aliases_group_their_players_and_deleting_unlinks() {
        let (_dir, db) = fixture();
        let mut conn = db.conn().unwrap();
        let alias = create_alias(&conn, "me").unwrap();
        link_player_to_alias(&conn, 1, alias).unwrap();
        link_player_to_alias(&conn, 2, alias).unwrap();
        let listed = aliases(&conn).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0]["players"].as_array().unwrap().len(), 2);

        unlink_player_from_alias(&conn, 2).unwrap();
        assert_eq!(aliases(&conn).unwrap()[0]["players"].as_array().unwrap().len(), 1);
        delete_alias(&mut conn, alias).unwrap();
        assert!(aliases(&conn).unwrap().is_empty());
        let linked: i64 = conn.query_row("SELECT COUNT(*) FROM players WHERE alias_id IS NOT NULL", [], |r| r.get(0)).unwrap();
        assert_eq!(linked, 0);
    }
}
