//! Decides which poker table window shows which tournament.
//!
//! Pure on purpose: the desktop shell lists the windows (Windows only) and the database lists the
//! tournaments being played; this module only decides, so every case is testable anywhere.
//!
//! A pairing is only made on proof. With several candidates and nothing in a window title to tell
//! them apart, the table is left for the user to associate: a wrong panel is worse than none.

use std::collections::{HashMap, HashSet};

/// A table window as the shell sees it. `id` is the native window handle.
#[derive(Debug, Clone)]
pub struct PairWindow {
    pub id: isize,
    pub room: String,
    pub title: String,
}

/// A tournament with hands written recently.
#[derive(Debug, Clone)]
pub struct PairTournament {
    pub room: String,
    pub game_id: String,
    pub name: String,
}

/// A tournament name shorter than this is too generic to prove anything about a window title.
const MIN_NAME_LEN_IN_TITLE: usize = 6;

/// Whether a window title names a tournament (its id, or its name when long enough to mean something).
fn title_names(title: &str, tournament: &PairTournament) -> bool {
    let title = title.to_lowercase();
    let id = tournament.game_id.to_lowercase();
    let name = tournament.name.to_lowercase();
    (!id.is_empty() && title.contains(&id)) || (name.len() >= MIN_NAME_LEN_IN_TITLE && title.contains(&name))
}

/// The pairings after one look at the screen.
///
/// `current` holds the pairings from the previous look (automatic or chosen by the user). They are
/// kept as long as both the window and the tournament still exist, in any room, then the windows
/// and tournaments that are left are paired room by room.
pub fn pair_tables(
    windows: &[PairWindow],
    tournaments: &[PairTournament],
    current: &HashMap<isize, String>,
) -> HashMap<isize, String> {
    let mut pairs: HashMap<isize, String> = current
        .iter()
        .filter(|(id, game)| {
            windows.iter().any(|w| w.id == **id) && tournaments.iter().any(|t| &t.game_id == *game)
        })
        .map(|(id, game)| (*id, game.clone()))
        .collect();

    let mut rooms: Vec<&str> = windows.iter().map(|w| w.room.as_str()).collect();
    rooms.sort_unstable();
    rooms.dedup();

    for room in rooms {
        let claimed: HashSet<&str> = pairs.values().map(String::as_str).collect();
        let free_windows: Vec<&PairWindow> =
            windows.iter().filter(|w| w.room == room && !pairs.contains_key(&w.id)).collect();
        let free_tournaments: Vec<&PairTournament> =
            tournaments.iter().filter(|t| t.room == room && !claimed.contains(t.game_id.as_str())).collect();

        let mut new_pairs: Vec<(isize, String)> = Vec::new();
        if let ([window], [tournament]) = (free_windows.as_slice(), free_tournaments.as_slice()) {
            new_pairs.push((window.id, tournament.game_id.clone()));
        } else {
            // Each window must name exactly one tournament, and no other window may name the same one.
            let named: Vec<(isize, Vec<&str>)> = free_windows
                .iter()
                .map(|w| {
                    let games = free_tournaments.iter().filter(|t| title_names(&w.title, t)).map(|t| t.game_id.as_str());
                    (w.id, games.collect())
                })
                .collect();
            for (id, games) in &named {
                if let [game] = games.as_slice() {
                    let named_by = named.iter().filter(|(_, g)| g.contains(game)).count();
                    if named_by == 1 {
                        new_pairs.push((*id, (*game).to_string()));
                    }
                }
            }
        }
        pairs.extend(new_pairs);
    }
    pairs
}
