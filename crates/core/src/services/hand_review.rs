//! The queue of hands the player marked to review, on the spaced-repetition boxes of the range
//! cards (see [`super::review`]). Every function takes today's date: nothing here reads the clock.

use chrono::NaiveDate;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

use super::review::next_state;
use crate::Result;

const DATE_FORMAT: &str = "%Y-%m-%d";
const MAX_NOTE_CHARS: usize = 500;
/// Marked hands listed at most.
const LIST_LIMIT: i64 = 500;

fn day(date: NaiveDate) -> String {
    date.format(DATE_FORMAT).to_string()
}

/// Marks a hand. Marking a hand already in the queue puts it back due today. `false` when the hand
/// does not exist.
pub fn mark(conn: &Connection, hand_id: &str, note: &str, today: NaiveDate) -> Result<bool> {
    let exists: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM hands WHERE id = ?1)", params![hand_id], |r| r.get(0))?;
    if !exists {
        return Ok(false);
    }
    let note: String = note.chars().take(MAX_NOTE_CHARS).collect();
    conn.execute(
        "INSERT INTO review_hands (hand_id, box, due_on, added_on, note) VALUES (?1, 1, ?2, ?2, ?3)
         ON CONFLICT(hand_id) DO UPDATE SET box = 1, due_on = excluded.due_on, note = excluded.note",
        params![hand_id, day(today), note],
    )?;
    Ok(true)
}

pub fn unmark(conn: &Connection, hand_id: &str) -> Result<bool> {
    Ok(conn.execute("DELETE FROM review_hands WHERE hand_id = ?1", params![hand_id])? > 0)
}

/// Records how the review went: a hand handled well moves up a box, one to look at again comes
/// back tomorrow. Returns the new box and the day it is due, `None` when the hand is not queued.
pub fn answer(conn: &Connection, hand_id: &str, correct: bool, today: NaiveDate, answered_at: &str) -> Result<Option<(i64, NaiveDate)>> {
    let current: Option<i64> = conn.query_row("SELECT box FROM review_hands WHERE hand_id = ?1", params![hand_id], |r| r.get(0)).optional()?;
    let Some(current) = current else { return Ok(None) };
    let (new_box, due) = next_state(Some(current), correct, today);
    conn.execute("UPDATE review_hands SET box = ?2, due_on = ?3, last_answer_at = ?4 WHERE hand_id = ?1", params![hand_id, new_box, day(due), answered_at])?;
    Ok(Some((new_box, due)))
}

