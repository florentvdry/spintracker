//! Unibet Power Spin hand histories.


use super::{clean_lines, content_id, entry_cost, join_lines, parse_f64, parse_i32, regex, split_before_marker, HandParser};
use crate::models::{BlindsInfo, ParseResult, ParsedHand, PlayerInfo};

const HAND_SEPARATOR: &str = "Unibet Hand #";

pub struct UnibetParser;

#[derive(Clone, Copy, PartialEq)]
enum Section {
    Header,
    Players,
    Blinds,
    HoleCards,
    Preflop,
    Flop,
    Turn,
    River,
    Showdown,
    Summary,
}

impl Section {
    fn street_name(self) -> &'static str {
        match self {
            Section::Preflop => "PREFLOP",
            Section::Flop => "FLOP",
            Section::Turn => "TURN",
            Section::River => "RIVER",
            _ => "",
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

impl HandParser for UnibetParser {
    fn room_name(&self) -> &'static str {
        "Unibet"
    }

    fn parser_version(&self) -> u32 {
        1
    }

    fn hand_separator(&self) -> &'static str {
        HAND_SEPARATOR
    }

    fn detect_format(&self, content: &str) -> bool {
        content.contains("Unibet Hand #") || content.contains("Unibet Tournament #")
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
            room: Some("Unibet".into()),
            game_variant: Some("HOLDEM".into()),
            limit_type: Some("NL".into()),
            currency: Some("EUR".into()),
            ..ParsedHand::default()
        };
        let mut streets = StreetLines::default();
        let mut section = Section::Header;
        let mut hero_name: Option<String> = None;

        for line in &lines {
            hand.result.push_str(line);
            hand.result.push('\n');

            if line.starts_with("*** Seated players ***") {
                section = Section::Players;
                continue;
            }
            if line.starts_with("*** Blinds and button ***") {
                section = Section::Blinds;
                continue;
            }
            if line.starts_with("*** Hole cards ***") {
                section = Section::HoleCards;
                continue;
            }
            if line.starts_with("*** Preflop ***") {
                section = Section::Preflop;
                continue;
            }
            // A board line after the showdown/summary markers does not reopen a betting round.
            let after_showdown = matches!(section, Section::Showdown | Section::Summary);
            if line.starts_with("*** Flop ***") {
                parse_board(line, &mut hand, Section::Flop);
                if !after_showdown {
                    section = Section::Flop;
                }
                continue;
            }
            if line.starts_with("*** Turn ***") {
                parse_board(line, &mut hand, Section::Turn);
                if !after_showdown {
                    section = Section::Turn;
                }
                continue;
            }
            if line.starts_with("*** River ***") {
                parse_board(line, &mut hand, Section::River);
                if !after_showdown {
                    section = Section::River;
                }
                continue;
            }
            if line.starts_with("*** Showdown ***") {
                section = Section::Showdown;
                hand.went_to_showdown = true;
                continue;
            }
            if line.starts_with("*** Summary ***") {
                section = Section::Summary;
                continue;
            }

            match section {
                Section::Header => parse_header_line(line, &mut hand),
                Section::Players => {
                    if let Some(c) = regex!(r"Seat (\d+): (.+?) \((\d+(?:\.\d+)?)\)").captures(line) {
                        hand.players.push(PlayerInfo {
                            name: c[2].trim().to_string(),
                            stack: parse_f64(&c[3]),
                            ..PlayerInfo::default()
                        });
                    }
                }
                Section::Blinds => {
                    if let Some(c) = regex!(r"(.+?) has the button").captures(line) {
                        let name = c[1].trim();
                        if let Some(p) = hand.players.iter_mut().find(|p| p.name == name) {
                            p.position = "BTN".into();
                        }
                    }
                    streets.preflop.push(line.clone());
                    check_all_in(line, &mut hand, "PREFLOP");
                }
                Section::HoleCards => {
                    if let Some(c) = regex!(r"Dealt to (.+?) \[([^\]]+)\]").captures(line) {
                        let name = c[1].trim().to_string();
                        let cards = c[2].trim().to_string();
                        if let Some(p) = hand.players.iter_mut().find(|p| p.name == name) {
                            p.cards = cards;
                        }
                        hero_name = Some(name);
                    }
                }
                Section::Preflop | Section::Flop | Section::Turn | Section::River => {
                    match section {
                        Section::Preflop => streets.preflop.push(line.clone()),
                        Section::Flop => streets.flop.push(line.clone()),
                        Section::Turn => streets.turn.push(line.clone()),
                        _ => streets.river.push(line.clone()),
                    }
                    check_all_in(line, &mut hand, section.street_name());
                    check_fold(line, &mut hand);
                }
                Section::Showdown => {
                    if line.contains("shows") {
                        let mut parts = line.splitn(2, " shows ");
                        let name = parts.next().unwrap_or("").trim().to_string();
                        let rest = parts.next().unwrap_or("");
                        if let Some(c) = regex!(r"\[(.+?)\]").captures(rest) {
                            if let Some(p) = hand.players.iter_mut().find(|p| p.name == name) {
                                p.cards = c[1].trim().to_string();
                                p.went_to_showdown = true;
                            }
                        }
                    }
                }
                Section::Summary => {
                    if line.starts_with("Total pot") {
                        if let Some(c) = regex!(r"Total pot (\d+(?:\.\d+)?)").captures(line) {
                            hand.total_pot = parse_f64(&c[1]);
                        }
                    }
                    if let Some(c) = regex!(
                        r"Seat (\d+): (.+?): bet (\d+(?:\.\d+)?) and won (\d+(?:\.\d+)?), net result: (-?\d+(?:\.\d+)?)"
                    )
                    .captures(line)
                    {
                        let name = c[2].trim();
                        if let Some(p) = hand.players.iter_mut().find(|p| p.name == name) {
                            p.investment = parse_f64(&c[3]);
                            p.chips_won = parse_f64(&c[4]);
                            p.net_profit = parse_f64(&c[5]);
                        }
                    }
                }
            }
        }

