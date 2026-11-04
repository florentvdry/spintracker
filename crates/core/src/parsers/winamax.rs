//! Winamax Expresso hand histories.

use std::collections::HashMap;

use chrono::NaiveDateTime;

use crate::util::{eq_ic, starts_with_ic};
use super::{
    clean_lines, content_id, entry_cost, join_lines, parse_f64, parse_i32, regex, split_before_marker, HandParser,
};
use crate::models::{BlindsInfo, ParseResult, ParsedHand, PlayerInfo};

const HAND_SEPARATOR: &str = "Winamax Poker - Tournament";

pub struct WinamaxParser;

#[derive(Clone, Copy, PartialEq)]
enum Section {
    Header,
    Ante,
    Preflop,
    Flop,
    Turn,
    River,
    Showdown,
    Summary,
}

impl Section {
    fn name(self) -> &'static str {
        match self {
            Section::Header => "HEADER",
            Section::Ante => "ANTE",
            Section::Preflop => "PREFLOP",
            Section::Flop => "FLOP",
            Section::Turn => "TURN",
            Section::River => "RIVER",
            Section::Showdown => "SHOWDOWN",
            Section::Summary => "SUMMARY",
        }
    }
}

#[derive(Default)]
struct StreetLines {
    preflop: Vec<String>,
    flop: Vec<String>,
    turn: Vec<String>,
    river: Vec<String>,
}

impl HandParser for WinamaxParser {
    fn room_name(&self) -> &'static str {
        "Winamax"
    }

    fn parser_version(&self) -> u32 {
        1
    }

    fn hand_separator(&self) -> &'static str {
        HAND_SEPARATOR
    }

    fn detect_format(&self, content: &str) -> bool {
        content.contains("Winamax Poker - Tournament") || content.contains("Site: Winamax")
    }

    fn parse_file(&self, content: &str) -> ParseResult {
        let hands = split_before_marker(content, HAND_SEPARATOR)
            .into_iter()
            .filter_map(|block| self.parse_hand(block))
            .collect();
        ParseResult::ok(hands)
    }

    fn parse_hand(&self, hand_text: &str) -> Option<ParsedHand> {
        let lines = clean_lines(hand_text);
        if lines.is_empty() {
            return None;
        }

        let mut hand = ParsedHand {
            room: Some("Winamax".into()),
            game_mode: Some("Expresso".into()),
            game_type: Some("Holdem no limit".into()),
            game_variant: Some("HOLDEM".into()),
            limit_type: Some("NL".into()),
            currency: Some("EUR".into()),
            ..ParsedHand::default()
        };
        let mut streets = StreetLines::default();
        // Seat numbers by player name (case-insensitive lookups go through `seat_of`).
        let mut player_seat: HashMap<String, i32> = HashMap::new();
        let mut hero_name: Option<String> = None;
        let mut section = Section::Header;

        for line in &lines {
            hand.result.push_str(line);
            hand.result.push('\n');

            if line.starts_with("*** ANTE/BLINDS ***") {
                section = Section::Ante;
                continue;
            }
            if line.starts_with("*** PRE-FLOP ***") {
                section = Section::Preflop;
                continue;
            }
            if line.starts_with("*** FLOP ***") {
                section = Section::Flop;
                parse_board(line, &mut hand, Section::Flop);
                continue;
            }
            if line.starts_with("*** TURN ***") {
                section = Section::Turn;
                parse_board(line, &mut hand, Section::Turn);
                continue;
            }
            if line.starts_with("*** RIVER ***") {
                section = Section::River;
                parse_board(line, &mut hand, Section::River);
                continue;
            }
            if line.starts_with("*** SHOW DOWN ***") {
                section = Section::Showdown;
                hand.went_to_showdown = true;
                continue;
            }
            if line.starts_with("*** SUMMARY ***") {
                section = Section::Summary;
                continue;
            }

            if section == Section::Header {
                // Seat lines are still part of the header block, so header parsing must not
                // short-circuit the rest of the loop.
                parse_header_line(line, &mut hand);
            }

            // Collected chips are tracked in every section: some exports place them outside
            // the strict blocks.
            if let Some(c) = regex!(r"^(.+?) collected (\d+(?:\.\d+)?) from").captures(line) {
                let name = c[1].trim();
                let amount = parse_f64(&c[2]);
                if let Some(winner) = hand.players.iter_mut().find(|p| eq_ic(&p.name, name)) {
                    winner.chips_won += amount;
                }
            }

            if let Some(c) = regex!(r"Seat (\d+): (.+?) \((\d+)\)").captures(line) {
                let name = c[2].trim().to_string();
                hand.players.push(PlayerInfo { name: name.clone(), stack: parse_f64(&c[3]), ..PlayerInfo::default() });
                player_seat.insert(name, parse_i32(&c[1]));
                continue;
            }

            if let Some(c) = regex!(r"^Dealt to (.+?) \[([^\]]+)\]").captures(line) {
                let name = c[1].trim().to_string();
                let cards = c[2].trim().to_string();
                if let Some(hero) = hand.players.iter_mut().find(|p| eq_ic(&p.name, &name)) {
                    hero.is_hero = true;
                    hero.cards = cards;
                }
                hero_name = Some(name);
                continue;
            }

            match section {
                Section::Ante | Section::Preflop | Section::Flop | Section::Turn | Section::River => {
                    // Blinds and antes count as preflop investments.
                    match section {
                        Section::Ante | Section::Preflop => streets.preflop.push(line.clone()),
                        Section::Flop => streets.flop.push(line.clone()),
                        Section::Turn => streets.turn.push(line.clone()),
                        _ => streets.river.push(line.clone()),
                    }

                    if line.to_lowercase().contains(" and is all-in") {
                        if hand.all_in_street.as_deref().map_or(true, str::is_empty) {
                            hand.all_in_street = Some(section.name().to_string());
                        }
                        if let Some(name) = line.split_whitespace().next() {
                            if let Some(p) = hand.players.iter_mut().find(|p| eq_ic(&p.name, name)) {
                                p.is_all_in = true;
                            }
                        }
                    }
                }
                Section::Showdown => {
                    if let Some(c) = regex!(r"^(.+?) shows \[([^\]]+)\]").captures(line) {
                        let name = c[1].trim();
                        let cards = c[2].trim().to_string();
                        if let Some(p) = hand.players.iter_mut().find(|p| eq_ic(&p.name, name)) {
                            p.cards = cards;
                            p.went_to_showdown = true;
                        }
                    }
                }
                Section::Summary => {
                    if let Some(c) = regex!(r"^Total pot (\d+(?:\.\d+)?)").captures(line) {
                        hand.total_pot = parse_f64(&c[1]);
                    }
                }
                Section::Header => {}
            }
        }

        hand.player_count = hand.players.len() as i32;
        hand.preflop_action = join_lines(&streets.preflop);
        hand.flop_action = join_lines(&streets.flop);
        hand.turn_action = join_lines(&streets.turn);
        hand.river_action = join_lines(&streets.river);

        assign_positions(&mut hand, &player_seat, &streets.preflop);

        for p in &mut hand.players {
            p.investment = investment_for_player(&streets, &p.name);
            p.net_profit = p.chips_won - p.investment;
        }

        if let Some(name) = &hero_name {
            if hand.players.iter().any(|p| eq_ic(&p.name, name) && p.went_to_showdown) {
                hand.went_to_showdown = true;
            }
        }

        hand.id = match hand.hand_id.as_deref() {
            Some(id) if !id.trim().is_empty() => Some(id.to_string()),
            _ => Some(content_id(&hand.result)),
        };
        Some(hand)
    }
}