/// The queue: due hands first (oldest due first), then the others by due date. Each entry has the
/// hero's cards, result and the date of the hand.
pub fn queue(conn: &Connection, hero: Option<&str>, today: NaiveDate) -> Result<Value> {
    let hero_filter = if hero.is_some() { "AND me.player_name IN (SELECT name FROM players WHERE name = @hero UNION SELECT p.name FROM players p JOIN aliases a ON p.alias_id = a.id WHERE a.name = @hero)" } else { "" };
    let sql = format!(
        "SELECT r.hand_id, r.box, r.due_on, r.added_on, r.note, h.date_time, h.room, h.blinds, me.cards, COALESCE(me.net_profit, 0)
         FROM review_hands r
         JOIN hands h ON h.id = r.hand_id
         LEFT JOIN player_hands me ON me.hand_id = h.id {hero_filter}
         GROUP BY r.hand_id
         ORDER BY (r.due_on <= @today) DESC, r.due_on ASC, r.added_on ASC
         LIMIT {LIST_LIMIT}"
    );
    let mut stmt = conn.prepare(&sql)?;
    let today_text = day(today);
    let mapper = |r: &rusqlite::Row| -> rusqlite::Result<Value> {
        let due_on: String = r.get(2)?;
        Ok(json!({
            "handId": r.get::<_, String>(0)?, "box": r.get::<_, i64>(1)?, "dueOn": due_on, "dueNow": due_on <= today_text,
            "addedOn": r.get::<_, String>(3)?, "note": r.get::<_, String>(4)?, "playedAt": r.get::<_, Option<String>>(5)?,
            "room": r.get::<_, Option<String>>(6)?, "blinds": r.get::<_, Option<String>>(7)?, "cards": r.get::<_, Option<String>>(8)?,
            "profitChips": r.get::<_, f64>(9)?,
        }))
    };
    let items: Vec<Value> = match hero {
        Some(hero) => stmt.query_map(rusqlite::named_params! { "@today": today_text, "@hero": hero }, mapper)?.collect::<std::result::Result<_, _>>()?,
        None => stmt.query_map(rusqlite::named_params! { "@today": today_text }, mapper)?.collect::<std::result::Result<_, _>>()?,
    };
    let due = items.iter().filter(|i| i["dueNow"] == true).count();
    Ok(json!({ "total": items.len(), "due": due, "items": items }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 11, 20).unwrap()
    }

    fn db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations::run(&mut conn).unwrap();
        for id in ["h1", "h2"] {
            conn.execute("INSERT INTO hands (id, room, date_time, blinds) VALUES (?1, 'Winamax', '2026-11-10 20:00:00', '10/20')", [id]).unwrap();
            conn.execute("INSERT INTO player_hands (hand_id, player_name, cards, net_profit) VALUES (?1, 'Hero', 'Ah Kd', 40)", [id]).unwrap();
        }
        conn.execute("INSERT INTO players (name) VALUES ('Hero')", []).unwrap();
        conn
    }

    #[test]
    fn a_marked_hand_is_due_today_and_an_unknown_hand_is_refused() {
        let conn = db();
        assert!(mark(&conn, "h1", "check the 3-bet", today()).unwrap());
        assert!(!mark(&conn, "nope", "", today()).unwrap());
        let queue = queue(&conn, Some("Hero"), today()).unwrap();
        assert_eq!((queue["total"].as_i64(), queue["due"].as_i64()), (Some(1), Some(1)));
        assert_eq!(queue["items"][0]["note"], "check the 3-bet");
        assert_eq!(queue["items"][0]["cards"], "Ah Kd");
    }

    #[test]
    fn a_good_review_pushes_the_hand_back_and_a_bad_one_brings_it_back_tomorrow() {
        let conn = db();
        mark(&conn, "h1", "", today()).unwrap();
        let (box_after, due) = answer(&conn, "h1", true, today(), "now").unwrap().unwrap();
        assert_eq!(box_after, 2);
        assert_eq!(due, today() + chrono::Duration::days(1));
        assert_eq!(queue(&conn, None, today()).unwrap()["due"], 0, "no longer due today");
        assert_eq!(queue(&conn, None, due).unwrap()["due"], 1, "due again on its day");

        let (box_after, due) = answer(&conn, "h1", false, due, "later").unwrap().unwrap();
        assert_eq!(box_after, 1);
        assert_eq!(due, today() + chrono::Duration::days(2));
        assert!(answer(&conn, "missing", true, today(), "now").unwrap().is_none());
    }

    #[test]
    fn due_hands_come_first_and_marking_again_resets_the_hand() {
        let conn = db();
        mark(&conn, "h1", "", today()).unwrap();
        mark(&conn, "h2", "", today()).unwrap();
        answer(&conn, "h1", true, today(), "now").unwrap();
        let queue_now = queue(&conn, None, today()).unwrap();
        assert_eq!(queue_now["items"][0]["handId"], "h2", "the hand due now is listed first");
        mark(&conn, "h1", "again", today()).unwrap();
        let queue_again = queue(&conn, None, today()).unwrap();
        assert_eq!(queue_again["due"], 2);
        assert!(unmark(&conn, "h1").unwrap());
        assert!(!unmark(&conn, "h1").unwrap());
    }
}