        // Blind posters override the button position.
        for line in &streets.preflop {
            if line.contains("posts small blind") {
                let name = line.split(" posts small blind").next().unwrap_or("").trim();
                if let Some(p) = hand.players.iter_mut().find(|p| p.name == name) {
                    p.position = "SB".into();
                }
            } else if line.contains("posts big blind") {
                let name = line.split(" posts big blind").next().unwrap_or("").trim();
                if let Some(p) = hand.players.iter_mut().find(|p| p.name == name) {
                    p.position = "BB".into();
                }
            }
        }

        // Heads-up the button is the small blind.
        if hand.players.len() == 2 {
            for p in &mut hand.players {
                if p.position == "BTN" {
                    p.position = "SB".into();
                }
            }
        }

        hand.preflop_action = join_lines(&streets.preflop);
        hand.flop_action = join_lines(&streets.flop);
        hand.turn_action = join_lines(&streets.turn);
        hand.river_action = join_lines(&streets.river);

        if let Some(name) = &hero_name {
            if hand.players.iter().any(|p| &p.name == name && p.went_to_showdown) {
                hand.went_to_showdown = true;
            }
        }

        hand.player_count = hand.players.len() as i32;
        hand.id = Some(hand.hand_id.clone().unwrap_or_else(|| content_id(&hand.result)));
        Some(hand)
    }
}

fn parse_header_line(line: &str, hand: &mut ParsedHand) {
    let header = regex!(
        r"Unibet Hand #(?<handId>\d+), Tournament #(?<tournamentId>\d+), €(?<buyin>\d+(?:\.\d+)?) \+ €(?<fee>\d+(?:\.\d+)?) - (?<sb>\d+(?:\.\d+)?)/(?<bb>\d+(?:\.\d+)?).+? - UTC (?<time>\d{2}:\d{2}:\d{2}) (?<date>\d{4}/\d{2}/\d{2})"
    );
    if let Some(m) = header.captures(line) {
        hand.hand_id = Some(m["handId"].to_string());
        hand.game_id = Some(m["tournamentId"].to_string());
        hand.tournament_id = hand.game_id.clone();
        hand.buy_in = parse_f64(&m["buyin"]);
        hand.rake_per_player = Some(parse_f64(&m["fee"]));
        let (sb, bb) = (parse_f64(&m["sb"]), parse_f64(&m["bb"]));
        hand.blinds = Some(format!("{sb}/{bb}"));
        hand.structured_blinds = Some(BlindsInfo { sb, bb, ante: None });
        hand.date_time = Some(format!("{} {}", m["date"].replace('/', "-"), &m["time"]));

        if hand.buy_in > 0.0 {
            let total_buy_in = hand.buy_in + hand.rake_per_player.unwrap_or(0.0);
            if let Some(prize) = regex!(r"Total prize €(\d+(?:\.\d+)?)").captures(line) {
                hand.prize_pool = parse_f64(&prize[1]);
                // Banker's rounding, like .NET's default `Math.Round`.
                hand.multiplier = (hand.prize_pool / total_buy_in).round_ties_even() as i32;
            }
        }
    }

    if let Some(t) = regex!(r#"Table "(\d+)" (\d+)-max"#).captures(line) {
        hand.table_id = Some(t[1].to_string());
        hand.player_count = parse_i32(&t[2]);
    }
}

fn parse_board(line: &str, hand: &mut ParsedHand, street: Section) {
    let groups: Vec<&str> = regex!(r"\[(.+?)\]").captures_iter(line).map(|c| c.get(1).unwrap().as_str()).collect();
    match street {
        Section::Flop if !groups.is_empty() => hand.flop = Some(groups[0].to_string()),
        Section::Turn if groups.len() >= 2 => hand.turn = Some(groups[1].to_string()),
        Section::River if groups.len() >= 3 => hand.river = Some(groups[2].to_string()),
        _ => {}
    }
}

fn check_all_in(line: &str, hand: &mut ParsedHand, street: &str) {
    if !line.contains("is all-in") {
        return;
    }
    if hand.all_in_street.as_deref().map_or(true, str::is_empty) {
        hand.all_in_street = Some(street.to_uppercase());
    }
    let name = line.split(' ').next().unwrap_or("").trim();
    if let Some(p) = hand.players.iter_mut().find(|p| p.name == name) {
        p.is_all_in = true;
    }
}

fn check_fold(line: &str, hand: &mut ParsedHand) {
    let lower = line.to_ascii_lowercase();
    let Some(idx) = lower.find(" folds") else { return };
    let name = line[..idx].trim();
    if let Some(p) = hand.players.iter_mut().find(|p| p.name == name) {
        p.folded = true;
    }
}