fn parse_header_line(line: &str, hand: &mut ParsedHand) {
    let header = regex!(
        r#"Winamax Poker - Tournament "(?<gameName>[^"]+)" buyIn: (?<buyIn>\d+(?:[.,]\d+)?)\D+\s*\+\s*(?<fee>\d+(?:[.,]\d+)?)\D+ level: (?<level>\d+) - HandId: #(?<handId>[^\s]+) - Holdem no limit \((?<sb>\d+)/(?<bb>\d+)\) - (?<date>\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}) UTC"#
    );

    if let Some(m) = header.captures(line) {
        hand.game_name = Some(m["gameName"].trim().to_string());
        hand.buy_in = parse_euro(&m["buyIn"]);
        hand.rake_per_player = Some(parse_euro(&m["fee"]));
        hand.tournament_level = Some(parse_i32(&m["level"]));
        hand.hand_id = Some(m["handId"].trim().to_string());
        hand.date_time = format_date(&m["date"]);
        let (sb, bb) = (parse_f64(&m["sb"]), parse_f64(&m["bb"]));
        hand.blinds = Some(format!("{sb}/{bb}"));
        hand.structured_blinds = Some(BlindsInfo { sb, bb, ante: None });
    } else if line.starts_with("Winamax Poker - Tournament") {
        // Partial header: pick up whatever fields are present.
        if let Some(c) = regex!(r#"Tournament "([^"]+)""#).captures(line) {
            hand.game_name = Some(c[1].trim().to_string());
        }
        if let Some(c) = regex!(r"buyIn:\s*(\d+(?:[.,]\d+)?)\D+\+\s*(\d+(?:[.,]\d+)?)").captures(line) {
            hand.buy_in = parse_euro(&c[1]);
            hand.rake_per_player = Some(parse_euro(&c[2]));
        }
        if let Some(c) = regex!(r"level:\s*(\d+)").captures(line) {
            hand.tournament_level = c[1].parse().ok();
        }
        if let Some(c) = regex!(r"HandId:\s*#([^\s]+)").captures(line) {
            hand.hand_id = Some(c[1].trim().to_string());
        }
        if let Some(c) = regex!(r"\((\d+)/(\d+)\)").captures(line) {
            let (sb, bb) = (parse_f64(&c[1]), parse_f64(&c[2]));
            hand.blinds = Some(format!("{sb}/{bb}"));
            hand.structured_blinds = Some(BlindsInfo { sb, bb, ante: None });
        }
        if let Some(c) = regex!(r"(\d{4}/\d{2}/\d{2}\s+\d{2}:\d{2}:\d{2})\s+UTC").captures(line) {
            if let Some(date) = format_date(c[1].trim()) {
                hand.date_time = Some(date);
            }
        }
    }

    if let Some(t) = regex!(r"Table: '([^']+)' \d+-max .* Seat #(\d+) is the button").captures(line) {
        let table = t[1].trim().to_string();
        hand.button_seat = Some(parse_i32(&t[2]));
        if let Some(id) = regex!(r"\((\d+)\)#").captures(&table) {
            hand.game_id = Some(id[1].to_string());
            hand.tournament_id = hand.game_id.clone();
        }
        hand.table_id = Some(table);
    }
}

