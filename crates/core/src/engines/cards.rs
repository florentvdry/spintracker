//! Card encoding shared by the evaluator and the equity calculator.
//!
//! A card is `rank * 4 + suit`, with rank 2..A mapped to 0..12 and suits h, d, c, s
//! mapped to 0..3 (the same encoding as the C# backend).

use crate::{Error, Result};

pub type Card = u8;

const RANKS: &[u8; 13] = b"23456789TJQKA";
const SUITS: &[u8; 4] = b"hdcs";

#[inline]
pub fn rank(card: Card) -> usize {
    (card >> 2) as usize
}

#[inline]
pub fn suit(card: Card) -> usize {
    (card & 3) as usize
}

pub fn card_to_string(card: Card) -> String {
    format!("{}{}", RANKS[rank(card)] as char, SUITS[suit(card)] as char)
}

fn parse_card(rank_ch: char, suit_ch: char) -> Result<Card> {
    let rank_ch = rank_ch.to_ascii_uppercase();
    let suit_ch = suit_ch.to_ascii_lowercase();
    let r = RANKS
        .iter()
        .position(|&c| c as char == rank_ch)
        .ok_or_else(|| Error::Message(format!("Invalid card rank: '{rank_ch}'")))?;
    let s = SUITS
        .iter()
        .position(|&c| c as char == suit_ch)
        .ok_or_else(|| Error::Message(format!("Invalid card suit: '{suit_ch}'")))?;
    Ok((r * 4 + s) as Card)
}

/// Parses cards such as `"Ah Kd"`, `"Ah,Kd"`, `"Ah-Kd"` or `"AhKd"`.
///
/// Rank is case-insensitive for the letter cards, suit is case-insensitive. Tokens are split
/// on spaces, commas and dashes; each token is read as consecutive two-character cards.
/// A blank string yields no card.
pub fn parse_cards(text: &str) -> Result<Vec<Card>> {
    let mut cards = Vec::new();
    for token in text.split([' ', ',', '-']).filter(|t| !t.is_empty()) {
        let chars: Vec<char> = token.chars().collect();
        for pair in chars.chunks(2) {
            // A trailing single character is ignored, like the former backend did.
            if let [r, s] = pair {
                cards.push(parse_card(*r, *s)?);
            }
        }
    }
    Ok(cards)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encoding_matches_the_reference_layout() {
        assert_eq!(parse_cards("2h").unwrap(), vec![0]);
        assert_eq!(parse_cards("2s").unwrap(), vec![3]);
        assert_eq!(parse_cards("Ah").unwrap(), vec![48]);
        assert_eq!(parse_cards("As").unwrap(), vec![51]);
        assert_eq!(card_to_string(51), "As");
    }

    #[test]
    fn accepts_separators_case_and_packed_cards() {
        let expected = parse_cards("Ah Kd").unwrap();
        for input in ["Ah,Kd", "ah-kd", "  AH   KD ", "AhKd"] {
            assert_eq!(parse_cards(input).unwrap(), expected, "input {input:?}");
        }
        assert!(parse_cards("").unwrap().is_empty());
        assert!(parse_cards("   ").unwrap().is_empty());
    }

    #[test]
    fn rejects_unknown_rank_or_suit() {
        assert!(parse_cards("Xh").is_err());
        assert!(parse_cards("Ax").is_err());
    }
}
