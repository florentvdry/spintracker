//! Removes the player names from a hand-history file, so hands can be attached to a public issue.
//!
//! Every name found by the room's parser is replaced by the same stand-in everywhere in the file
//! (the hero is `Hero`, the others `Player A`, `Player B`...), so the hands still read and parse the
//! same. A name is only replaced where it stands alone: `Ann` inside `Anna` is left alone.

use std::collections::HashMap;

use regex::Regex;

use crate::parsers::get_parser;
use crate::{Error, Result};

/// Letters that make a name part of a longer word.
fn is_name_char(c: char) -> bool {
    c.is_alphanumeric() || matches!(c, '_' | '-')
}

/// What the anonymised file is, and how many names were replaced.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Anonymized {
    pub text: String,
    pub names: usize,
}

/// `Player A`, `Player B`... `Player Z`, then `Player 27`...
fn stand_in(index: usize) -> String {
    match u8::try_from(index).ok().filter(|i| *i < 26) {
        Some(i) => format!("Player {}", char::from(b'A' + i)),
        None => format!("Player {}", index + 1),
    }
}

pub fn anonymize(content: &str) -> Result<Anonymized> {
    let parser = get_parser(content).ok_or_else(|| Error::Message("This file is not a hand history SpinTracker reads.".into()))?;
    let parsed = parser.parse_file(content);

    // Names in order of appearance, the hero named first.
    let mut stand_ins: HashMap<String, String> = HashMap::new();
    let mut others = 0;
    for hand in &parsed.hands {
        for player in &hand.players {
            if player.name.trim().is_empty() || stand_ins.contains_key(&player.name) {
                continue;
            }
            if player.is_hero {
                stand_ins.insert(player.name.clone(), "Hero".into());
            } else {
                stand_ins.insert(player.name.clone(), stand_in(others));
                others += 1;
            }
        }
    }
    // A name found as the hero in one hand and as an opponent in another keeps the hero's stand-in.
    for hand in &parsed.hands {
        for player in hand.players.iter().filter(|p| p.is_hero) {
            stand_ins.insert(player.name.clone(), "Hero".into());
        }
    }
    if stand_ins.is_empty() {
        return Ok(Anonymized { text: content.to_string(), names: 0 });
    }

    let mut names: Vec<&String> = stand_ins.keys().collect();
    // The longest first: a name that contains another one must win.
    names.sort_by_key(|n| std::cmp::Reverse(n.len()));
    let pattern = names.iter().map(|n| regex::escape(n)).collect::<Vec<_>>().join("|");
    let re = Regex::new(&pattern).map_err(|e| Error::Message(e.to_string()))?;

    let text = re.replace_all(content, |caps: &regex::Captures| {
        let whole = caps.get(0).expect("a match has a whole");
        let before = content[..whole.start()].chars().next_back();
        let after = content[whole.end()..].chars().next();
        if before.is_some_and(is_name_char) || after.is_some_and(is_name_char) {
            whole.as_str().to_string()
        } else {
            stand_ins[whole.as_str()].clone()
        }
    });
    Ok(Anonymized { text: text.into_owned(), names: stand_ins.len() })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = include_str!("../../tests/fixtures/exemple-data/Winamax/20260415_Expresso(1096047576)_real_holdem_no-limit.txt");
    const OPPONENTS: [&str; 2] = ["riickyy777", "CG_Boss2336"];

    #[test]
    fn names_are_replaced_everywhere_and_the_hands_still_parse() {
        let anonymized = anonymize(SAMPLE).unwrap();
        for name in OPPONENTS {
            assert!(!anonymized.text.contains(name), "{name} is still there");
        }
        assert!(anonymized.text.contains("Dealt to Hero ["));
        assert!(anonymized.text.contains("Player A") && anonymized.text.contains("Player B"));

        let before = get_parser(SAMPLE).unwrap().parse_file(SAMPLE);
        let after = get_parser(&anonymized.text).unwrap().parse_file(&anonymized.text);
        assert_eq!(before.count, after.count);
        let totals = |hands: &[crate::models::ParsedHand]| {
            hands.iter().flat_map(|h| h.players.iter().map(|p| (p.net_profit, p.investment))).collect::<Vec<_>>()
        };
        assert_eq!(totals(&before.hands), totals(&after.hands), "the figures do not change");
    }

    #[test]
    fn the_same_player_gets_the_same_stand_in_in_every_hand() {
        let anonymized = anonymize(SAMPLE).unwrap();
        let parsed = get_parser(&anonymized.text).unwrap().parse_file(&anonymized.text);
        let names: std::collections::HashSet<&str> =
            parsed.hands.iter().flat_map(|h| h.players.iter().map(|p| p.name.as_str())).collect();
        assert_eq!(names.len(), anonymized.names, "{names:?}");
    }

    #[test]
    fn a_name_inside_a_longer_word_is_left_alone() {
        let text = format!("{SAMPLE}
riickyy777zz");
        assert!(anonymize(&text).unwrap().text.contains("riickyy777zz"));
    }

    #[test]
    fn an_unknown_file_is_refused() {
        assert!(anonymize("just some text").is_err());
    }
}
