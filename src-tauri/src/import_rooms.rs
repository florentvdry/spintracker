//! Per-room figures of an import in progress: how many hands and tournaments each room has
//! delivered so far, against the hands its files contain.

use std::collections::BTreeMap;

use serde_json::{json, Value};

/// What one file has delivered so far.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct FileFigures {
    pub imported: u64,
    pub skipped: u64,
    pub tournaments: u64,
}

/// Rooms of the files being imported (`None` for a file no parser recognised) and their hand totals.
pub struct RoomTracker {
    files: Vec<(Option<String>, u64)>,
    progress: Vec<FileFigures>,
}

impl RoomTracker {
    pub fn new(files: Vec<Option<(String, usize)>>) -> Self {
        let progress = vec![FileFigures::default(); files.len()];
        let files = files.into_iter().map(|f| f.map_or((None, 0), |(room, hands)| (Some(room), hands as u64))).collect();
        Self { files, progress }
    }

    pub fn total_hands(&self) -> u64 {
        self.files.iter().map(|(_, hands)| hands).sum()
    }

    pub fn update(&mut self, file: usize, figures: FileFigures) {
        if let Some(slot) = self.progress.get_mut(file) {
            *slot = figures;
        }
    }

    pub fn tournaments(&self) -> u64 {
        self.progress.iter().map(|p| p.tournaments).sum()
    }

    /// One entry per room, in alphabetical order; files of an unknown format are left out.
    pub fn rooms_json(&self) -> Value {
        let mut rooms: BTreeMap<&str, (u64, FileFigures)> = BTreeMap::new();
        for ((room, hands), done) in self.files.iter().zip(&self.progress) {
            let Some(room) = room else { continue };
            let entry = rooms.entry(room.as_str()).or_default();
            entry.0 += hands;
            entry.1.imported += done.imported;
            entry.1.skipped += done.skipped;
            entry.1.tournaments += done.tournaments;
        }
        Value::Array(
            rooms
                .into_iter()
                .map(|(room, (total, done))| {
                    json!({
                        "room": room,
                        "totalHands": total,
                        "handsImported": done.imported,
                        "handsSkipped": done.skipped,
                        "tournaments": done.tournaments,
                    })
                })
                .collect(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tracker() -> RoomTracker {
        RoomTracker::new(vec![
            Some(("Winamax".into(), 100)),
            Some(("Betclic".into(), 40)),
            Some(("Winamax".into(), 60)),
            None,
        ])
    }

    #[test]
    fn totals_add_up_by_room_and_unknown_files_are_ignored() {
        let rooms = tracker().rooms_json();
        assert_eq!(rooms[0]["room"], "Betclic");
        assert_eq!(rooms[0]["totalHands"], 40);
        assert_eq!(rooms[1]["room"], "Winamax");
        assert_eq!(rooms[1]["totalHands"], 160);
        assert_eq!(rooms.as_array().unwrap().len(), 2);
        assert_eq!(tracker().total_hands(), 200);
    }

    #[test]
    fn progress_is_summed_over_the_files_of_a_room() {
        let mut t = tracker();
        t.update(0, FileFigures { imported: 100, skipped: 2, tournaments: 5 });
        t.update(2, FileFigures { imported: 10, skipped: 0, tournaments: 1 });
        let rooms = t.rooms_json();
        assert_eq!(rooms[1]["handsImported"], 110);
        assert_eq!(rooms[1]["handsSkipped"], 2);
        assert_eq!(rooms[1]["tournaments"], 6);
        assert_eq!(rooms[0]["handsImported"], 0);
        assert_eq!(t.tournaments(), 6);
    }

    #[test]
    fn an_update_for_a_missing_file_is_ignored() {
        let mut t = tracker();
        t.update(99, FileFigures { imported: 1, skipped: 0, tournaments: 1 });
        assert_eq!(t.tournaments(), 0);
    }
}
