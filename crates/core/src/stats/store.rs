//! Computing and persisting the stat flags of every player of every hand.

use rusqlite::{params, Connection};

use super::flags::{Flags, FLAGS_VERSION};
use super::postflop::{self, PostflopInput, StreetCounts};
use super::preflop::{self, PreflopInput};
use crate::engines::actions::parse_actions;
use crate::Result;

/// Hands processed per transaction while backfilling.
const BACKFILL_BATCH: usize = 500;

/// What is stored for a player in a hand.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct PlayerFacts {
    pub flags: Flags,
    pub street_counts: StreetCounts,
}

/// A player of the hand, as the flags need to know him.
#[derive(Debug, Clone)]
pub struct SeatInput {
    pub name: String,
    pub position: String,
    pub went_to_showdown: bool,
    pub net_profit: f64,
}

/// The parts of a hand the flags are computed from.
#[derive(Debug, Clone, Copy)]
pub struct HandFlagInput<'a> {
    pub preflop_action: &'a str,
    pub flop_action: &'a str,
    pub turn_action: &'a str,
    pub river_action: &'a str,
    /// Flop cards as stored on the hand.
    pub flop_cards: &'a str,
    pub blinds: &'a str,
    pub player_count: i32,
    pub players: &'a [SeatInput],
}

/// Facts of every seated player of one hand, in seating order.
pub fn flags_for_hand(hand: &HandFlagInput) -> Vec<(String, PlayerFacts)> {
    let (preflop, flop, turn, river) = (
        parse_actions(hand.preflop_action),
        parse_actions(hand.flop_action),
        parse_actions(hand.turn_action),
        parse_actions(hand.river_action),
    );
    hand.players
        .iter()
        .map(|seat| {
            let mut flags = preflop::compute(&PreflopInput {
                actions: &preflop,
                player: &seat.name,
                position: &seat.position,
                player_count: hand.player_count,
                blinds: hand.blinds,
            });
            let (post_flags, street_counts) = postflop::compute(&PostflopInput {
                preflop: &preflop,
                flop: &flop,
                turn: &turn,
                river: &river,
                player: &seat.name,
                position: &seat.position,
                player_count: hand.player_count,
                flop_cards: hand.flop_cards,
                went_to_showdown: seat.went_to_showdown,
                net_profit: seat.net_profit,
            });
            for flag in post_flags.iter() {
                flags.set(flag);
            }
            (seat.name.clone(), PlayerFacts { flags, street_counts })
        })
        .collect()
}

