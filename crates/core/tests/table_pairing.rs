//! Table-to-tournament pairing decisions.

use std::collections::HashMap;

use spintracker_core::services::table_pairing::{pair_tables, PairTournament, PairWindow};

fn window(id: isize, room: &str, title: &str) -> PairWindow {
    PairWindow { id, room: room.into(), title: title.into() }
}

fn tournament(room: &str, game_id: &str, name: &str) -> PairTournament {
    PairTournament { room: room.into(), game_id: game_id.into(), name: name.into() }
}

fn none() -> HashMap<isize, String> {
    HashMap::new()
}

#[test]
fn one_table_and_one_tournament_are_paired() {
    let pairs = pair_tables(&[window(1, "Winamax", "Table")], &[tournament("Winamax", "A", "Expresso")], &none());
    assert_eq!(pairs.get(&1).map(String::as_str), Some("A"));
}

#[test]
fn one_table_per_room_are_paired_independently() {
    let windows = [window(1, "Winamax", "Table"), window(2, "Unibet", "Table")];
    let tournaments = [tournament("Winamax", "A", "x"), tournament("Unibet", "B", "y")];
    let pairs = pair_tables(&windows, &tournaments, &none());
    assert_eq!(pairs.get(&1).map(String::as_str), Some("A"));
    assert_eq!(pairs.get(&2).map(String::as_str), Some("B"));
}

#[test]
fn a_manual_pairing_survives_while_another_room_has_tables() {
    let windows = [window(1, "Winamax", "Table"), window(2, "Unibet", "Table")];
    let tournaments = [tournament("Winamax", "A", "x"), tournament("Winamax", "A2", "x2"), tournament("Unibet", "B", "y")];
    let current = HashMap::from([(1, "A2".to_string())]);
    let pairs = pair_tables(&windows, &tournaments, &current);
    assert_eq!(pairs.get(&1).map(String::as_str), Some("A2"));
}

#[test]
fn a_manual_pairing_survives_when_the_other_room_has_no_window() {
    let windows = [window(1, "Winamax", "Table")];
    let tournaments = [tournament("Winamax", "A", "x"), tournament("Winamax", "A2", "x2"), tournament("Unibet", "B", "y")];
    let current = HashMap::from([(1, "A2".to_string())]);
    assert_eq!(pair_tables(&windows, &tournaments, &current).get(&1).map(String::as_str), Some("A2"));
}

#[test]
fn a_pairing_is_dropped_when_its_window_closed() {
    let current = HashMap::from([(1, "A".to_string())]);
    let pairs = pair_tables(&[window(2, "Winamax", "Table")], &[tournament("Winamax", "A", "x")], &current);
    assert_eq!(pairs.get(&1), None);
}

#[test]
fn a_pairing_is_dropped_when_its_tournament_ended() {
    let current = HashMap::from([(1, "A".to_string())]);
    let pairs = pair_tables(&[window(1, "Winamax", "Table")], &[], &current);
    assert!(pairs.is_empty());
}

#[test]
fn identical_titles_and_one_free_tournament_pair_nothing() {
    let windows = [window(1, "Winamax", "Expresso Nitro"), window(2, "Winamax", "Expresso Nitro")];
    let pairs = pair_tables(&windows, &[tournament("Winamax", "A", "Expresso Nitro")], &none());
    assert!(pairs.is_empty());
}

#[test]
fn two_tables_and_two_tournaments_without_proof_pair_nothing() {
    let windows = [window(1, "Winamax", "Table"), window(2, "Winamax", "Table")];
    let tournaments = [tournament("Winamax", "A", "x"), tournament("Winamax", "B", "y")];
    assert!(pair_tables(&windows, &tournaments, &none()).is_empty());
}

#[test]
fn a_title_naming_one_tournament_pairs_that_table_only() {
    let windows = [window(1, "Winamax", "Table 1096047576"), window(2, "Winamax", "Table")];
    let tournaments = [tournament("Winamax", "1096047576", "x"), tournament("Winamax", "1096048521", "y")];
    let pairs = pair_tables(&windows, &tournaments, &none());
    assert_eq!(pairs.get(&1).map(String::as_str), Some("1096047576"));
    assert_eq!(pairs.get(&2), None);
}

#[test]
fn a_new_table_next_to_a_still_active_old_tournament_is_left_to_the_user() {
    // The previous table closed but its tournament was written to recently: two candidates, no proof.
    let tournaments = [tournament("Winamax", "OLD", "x"), tournament("Winamax", "NEW", "y")];
    assert!(pair_tables(&[window(3, "Winamax", "Table")], &tournaments, &none()).is_empty());
}

#[test]
fn a_tournament_is_never_given_to_two_tables() {
    let windows = [window(1, "Winamax", "Table"), window(2, "Winamax", "Table")];
    let current = HashMap::from([(1, "A".to_string())]);
    let pairs = pair_tables(&windows, &[tournament("Winamax", "A", "x"), tournament("Winamax", "B", "y")], &current);
    assert_eq!(pairs.get(&1).map(String::as_str), Some("A"));
    assert_eq!(pairs.get(&2).map(String::as_str), Some("B"));
}
