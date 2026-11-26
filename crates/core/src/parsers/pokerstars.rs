//! PokerStars tournament hand histories (Spin & Go).
//!
//! Format, as PokerStars writes it:
//!
//! ```text
//! PokerStars Hand #251345667040: Tournament #3456789012, $0.97+$0.03 USD Hold'em No Limit - Level I (25/50) - 2023/06/15 20:30:45 ET
//! Table '3456789012 1' 3-max Seat #1 is the button
//! Seat 1: Alice (500 in chips)
//! ...
//! ```
//!
//! The prize pool of a Spin & Go is not in the hand history (it is in the tournament summary), so
//! the multiplier stays unknown (1) and the euro figures leave those tournaments out.

use super::stars_like::{format_date, money, parse_hand, parse_level, set_blinds};
use super::{entry_cost, parse_f64, regex, split_before_marker, HandParser};
use crate::models::{ParseResult, ParsedHand};

const HAND_SEPARATOR: &str = "PokerStars Hand #";

pub struct PokerStarsParser;

/// Also reads the intermediate text the iPoker parser writes, which has this very header.
pub(super) fn read_header(line: &str, hand: &mut ParsedHand) -> bool {
    let header = regex!(
        r"^PokerStars Hand #(?<hand>\d+):\s+Tournament #(?<tid>\d+),\s+(?<buyin>[^\s+]+)\+(?<fee>[^\s+]+)(?:\+(?<bounty>[^\s]+))?\s*(?<ccy>[A-Z]{3})?\s+Hold'em No Limit - Level (?<level>[IVXLC\d]+) \((?<sb>\d+)/(?<bb>\d+)\) - (?<date>\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2})"
    );
    let Some(m) = header.captures(line) else { return false };
    hand.hand_id = Some(m["hand"].to_string());
    hand.game_id = Some(m["tid"].to_string());
    hand.tournament_id = Some(m["tid"].to_string());
    let (buy_in, fee) = (money(&m["buyin"]), money(&m["fee"]));
    hand.buy_in = entry_cost(buy_in, fee);
    hand.rake_per_player = Some(fee);
    hand.currency = m.name("ccy").map(|c| c.as_str().to_string());
    hand.buyin_currency = hand.currency.clone();
    hand.tournament_level = Some(parse_level(&m["level"]));
    hand.game_name = Some("Spin & Go".into());
    hand.date_time = format_date(&m["date"]);
    set_blinds(hand, parse_f64(&m["sb"]), parse_f64(&m["bb"]));
    true
}

impl HandParser for PokerStarsParser {
    fn room_name(&self) -> &'static str {
        "PokerStars"
    }

    fn parser_version(&self) -> u32 {
        1
    }

    fn hand_separator(&self) -> &'static str {
        HAND_SEPARATOR
    }

    fn detect_format(&self, content: &str) -> bool {
        content.contains("PokerStars Hand #") && content.contains("Tournament #")
    }

    fn parse_file(&self, content: &str) -> ParseResult {
        ParseResult::ok(split_before_marker(content, HAND_SEPARATOR).into_iter().filter_map(|block| self.parse_hand(block)).collect())
    }

    fn parse_hand(&self, hand_text: &str) -> Option<ParsedHand> {
        parse_hand(hand_text, "PokerStars", "Spin & Go", read_header)
    }
}