/// Writes (or replaces) the rows of a hand.
pub fn save_hand_flags(conn: &Connection, hand_id: &str, rows: &[(String, PlayerFacts)]) -> Result<()> {
    let mut stmt = conn.prepare_cached(
        "INSERT OR REPLACE INTO hand_player_flags (hand_id, player_name, flags_version, flags_0, flags_1, flags_2, flags_3, street_counts)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )?;
    for (name, facts) in rows {
        let w = facts.flags.words();
        // 60 bits per word, so the values always fit a signed 64-bit integer.
        stmt.execute(params![hand_id, name, FLAGS_VERSION, w[0] as i64, w[1] as i64, w[2] as i64, w[3] as i64, facts.street_counts.0 as i64])?;
    }
    Ok(())
}

/// Reads the flags of one player in one hand.
pub fn load_flags(conn: &Connection, hand_id: &str, player: &str) -> Result<Option<Flags>> {
    let mut stmt = conn.prepare_cached(
        "SELECT flags_0, flags_1, flags_2, flags_3 FROM hand_player_flags WHERE hand_id = ?1 AND player_name = ?2",
    )?;
    let row = stmt.query_row(params![hand_id, player], |r| {
        Ok(Flags::from_words([r.get::<_, i64>(0)? as u64, r.get::<_, i64>(1)? as u64, r.get::<_, i64>(2)? as u64, r.get::<_, i64>(3)? as u64]))
    });
    match row {
        Ok(flags) => Ok(Some(flags)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Removes the flags of every hand (used when the hands are wiped).
pub fn delete_all(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM hand_player_flags", [])?;
    Ok(())
}

// A hand without any seated player has no row to store: counting it would make it pending forever.
const PENDING: &str = "FROM hands h WHERE EXISTS (SELECT 1 FROM player_hands p WHERE p.hand_id = h.id)
    AND NOT EXISTS (SELECT 1 FROM hand_player_flags f WHERE f.hand_id = h.id AND f.flags_version = ?1)";

fn pending_hand_ids(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(&format!("SELECT h.id {PENDING}"))?;
    let ids = stmt.query_map([FLAGS_VERSION], |r| r.get::<_, String>(0))?.collect::<std::result::Result<_, _>>()?;
    Ok(ids)
}

/// Number of hands whose flags are missing or computed with another flag version.
pub fn pending_count(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row(&format!("SELECT COUNT(*) {PENDING}"), [FLAGS_VERSION], |r| r.get(0))?)
}

/// Computes the flags of every hand that lacks current ones (existing databases at first
/// start, or after `FLAGS_VERSION` changed). `progress(done, total)` is called after each batch.
/// Returns the number of hands processed.
pub fn backfill(conn: &mut Connection, mut progress: impl FnMut(u64, u64)) -> Result<u64> {
    let ids = pending_hand_ids(conn)?;
    let total = ids.len() as u64;
    let mut done = 0u64;

    for chunk in ids.chunks(BACKFILL_BATCH) {
        let tx = conn.transaction()?;
        {
            let mut hand_stmt = tx.prepare(
                "SELECT COALESCE(preflop_action, ''), COALESCE(flop_action, ''), COALESCE(turn_action, ''), COALESCE(river_action, ''),
                        COALESCE(flop, ''), COALESCE(blinds, ''), COALESCE(player_count, 2)
                 FROM hands WHERE id = ?1",
            )?;
            let mut players_stmt = tx.prepare(
                "SELECT player_name, COALESCE(position, ''), COALESCE(went_to_showdown, 0), COALESCE(net_profit, 0) FROM player_hands WHERE hand_id = ?1",
            )?;
            for id in chunk {
                let (preflop, flop, turn, river, flop_cards, blinds, player_count): (String, String, String, String, String, String, i32) =
                    hand_stmt.query_row([id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)))?;
                let players: Vec<SeatInput> = players_stmt
                    .query_map([id], |r| {
                        Ok(SeatInput { name: r.get(0)?, position: r.get(1)?, went_to_showdown: r.get::<_, i64>(2)? != 0, net_profit: r.get(3)? })
                    })?
                    .collect::<std::result::Result<_, _>>()?;
                let rows = flags_for_hand(&HandFlagInput {
                    preflop_action: &preflop,
                    flop_action: &flop,
                    turn_action: &turn,
                    river_action: &river,
                    flop_cards: &flop_cards,
                    blinds: &blinds,
                    player_count,
                    players: &players,
                });
                save_hand_flags(&tx, id, &rows)?;
            }
        }
        tx.commit()?;
        done += chunk.len() as u64;
        progress(done, total);
    }
    Ok(done)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::stats::flags::Flag;

    const PREFLOP: &str = "SB posts small blind 10\nBB posts big blind 20\nHero raises 20 to 50\nSB folds\nBB calls 30";

    fn insert_hand(conn: &Connection, id: &str) {
        conn.execute(
            "INSERT INTO hands (id, preflop_action, flop_action, flop, blinds, player_count) VALUES (?1, ?2, 'BB checks\nHero bets 40', '2c 7d 9h', '10/20', 3)",
            params![id, PREFLOP],
        )
        .unwrap();
        for (name, position) in [("Hero", "BTN"), ("SB", "SB"), ("BB", "BB")] {
            conn.execute("INSERT INTO player_hands (hand_id, player_name, position) VALUES (?1, ?2, ?3)", params![id, name, position]).unwrap();
        }
    }

    fn seat(name: &str, position: &str) -> SeatInput {
        SeatInput { name: name.into(), position: position.into(), went_to_showdown: false, net_profit: 0.0 }
    }

    #[test]
    fn flags_for_hand_covers_every_player_and_both_streets() {
        let players = vec![seat("Hero", "BTN"), seat("BB", "BB")];
        let rows = flags_for_hand(&HandFlagInput {
            preflop_action: PREFLOP,
            flop_action: "BB checks\nHero bets 40",
            turn_action: "",
            river_action: "",
            flop_cards: "2c 7d 9h",
            blinds: "10/20",
            player_count: 3,
            players: &players,
        });
        assert_eq!(rows.len(), 2);
        let hero = &rows[0].1;
        assert!(hero.flags.has(Flag::Rfi) && hero.flags.has(Flag::CbetFlop) && hero.flags.has(Flag::SawFlop));
        assert_eq!(hero.street_counts.get(postflop::Street::Flop, crate::engines::actions::ActionKind::Bet), 1);
        let bb = &rows[1].1;
        assert!(bb.flags.has(Flag::CallOpen) && bb.flags.has(Flag::VsStealOpp));
    }

    #[test]
    fn backfill_fills_missing_rows_once_and_reports_progress() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(dir.path().join("a.db")).unwrap();
        let mut conn = db.conn().unwrap();
        for n in 0..1200 {
            insert_hand(&conn, &format!("h{n}"));
        }
        assert_eq!(pending_count(&conn).unwrap(), 1200);

        let mut reports = Vec::new();
        assert_eq!(backfill(&mut conn, |d, t| reports.push((d, t))).unwrap(), 1200);
        assert_eq!(reports, vec![(500, 1200), (1000, 1200), (1200, 1200)]);
        assert_eq!(pending_count(&conn).unwrap(), 0);
        assert_eq!(backfill(&mut conn, |_, _| {}).unwrap(), 0, "nothing left to do");

        let hero = load_flags(&conn, "h7", "Hero").unwrap().unwrap();
        assert!(hero.has(Flag::Rfi) && hero.has(Flag::Steal) && hero.has(Flag::CbetFlop));
        assert!(load_flags(&conn, "h7", "Nobody").unwrap().is_none());
        let rows: i64 = conn.query_row("SELECT COUNT(*) FROM hand_player_flags", [], |r| r.get(0)).unwrap();
        assert_eq!(rows, 3600);
    }

    #[test]
    fn rows_with_an_old_flag_version_are_recomputed() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(dir.path().join("a.db")).unwrap();
        let mut conn = db.conn().unwrap();
        insert_hand(&conn, "h1");
        backfill(&mut conn, |_, _| {}).unwrap();

        conn.execute("UPDATE hand_player_flags SET flags_version = flags_version - 1, flags_0 = 0", []).unwrap();
        assert_eq!(pending_count(&conn).unwrap(), 1);
        backfill(&mut conn, |_, _| {}).unwrap();
        assert!(load_flags(&conn, "h1", "Hero").unwrap().unwrap().has(Flag::Rfi));
    }

    #[test]
    fn hands_without_players_are_never_pending() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(dir.path().join("a.db")).unwrap();
        let mut conn = db.conn().unwrap();
        conn.execute("INSERT INTO hands (id) VALUES ('empty')", []).unwrap();
        assert_eq!(pending_count(&conn).unwrap(), 0);
        assert_eq!(backfill(&mut conn, |_, _| {}).unwrap(), 0);
    }

    #[test]
    fn delete_all_clears_the_flags() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(dir.path().join("a.db")).unwrap();
        let mut conn = db.conn().unwrap();
        insert_hand(&conn, "h1");
        backfill(&mut conn, |_, _| {}).unwrap();
        delete_all(&conn).unwrap();
        assert!(load_flags(&conn, "h1", "Hero").unwrap().is_none());
    }
}
