//! iPoker network hand histories (XML), which PMU's Twister uses.
//!
//! The XML is turned into the text layout of [`super::stars_like`] and read from there, so a hand
//! of the iPoker network goes through the same stored form as the other rooms.
//!
//! The layout this parser reads (every `<game>` is self-contained, because hands are cut out of the
//! file one by one):
//!
//! ```xml
//! <game gamecode="9000000001">
//!   <general>
//!     <site>PMU</site>                 <!-- the room: PMU, else "iPoker" -->
//!     <nickname>Hero</nickname>        <!-- the player who exported the file -->
//!     <tournamentcode>770011</tournamentcode>
//!     <tournamentname>Twister</tournamentname>
//!     <buyin>€0.93+€0.07</buyin>       <!-- buy-in + fee, or one amount -->
//!     <currency>EUR</currency>
//!     <startdate>2023-06-15 20:30:45</startdate>
//!     <tablesize>3</tablesize>
//!     <players><player seat="1" name="Alice" chips="€500" dealer="1" win="€0" bet="€0"/></players>
//!   </general>
//!   <round no="0"> blinds (action type 1 and 2) and the hero's pocket cards </round>
//!   <round no="1"> preflop actions </round>
//!   <round no="2"> <cards type="Flop"> ... </cards> and its actions </round> (then Turn, River)
//!   <round no="n"> <cards type="Pocket" player="Bob">SQ DQ</cards> shown at showdown </round>
//! </game>
//! ```
//!
//! Cards are a suit letter then a rank (`DA` is the ace of diamonds). Action types: 0 fold, 1 small
//! blind, 2 big blind, 3 call, 4 check, 5 bet, 7 all-in, 15 ante, 23 raise; `sum` is what the action
//! puts in. This was written WITHOUT a real file: the tags and the action codes are the part to
//! check against a real export (see the roadmap notes).

use super::pokerstars::read_header;
use super::stars_like::{money, parse_hand};
use super::{regex, HandParser};
use crate::models::{ParseResult, ParsedHand};

const HAND_SEPARATOR: &str = "<game ";
/// Stands for the board of a new street among the action lines being written.
const STREET_MARK: &str = "<street>";

pub struct IPokerParser;

/// The text of an element (`<tag>text</tag>`) within `xml`.
fn element<'a>(xml: &'a str, tag: &str) -> Option<&'a str> {
    let open = format!("<{tag}>");
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&format!("</{tag}>"))? + start;
    Some(xml[start..end].trim())
}