/// A PokerStars hand written by hand for the tests: it is NOT a real sample (see the roadmap notes).
#[cfg(test)]
pub(crate) const SYNTHETIC_SAMPLE: &str = include_str!("../../tests/fixtures/synthetic/pokerstars_spin_and_go.txt");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_header_and_the_table_are_read() {
        let hand = PokerStarsParser.parse_hand(SYNTHETIC_SAMPLE).unwrap();
        assert_eq!(hand.room.as_deref(), Some("PokerStars"));
        assert_eq!(hand.hand_id.as_deref(), Some("251345667040"));
        assert_eq!(hand.id.as_deref(), Some("251345667040"));
        assert_eq!(hand.game_id.as_deref(), Some("3456789012"));
        assert_eq!(hand.buy_in, 1.0);
        assert_eq!(hand.currency.as_deref(), Some("USD"));
        assert_eq!(hand.date_time.as_deref(), Some("2023-06-15 20:30:45"));
        assert_eq!(hand.blinds.as_deref(), Some("10/20"));
        assert_eq!(hand.tournament_level, Some(1));
        assert_eq!(hand.player_count, 3);
        assert_eq!((hand.flop.as_deref(), hand.turn.as_deref(), hand.river.as_deref()), (Some("2c 7d 9h"), Some("Js"), Some("3d")));
    }

    #[test]
    fn positions_cards_and_all_ins_are_read() {
        let hand = PokerStarsParser.parse_hand(SYNTHETIC_SAMPLE).unwrap();
        let find = |name: &str| hand.players.iter().find(|p| p.name == name).unwrap();
        assert_eq!((find("Alice").position.as_str(), find("Bob").position.as_str(), find("Hero").position.as_str()), ("BTN", "SB", "BB"));
        assert!(find("Hero").is_hero && !find("Bob").is_hero);
        assert_eq!(find("Hero").cards, "Ah Kd");
        assert_eq!(find("Bob").cards, "Qs Qd");
        assert!(find("Hero").is_all_in && find("Bob").is_all_in && !find("Alice").is_all_in);
        assert_eq!(hand.all_in_street.as_deref(), Some("PREFLOP"));
        assert!(hand.went_to_showdown);
    }

    #[test]
    fn money_adds_up_and_the_loser_loses_the_stack() {
        let hand = PokerStarsParser.parse_hand(SYNTHETIC_SAMPLE).unwrap();
        let find = |name: &str| hand.players.iter().find(|p| p.name == name).unwrap();
        assert_eq!((find("Bob").investment, find("Bob").chips_won, find("Bob").net_profit), (500.0, 1000.0, 500.0));
        assert_eq!((find("Hero").investment, find("Hero").net_profit), (500.0, -500.0));
        assert_eq!(find("Alice").investment, 0.0);
        assert_eq!(hand.players.iter().map(|p| p.net_profit).sum::<f64>(), 0.0, "chips are only moved around");
        assert_eq!(hand.total_pot, 1000.0);
    }

    #[test]
    fn an_uncalled_bet_comes_back_to_its_player() {
        let text = SYNTHETIC_SAMPLE
            .replace("Hero: calls 480 and is all-in\n", "Hero: calls 180\nBob: bets 0\n")
            .replace("Bob: raises 480 to 500 and is all-in", "Bob: raises 480 to 500 and is all-in\nUncalled bet (300) returned to Bob")
            .replace("Bob collected 1000 from pot", "Bob collected 400 from pot");
        let hand = PokerStarsParser.parse_hand(&text).unwrap();
        let bob = hand.players.iter().find(|p| p.name == "Bob").unwrap();
        assert_eq!(bob.investment, 200.0, "500 put in, 300 given back");
    }

    #[test]
    fn a_file_with_two_hands_gives_two_hands_and_other_text_is_not_detected() {
        let two = format!("{SYNTHETIC_SAMPLE}\n{}", SYNTHETIC_SAMPLE.replace("251345667040", "251345667041"));
        assert_eq!(PokerStarsParser.parse_file(&two).count, 2);
        assert!(PokerStarsParser.detect_format(SYNTHETIC_SAMPLE));
        assert!(!PokerStarsParser.detect_format("Winamax Poker - Tournament \"Expresso\""));
        assert!(PokerStarsParser.parse_hand("not a hand").is_none());
    }

    #[test]
    fn antes_are_dead_money_added_to_the_investment() {
        let text = SYNTHETIC_SAMPLE.replace("Bob: posts small blind 10", "Alice: posts the ante 5\nBob: posts the ante 5\nHero: posts the ante 5\nBob: posts small blind 10");
        let hand = PokerStarsParser.parse_hand(&text).unwrap();
        assert_eq!(hand.players.iter().find(|p| p.name == "Alice").unwrap().investment, 5.0);
        assert_eq!(hand.players.iter().find(|p| p.name == "Hero").unwrap().investment, 505.0);
    }
}
