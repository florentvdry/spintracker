//! Reading a hand's preflop action line: who did what, in which order.
//!
//! The functions take the raw preflop text and the "Name:POS|Name:POS" seat map, so they do not
//! depend on how a service loads its hands.

use std::collections::HashMap;

/// The line without its "HH:MM:SS - " prefix.
pub fn strip_timestamp(line: &str) -> String {
    let line = line.trim();
    match line.split_once(" - ") {
        Some((_, rest)) => rest.trim().to_string(),
        None => line.to_string(),
    }
}

/// Splits "Name: action" or "Name action" into the name and the lower-cased action text.
pub fn split_player_and_content(line: &str) -> Option<(String, String)> {
    let line = strip_timestamp(line);
    if let Some(colon) = line.find(':') {
        return Some((line[..colon].trim().to_string(), line[colon + 1..].trim().to_lowercase()));
    }
    let space = line.find(' ')?;
    Some((line[..space].trim().to_string(), line[space..].trim().to_lowercase()))
}

/// Seats by lower-cased player name, from "Player1:BTN|Player2:SB".
pub fn player_positions(map: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for pair in map.split('|') {
        let parts: Vec<&str> = pair.split(':').collect();
        if let [name, position] = parts[..] {
            out.insert(name.to_lowercase(), position.to_string());
        }
    }
    out
}

/// The verb of an action text, when it is a betting action.
fn verb_of(content: &str) -> Option<&'static str> {
    if content.contains("all-in") {
        Some("all-in")
    } else if content.contains("raises") {
        Some("raise")
    } else if content.contains("bets") {
        Some("bet")
    } else if content.contains("calls") {
        Some("call")
    } else if content.contains("checks") {
        Some("check")
    } else if content.contains("folds") {
        Some("fold")
    } else {
        // Posts, antes and anything unknown are skipped.
        None
    }
}

/// The preflop actions as "POSITION:verb" in order, posts excluded.
pub fn preflop_sequence(preflop: &str, positions: &str) -> Vec<String> {
    let seats = player_positions(positions);
    let mut out = Vec::new();
    for line in preflop.split('\n').filter(|l| !l.is_empty()) {
        let Some((player, content)) = split_player_and_content(line) else { continue };
        let Some(position) = seats.get(&player.to_lowercase()) else { continue };
        let Some(verb) = verb_of(&content) else { continue };
        out.push(format!("{position}:{verb}"));
    }
    out
}

/// Whether the hand's preflop line starts with `sequence` (positions and verbs, case-insensitive).
pub fn matches_action_sequence(preflop: &str, positions: &str, sequence: &[String]) -> bool {
    if sequence.is_empty() {
        return true;
    }
    if preflop.is_empty() {
        return false;
    }
    let actual = preflop_sequence(preflop, positions);
    actual.len() >= sequence.len() && sequence.iter().zip(&actual).all(|(wanted, got)| wanted.eq_ignore_ascii_case(got))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SEATS: &str = "Hero:BTN|SB:SB|BB:BB";

    #[test]
    fn action_sequences_match_in_order() {
        let preflop = "SB: Posts SB 10\nBB: Posts BB 20\nHero: Raises to 50\nSB: Calls 40\nBB: Folds";
        assert!(matches_action_sequence(preflop, SEATS, &["BTN:raise".into(), "SB:call".into()]));
        assert!(matches_action_sequence(preflop, SEATS, &["btn:Raise".into()]));
        assert!(!matches_action_sequence(preflop, SEATS, &["BTN:call".into()]));
        assert!(!matches_action_sequence(preflop, SEATS, &["BTN:raise".into(), "SB:call".into(), "BB:fold".into(), "BTN:check".into()]));
    }

    #[test]
    fn the_sequence_skips_posts() {
        let preflop = "SB: Posts SB 10\nBB: Posts BB 20\nHero: Folds\nSB: Calls 10";
        assert_eq!(preflop_sequence(preflop, SEATS), vec!["BTN:fold", "SB:call"]);
    }
}