/// The value of an attribute in a tag's text (`seat="1"`).
fn attribute(tag: &str, name: &str) -> Option<String> {
    let re = regex::Regex::new(&format!(r#"\b{}="([^"]*)""#, regex::escape(name))).ok()?;
    re.captures(tag).map(|c| c[1].to_string())
}

/// `DA` -> `Ad`, `S10` -> `Ts`.
fn card(code: &str) -> Option<String> {
    let suit = match code.chars().next()? {
        'C' => 'c',
        'D' => 'd',
        'H' => 'h',
        'S' => 's',
        _ => return None,
    };
    let rank = match &code[1..] {
        "10" => "T".to_string(),
        r if r.len() == 1 => r.to_ascii_uppercase(),
        _ => return None,
    };
    Some(format!("{rank}{suit}"))
}

fn cards(text: &str) -> Vec<String> {
    text.split_whitespace().filter_map(card).collect()
}

/// A number the text writes with a symbol, without the symbol.
fn chips(text: &str) -> f64 {
    money(text)
}

struct Seat {
    seat: String,
    name: String,
    stack: f64,
    dealer: bool,
    win: f64,
}

/// The hand rewritten in the layout `stars_like` reads. `None` when the XML lacks what a hand needs.
fn to_text(xml: &str) -> Option<(String, &'static str)> {
    let game_tag = regex!(r"<game\b[^>]*>").find(xml)?.as_str();
    let game_code = attribute(game_tag, "gamecode")?;
    let general = element(xml, "general")?;
    let nickname = element(general, "nickname")?;
    let tournament = element(general, "tournamentcode").unwrap_or("0");
    let date = element(general, "startdate")?.replace('-', "/");
    let currency = element(general, "currency").unwrap_or("EUR");
    let buy_in = element(general, "buyin").unwrap_or("0");
    let (price, fee) = buy_in.split_once('+').unwrap_or((buy_in, "0"));
    let room = if element(general, "site").is_some_and(|s| s.to_ascii_uppercase().contains("PMU")) { "PMU" } else { "iPoker" };

    let seats: Vec<Seat> = regex!(r"<player\b[^>]*/?>")
        .find_iter(xml)
        .filter_map(|m| {
            let tag = m.as_str();
            Some(Seat {
                seat: attribute(tag, "seat")?,
                name: attribute(tag, "name")?,
                stack: chips(&attribute(tag, "chips")?),
                dealer: attribute(tag, "dealer").as_deref() == Some("1"),
                win: attribute(tag, "win").map_or(0.0, |w| chips(&w)),
            })
        })
        .collect();
    if seats.len() < 2 {
        return None;
    }
    let button = seats.iter().find(|s| s.dealer).map(|s| s.seat.clone()).unwrap_or_else(|| seats[0].seat.clone());

    let rounds: Vec<&str> = regex!(r"(?s)<round\b.*?</round>").find_iter(xml).map(|m| m.as_str()).collect();
    let action_re = regex!(r"<action\b[^>]*/?>");
    let cards_re = regex!(r"(?s)<cards\b([^>]*)>(.*?)</cards>");

    // Blinds and the hero's cards come from round 0; the amounts decide the blind level.
    let (mut small, mut big) = (0.0, 0.0);
    let mut lines: Vec<String> = Vec::new();
    let mut hero_cards = Vec::new();
    let mut shown: Vec<(String, Vec<String>)> = Vec::new();
    let mut board: Vec<(String, Vec<String>)> = Vec::new();
    let mut street_totals: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    let mut highest = 0.0f64;

    let mut post_lines = Vec::new();
    for round in &rounds {
        // A new street starts with the board: the bets in front of the players are gone.
        if ["Flop", "Turn", "River"].iter().any(|street| round.contains(&format!("<cards type=\"{street}\""))) {
            street_totals.clear();
            highest = 0.0;
            lines.push(STREET_MARK.to_string());
        }
        for c in cards_re.captures_iter(round) {
            let (kind, owner) = (attribute(&c[1], "type").unwrap_or_default(), attribute(&c[1], "player").unwrap_or_default());
            let list = cards(&c[2]);
            if kind == "Pocket" {
                if owner == nickname && hero_cards.is_empty() {
                    hero_cards = list;
                } else if !list.is_empty() && owner != nickname {
                    shown.push((owner, list));
                }
            } else {
                board.push((kind, list));
            }
        }
        for m in action_re.find_iter(round) {
            let tag = m.as_str();
            let (Some(player), Some(kind)) = (attribute(tag, "player"), attribute(tag, "type")) else { continue };
            let sum = attribute(tag, "sum").map_or(0.0, |s| chips(&s));
            let total = street_totals.get(&player).copied().unwrap_or(0.0) + sum;
            let text = match kind.as_str() {
                "1" => {
                    small = sum;
                    post_lines.push(format!("{player}: posts small blind {}", fmt(sum)));
                    street_totals.insert(player, total);
                    highest = highest.max(total);
                    continue;
                }
                "2" => {
                    big = sum;
                    post_lines.push(format!("{player}: posts big blind {}", fmt(sum)));
                    street_totals.insert(player, total);
                    highest = highest.max(total);
                    continue;
                }
                "15" => {
                    post_lines.push(format!("{player}: posts the ante {}", fmt(sum)));
                    continue;
                }
                "0" => format!("{player}: folds"),
                "4" => format!("{player}: checks"),
                "3" => format!("{player}: calls {}", fmt(sum)),
                "5" | "23" | "7" => {
                    let all_in = if kind == "7" { " and is all-in" } else { "" };
                    if total > highest && highest > 0.0 {
                        format!("{player}: raises {} to {}{all_in}", fmt(total - highest), fmt(total))
                    } else if total > highest {
                        format!("{player}: bets {}{all_in}", fmt(sum))
                    } else {
                        format!("{player}: calls {}{all_in}", fmt(sum))
                    }
                }
                _ => continue,
            };
            street_totals.insert(player, total);
            highest = highest.max(total);
            lines.push(text);
        }
    }

    let flop = board.iter().find(|(k, _)| k == "Flop").map(|(_, c)| c.clone()).unwrap_or_default();
    let turn = board.iter().find(|(k, _)| k == "Turn").map(|(_, c)| c.clone()).unwrap_or_default();
    let river = board.iter().find(|(k, _)| k == "River").map(|(_, c)| c.clone()).unwrap_or_default();

    let mut out = Vec::new();
    out.push(format!(
        "PokerStars Hand #{game_code}: Tournament #{tournament}, {}+{} {currency} Hold'em No Limit - Level I ({}/{}) - {date}",
        fmt(chips(price)),
        fmt(chips(fee)),
        fmt(small),
        fmt(big)
    ));
    out.push(format!("Table '{tournament} 1' {}-max Seat #{button} is the button", seats.len()));
    for s in &seats {
        out.push(format!("Seat {}: {} ({} in chips)", s.seat, s.name, fmt(s.stack)));
    }
    out.extend(post_lines);
    out.push("*** HOLE CARDS ***".into());
    if !hero_cards.is_empty() {
        out.push(format!("Dealt to {nickname} [{}]", hero_cards.join(" ")));
    }
    // The actions after each board marker belong to that street.
    let mut stage = 0;
    for line in lines {
        if line == STREET_MARK {
            stage += 1;
            let (title, shown_cards, before) = match stage {
                1 => ("FLOP", flop.join(" "), String::new()),
                2 => ("TURN", turn.join(" "), flop.join(" ")),
                _ => ("RIVER", river.join(" "), format!("{} {}", flop.join(" "), turn.join(" "))),
            };
            out.push(if before.is_empty() { format!("*** {title} *** [{shown_cards}]") } else { format!("*** {title} *** [{}] [{shown_cards}]", before.trim()) });
        } else {
            out.push(line);
        }
    }
    if !shown.is_empty() {
        out.push("*** SHOW DOWN ***".into());
        out.push(format!("{nickname}: shows [{}]", hero_cards.join(" ")));
        for (name, list) in &shown {
            out.push(format!("{name}: shows [{}]", list.join(" ")));
        }
    }
    for s in seats.iter().filter(|s| s.win > 0.0) {
        out.push(format!("{} collected {} from pot", s.name, fmt(s.win)));
    }
    out.push("*** SUMMARY ***".into());
    out.push(format!("Total pot {} | Rake 0", fmt(seats.iter().map(|s| s.win).sum::<f64>())));
    Some((out.join("\n"), room))
}

fn fmt(value: f64) -> String {
    if (value - value.round()).abs() < 1e-9 {
        format!("{}", value.round() as i64)
    } else {
        format!("{value}")
    }
}

impl HandParser for IPokerParser {
    fn room_name(&self) -> &'static str {
        "iPoker"
    }

    fn parser_version(&self) -> u32 {
        1
    }

    fn hand_separator(&self) -> &'static str {
        HAND_SEPARATOR
    }

    fn detect_format(&self, content: &str) -> bool {
        content.contains("<session") && content.contains("<game ") && content.contains("gamecode=")
    }

    fn parse_file(&self, content: &str) -> ParseResult {
        let hands = regex!(r"(?s)<game\b.*?</game>").find_iter(content).filter_map(|m| self.parse_hand(m.as_str())).collect();
        ParseResult::ok(hands)
    }

    fn parse_hand(&self, hand_text: &str) -> Option<ParsedHand> {
        let (text, room) = to_text(hand_text)?;
        let mode = if room == "PMU" { "Twister" } else { "Spin" };
        let mut hand = parse_hand(&text, room_static(room), mode, read_header)?;
        hand.game_name = Some(element(element(hand_text, "general")?, "tournamentname").unwrap_or(mode).to_string());
        Some(hand)
    }
}