fn format_date(raw: &str) -> Option<String> {
    NaiveDateTime::parse_from_str(raw, "%Y/%m/%d %H:%M:%S")
        .ok()
        .map(|d| d.format("%Y-%m-%d %H:%M:%S").to_string())
}

fn parse_board(line: &str, hand: &mut ParsedHand, street: Section) {
    let groups: Vec<&str> = regex!(r"\[(.*?)\]").captures_iter(line).map(|c| c.get(1).unwrap().as_str()).collect();
    match street {
        Section::Flop if !groups.is_empty() => hand.flop = Some(groups[0].to_string()),
        Section::Turn if groups.len() >= 2 => hand.turn = Some(groups[1].trim().to_string()),
        Section::River if groups.len() >= 2 => hand.river = Some(groups[1].trim().to_string()),
        _ => {}
    }
}

fn assign_positions(hand: &mut ParsedHand, player_seat: &HashMap<String, i32>, preflop: &[String]) {
    let player_count = hand.players.len();
    let Some(button_seat) = hand.button_seat else { return };
    if player_count == 0 {
        return;
    }

    let seat_of = |name: &str| player_seat.iter().find(|(n, _)| eq_ic(n, name)).map(|(_, s)| *s);

    for p in &mut hand.players {
        if seat_of(&p.name) == Some(button_seat) {
            p.position = if player_count == 2 { "SB" } else { "BTN" }.to_string();
        }
    }

    if let Some(line) = preflop.iter().find(|l| l.to_lowercase().contains("posts small blind")) {
        let name = line.split(" posts small blind").next().unwrap_or("").trim();
        if let Some(p) = hand.players.iter_mut().find(|p| eq_ic(&p.name, name)) {
            // In 3-max the button often posts the small blind; it keeps its BTN position.
            if player_count == 2 || p.position.trim().is_empty() {
                p.position = "SB".into();
            }
        }
    }

    if let Some(line) = preflop.iter().find(|l| l.to_lowercase().contains("posts big blind")) {
        let name = line.split(" posts big blind").next().unwrap_or("").trim();
        if let Some(p) = hand.players.iter_mut().find(|p| eq_ic(&p.name, name)) {
            p.position = "BB".into();
        }
    }
}

fn investment_for_player(streets: &StreetLines, player: &str) -> f64 {
    let mut total = 0.0;
    for lines in [&streets.preflop, &streets.flop, &streets.turn, &streets.river] {
        let mut street_investment = 0.0;
        for line in lines {
            // The name must be followed by a space: "Ann" is not "Anna".
            if !starts_with_ic(line, &format!("{player} ")) {
                continue;
            }
            for re in [
                regex!(r" posts small blind (\d+)"),
                regex!(r" posts big blind (\d+)"),
                regex!(r" calls (\d+)"),
                regex!(r" bets (\d+)"),
            ] {
                if let Some(c) = re.captures(line) {
                    street_investment += parse_f64(&c[1]);
                }
            }
            if let Some(c) = regex!(r" raises \d+ to (\d+)").captures(line) {
                street_investment = f64::max(street_investment, parse_f64(&c[1]));
            }
        }
        total += street_investment;
    }
    total
}

fn parse_euro(raw: &str) -> f64 {
    parse_f64(&raw.replace(',', "."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_name_that_starts_another_name_does_not_share_its_investment() {
        let streets = StreetLines {
            preflop: vec!["Ann posts small blind 10".into(), "Anna posts big blind 20".into(), "Anna calls 40".into()],
            ..StreetLines::default()
        };
        assert_eq!(investment_for_player(&streets, "Ann"), 10.0);
        assert_eq!(investment_for_player(&streets, "Anna"), 60.0);
    }
}
