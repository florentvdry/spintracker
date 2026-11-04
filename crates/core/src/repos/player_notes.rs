//! Notes and colour tags the user attaches to players, per room.

use rusqlite::{params, Connection, OptionalExtension};

use crate::Result;

/// Longest note kept, in characters.
pub const MAX_NOTE_CHARS: usize = 2000;
/// Colour tags a player can carry; an empty tag means none. Set by hand only.
pub const TAGS: [&str; 6] = ["red", "orange", "yellow", "green", "blue", "purple"];

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PlayerNote {
    pub note: String,
    pub tag: String,
}

/// Whether `tag` can be stored.
pub fn is_valid_tag(tag: &str) -> bool {
    tag.is_empty() || TAGS.contains(&tag)
}

pub fn get(conn: &Connection, room: &str, name: &str) -> Result<Option<PlayerNote>> {
    Ok(conn
        .query_row("SELECT note, tag FROM player_notes WHERE room = ?1 AND player_name = ?2", params![room, name], |r| {
            Ok(PlayerNote { note: r.get(0)?, tag: r.get(1)? })
        })
        .optional()?)
}

/// Stores the note, or removes the row when both parts are empty.
pub fn set(conn: &Connection, room: &str, name: &str, note: &PlayerNote) -> Result<()> {
    if note.note.is_empty() && note.tag.is_empty() {
        conn.execute("DELETE FROM player_notes WHERE room = ?1 AND player_name = ?2", params![room, name])?;
        return Ok(());
    }
    conn.execute(
        "INSERT INTO player_notes (player_name, room, note, tag) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(player_name, room) DO UPDATE SET note = excluded.note, tag = excluded.tag, updated_at = CURRENT_TIMESTAMP",
        params![name, room, note.note, note.tag],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    #[test]
    fn notes_are_kept_per_room_and_removed_when_emptied() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(dir.path().join("a.db")).unwrap();
        let conn = db.conn().unwrap();
        let note = PlayerNote { note: "folds a lot".into(), tag: "blue".into() };
        set(&conn, "Winamax", "bob", &note).unwrap();
        assert_eq!(get(&conn, "Winamax", "bob").unwrap(), Some(note));
        assert_eq!(get(&conn, "Unibet", "bob").unwrap(), None, "the same name in another room is another player");

        set(&conn, "Winamax", "bob", &PlayerNote::default()).unwrap();
        assert_eq!(get(&conn, "Winamax", "bob").unwrap(), None);
    }

    #[test]
    fn only_known_tags_are_valid() {
        assert!(is_valid_tag("") && is_valid_tag("green"));
        assert!(!is_valid_tag("fish") && !is_valid_tag("GREEN"));
    }
}