fn room_static(room: &str) -> &'static str {
    if room == "PMU" {
        "PMU"
    } else {
        "iPoker"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = include_str!("../../tests/fixtures/synthetic/ipoker_spin.xml");

    #[test]
    fn cards_are_read_suit_first() {
        assert_eq!(card("DA").as_deref(), Some("Ad"));
        assert_eq!(card("S10").as_deref(), Some("Ts"));
        assert_eq!(card("H2").as_deref(), Some("2h"));
        assert_eq!(card("X2"), None);
        assert_eq!(cards("DA HK junk"), vec!["Ad", "Kh"]);
    }

    #[test]
    fn the_hand_is_read_with_its_room_blinds_and_players() {
        let hand = IPokerParser.parse_hand(SAMPLE).unwrap();
        assert_eq!(hand.room.as_deref(), Some("PMU"));
        assert_eq!(hand.game_mode.as_deref(), Some("Twister"));
        assert_eq!(hand.game_name.as_deref(), Some("Twister"));
        assert_eq!(hand.hand_id.as_deref(), Some("9000000001"));
        assert_eq!(hand.game_id.as_deref(), Some("770011"));
        assert_eq!(hand.buy_in, 1.0);
        assert_eq!(hand.blinds.as_deref(), Some("10/20"));
        assert_eq!(hand.date_time.as_deref(), Some("2023-06-15 20:30:45"));
        assert_eq!(hand.player_count, 3);
        assert_eq!((hand.flop.as_deref(), hand.turn.as_deref(), hand.river.as_deref()), (Some("2c 7d 9h"), Some("Js"), Some("3d")));
    }

    #[test]
    fn cards_positions_and_money_come_through() {
        let hand = IPokerParser.parse_hand(SAMPLE).unwrap();
        let find = |name: &str| hand.players.iter().find(|p| p.name == name).unwrap();
        assert_eq!(find("Hero").cards, "Ad Kh");
        assert!(find("Hero").is_hero);
        assert_eq!(find("Bob").cards, "Qs Qd");
        assert_eq!((find("Alice").position.as_str(), find("Bob").position.as_str(), find("Hero").position.as_str()), ("BTN", "SB", "BB"));
        assert!(find("Bob").is_all_in && find("Hero").is_all_in);
        assert_eq!((find("Bob").investment, find("Bob").net_profit), (500.0, 500.0));
        assert_eq!((find("Hero").investment, find("Hero").net_profit), (500.0, -500.0));
        assert_eq!(hand.players.iter().map(|p| p.net_profit).sum::<f64>(), 0.0);
        assert!(hand.went_to_showdown);
    }

    #[test]
    fn detection_and_garbage() {
        assert!(IPokerParser.detect_format(SAMPLE));
        assert!(!IPokerParser.detect_format("PokerStars Hand #1: Tournament #2"));
        assert_eq!(IPokerParser.parse_file(SAMPLE).count, 1);
        assert!(IPokerParser.parse_hand("<game gamecode=\"1\"></game>").is_none());
    }

    #[test]
    fn a_site_other_than_pmu_is_the_ipoker_network() {
        let hand = IPokerParser.parse_hand(&SAMPLE.replace("<site>PMU</site>", "<site>Network</site>")).unwrap();
        assert_eq!(hand.room.as_deref(), Some("iPoker"));
    }
}
