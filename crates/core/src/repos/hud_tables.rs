//! Tournaments being played right now, as the table HUD needs to see them: who sits at the table
//! and where, read from the last hand written for each tournament.

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

use crate::Result;

/// Tournaments listed at most: a player does not sit at more tables than this.
const MAX_TABLES: i64 = 12;

/// Turn order of the seats, by position. A player's seat relative to another is the number of
/// steps between their positions along this cycle, whatever the seat numbers a room uses.
fn cycle(players: usize) -> Option<&'static [&'static str]> {
    match players {
        3 => Some(&["BTN", "SB", "BB"]),
        // Heads-up the button is the small blind.
        2 => Some(&["SB", "BB"]),
        _ => None,
    }
}

/// Seat of `position` counted from `hero_position`: 1 is the next player in turn order.
pub(crate) fn relative_seat(players: usize, hero_position: &str, position: &str) -> Option<usize> {
    let order = cycle(players)?;
    let index = |p: &str| order.iter().position(|x| x.eq_ignore_ascii_case(p.trim()));
    let (hero, other) = (index(hero_position)?, index(position)?);
    Some((other + order.len() - hero) % order.len())
}

/// The hero of a tournament: the first configured name (the hero's name and its aliases) that played
/// in it. Without a match, the player whose cards are known in most of its hands: a last resort,
/// because an opponent's cards are known too once they reach a showdown.
fn hero_of(conn: &Connection, game_id: &str, configured: &[String]) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT DISTINCT ph.player_name FROM player_hands ph JOIN hands h ON h.id = ph.hand_id WHERE h.game_id = ?1")?;
    let players: Vec<String> = stmt.query_map([game_id], |r| r.get(0))?.collect::<std::result::Result<_, _>>()?;
    for name in configured {
        if let Some(found) = players.iter().find(|p| p.eq_ignore_ascii_case(name.trim())) {
            return Ok(Some(found.clone()));
        }
    }
    Ok(conn
        .query_row(
            "SELECT ph.player_name FROM player_hands ph JOIN hands h ON h.id = ph.hand_id
             WHERE h.game_id = ?1
             GROUP BY ph.player_name
             HAVING SUM(CASE WHEN ph.cards IS NOT NULL AND ph.cards != '' THEN 1 ELSE 0 END) > 0
             ORDER BY SUM(CASE WHEN ph.cards IS NOT NULL AND ph.cards != '' THEN 1 ELSE 0 END) DESC, ph.player_name
             LIMIT 1",
            [game_id],
            |r| r.get(0),
        )
        .optional()?)
}

/// Tournaments of `room` with a hand written since `since` (a stored date, `YYYY-MM-DD HH:MM:SS`)
/// and no summary yet, most recent first. `heroes` are the names the user plays under. A tournament whose table cannot be shown (more than three
/// players, no known hero) is left out.
pub fn active_tables(conn: &Connection, room: &str, since: &str, heroes: &[String]) -> Result<Vec<Value>> {
    let mut stmt = conn.prepare(
        "SELECT h.game_id, MAX(h.date_time) AS last_at
         FROM hands h
         WHERE h.room = ?1 AND h.game_id IS NOT NULL AND h.game_id != '' AND h.date_time >= ?2
         GROUP BY h.game_id
         HAVING SUM(CASE WHEN COALESCE(h.position, 0) > 0 THEN 1 ELSE 0 END) = 0
         ORDER BY last_at DESC
         LIMIT ?3",
    )?;
    let games: Vec<(String, String)> =
        stmt.query_map(params![room, since, MAX_TABLES], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<std::result::Result<_, _>>()?;

    let mut tables = Vec::new();
    for (game_id, last_at) in games {
        let Some((hand_id, count, name)) = conn
            .query_row(
                "SELECT id, player_count, COALESCE(tournament_name, game_name, '') FROM hands WHERE game_id = ?1 ORDER BY date_time DESC, rowid DESC LIMIT 1",
                [&game_id],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<i64>>(1)?.unwrap_or(0), r.get::<_, String>(2)?)),
            )
            .optional()?
        else {
            continue;
        };
        let players = count as usize;
        let (Some(hero), true) = (hero_of(conn, &game_id, heroes)?, cycle(players).is_some()) else { continue };

        let mut stmt = conn.prepare("SELECT player_name, position FROM player_hands WHERE hand_id = ?1")?;
        let seated: Vec<(String, String)> = stmt
            .query_map([&hand_id], |r| Ok((r.get(0)?, r.get::<_, Option<String>>(1)?.unwrap_or_default())))?
            .collect::<std::result::Result<_, _>>()?;
        let Some(hero_position) = seated.iter().find(|(n, _)| *n == hero).map(|(_, p)| p.clone()) else { continue };

        let mut opponents: Vec<(usize, &String)> = seated
            .iter()
            .filter(|(n, _)| *n != hero)
            .filter_map(|(n, p)| relative_seat(players, &hero_position, p).map(|seat| (seat, n)))
            .collect();
        opponents.sort();
        if opponents.len() + 1 != players {
            continue;
        }
        tables.push(json!({
            "gameId": game_id,
            "room": room,
            "tournamentName": name,
            "lastHandAt": last_at,
            "format": if players == 2 { "headsUp" } else { "threeMax" },
            "hero": hero,
            "players": opponents.iter().map(|(seat, name)| json!({ "seat": format!("+{seat}"), "name": name })).collect::<Vec<_>>(),
        }));
    }
    Ok(tables)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seats_follow_the_turn_order_from_the_hero() {
        assert_eq!(relative_seat(3, "BTN", "SB"), Some(1));
        assert_eq!(relative_seat(3, "BTN", "BB"), Some(2));
        assert_eq!(relative_seat(3, "SB", "BTN"), Some(2));
        assert_eq!(relative_seat(3, "BB", "BTN"), Some(1));
        assert_eq!(relative_seat(3, "BB", "BB"), Some(0));
        assert_eq!(relative_seat(2, "SB", "BB"), Some(1));
        assert_eq!(relative_seat(2, "BB", "SB"), Some(1));
        assert_eq!(relative_seat(6, "BTN", "SB"), None);
        assert_eq!(relative_seat(3, "UTG", "SB"), None);
    }
}
