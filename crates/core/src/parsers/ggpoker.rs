//! GGPoker tournament hand histories (Spin Gold).
//!
//! GGPoker writes the body of a hand like PokerStars; only the first line differs:
//!
//! ```text
//! Poker Hand #TM123456789: Tournament #98765432, Spin Gold $5 Hold'em No Limit - Level1(100/200) - 2023/06/15 20:30:45
//! ```
//!
//! No real GGPoker sample was available when this parser was written: the header below is read from
//! what is publicly documented, tolerantly (the buy-in is the first amount of the title, the level may
//! be glued to its number), and the tests use a SYNTHETIC hand. A real file may need small changes.

use super::stars_like::{format_date, money, parse_hand, parse_level, set_blinds};
use super::{parse_f64, regex, split_before_marker, HandParser};
use crate::models::{ParseResult, ParsedHand};

const HAND_SEPARATOR: &str = "Poker Hand #";

pub struct GgPokerParser;

fn read_header(line: &str, hand: &mut ParsedHand) -> bool {
    let header = regex!(
        r"^Poker Hand #(?<hand>[A-Za-z]*\d+):\s+Tournament #(?<tid>\d+),\s+(?<title>.*?)\s*Hold'em No Limit\s*-\s*Level\s*(?<level>[IVXLC\d]+)\s*\((?<sb>\d+)/(?<bb>\d+)\)\s*-\s*(?<date>\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2})"
    );
    let Some(m) = header.captures(line) else { return false };
    hand.hand_id = Some(m["hand"].to_string());
    hand.game_id = Some(m["tid"].to_string());
    hand.tournament_id = Some(m["tid"].to_string());
    let title = m["title"].trim().trim_end_matches(',').trim();
    // The buy-in is the first amount of the title ("Spin Gold $5"); GGPoker prices a Spin as one figure.
    if let Some(amount) = regex!(r"([$€£])\s?(\d+(?:[.,]\d+)?)").captures(title) {
        hand.buy_in = money(&amount[2]);
        hand.currency = Some(match &amount[1] {
            "€" => "EUR",
            "£" => "GBP",
            _ => "USD",
        }
        .to_string());
        hand.buyin_currency = hand.currency.clone();
    }
    hand.game_name = Some(if title.is_empty() { "Spin Gold".into() } else { title.to_string() });
    hand.tournament_name = hand.game_name.clone();
    hand.tournament_level = Some(parse_level(&m["level"]));
    hand.date_time = format_date(&m["date"]);
    set_blinds(hand, parse_f64(&m["sb"]), parse_f64(&m["bb"]));
    true
}

impl HandParser for GgPokerParser {
    fn room_name(&self) -> &'static str {
        "GGPoker"
    }

    fn parser_version(&self) -> u32 {
        1
    }

    fn hand_separator(&self) -> &'static str {
        HAND_SEPARATOR
    }

    fn detect_format(&self, content: &str) -> bool {
        regex!(r"(?m)^Poker Hand #[A-Za-z]*\d+:\s+Tournament #").is_match(content)
    }

    fn parse_file(&self, content: &str) -> ParseResult {
        ParseResult::ok(split_before_marker(content, HAND_SEPARATOR).into_iter().filter_map(|block| self.parse_hand(block)).collect())
    }

    fn parse_hand(&self, hand_text: &str) -> Option<ParsedHand> {
        parse_hand(hand_text, "GGPoker", "Spin Gold", read_header)
    }
}

/// A GGPoker hand written by hand for the tests: it is NOT a real sample (see the roadmap notes).
#[cfg(test)]
pub(crate) const SYNTHETIC_SAMPLE: &str = include_str!("../../tests/fixtures/synthetic/ggpoker_spin_gold.txt");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_header_is_read_tolerantly() {
        let hand = GgPokerParser.parse_hand(SYNTHETIC_SAMPLE).unwrap();
        assert_eq!(hand.room.as_deref(), Some("GGPoker"));
        assert_eq!(hand.hand_id.as_deref(), Some("TM123456789"));
        assert_eq!(hand.game_id.as_deref(), Some("98765432"));
        assert_eq!(hand.buy_in, 5.0);
        assert_eq!(hand.currency.as_deref(), Some("USD"));
        assert_eq!(hand.game_name.as_deref(), Some("Spin Gold $5"));
        assert_eq!(hand.blinds.as_deref(), Some("100/200"));
        assert_eq!(hand.tournament_level, Some(1));
        assert_eq!(hand.date_time.as_deref(), Some("2023-06-15 20:30:45"));
    }

    #[test]
    fn positions_and_money_follow_the_body() {
        let hand = GgPokerParser.parse_hand(SYNTHETIC_SAMPLE).unwrap();
        let find = |name: &str| hand.players.iter().find(|p| p.name == name).unwrap();
        assert_eq!((find("Bob").position.as_str(), find("Alice").position.as_str(), find("Hero").position.as_str()), ("BTN", "SB", "BB"));
        assert_eq!((find("Hero").investment, find("Hero").net_profit), (1500.0, 1600.0));
        assert_eq!((find("Bob").investment, find("Bob").net_profit), (1500.0, -1500.0));
        assert_eq!((find("Alice").investment, find("Alice").net_profit), (100.0, -100.0));
        assert_eq!(hand.players.iter().map(|p| p.net_profit).sum::<f64>(), 0.0);
        assert!(find("Hero").is_hero);
    }

    #[test]
    fn detection_does_not_take_over_a_pokerstars_file() {
        assert!(GgPokerParser.detect_format(SYNTHETIC_SAMPLE));
        assert!(!GgPokerParser.detect_format(crate::parsers::pokerstars::SYNTHETIC_SAMPLE.replace("PokerStars Hand", "PokerStars  Hand").as_str()));
        assert!(!GgPokerParser.detect_format("Winamax Poker - Tournament \"Expresso\""));
        assert!(GgPokerParser.parse_hand("garbage").is_none());
    }
}
