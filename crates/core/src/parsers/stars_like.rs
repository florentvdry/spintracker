//! The hand-history body shared by PokerStars and GGPoker.
//!
//! Both rooms write a tournament hand the same way after the header line: seats, blinds, hole
//! cards, one section per street, show down and a summary. Only the header differs, so each room
//! gives this module a function reading it.
//!
//! Amounts are stored as the room writes them (chips). Dates are kept as written: the time zone
//! of the room (`ET` for PokerStars) is not converted.

use std::collections::HashMap;

use chrono::NaiveDateTime;

use super::{clean_lines, content_id, join_lines, parse_f64, parse_i32, regex};
use crate::engines::actions::{parse_actions, ActionKind};
use crate::models::{BlindsInfo, ParsedHand, PlayerInfo};
use crate::util::eq_ic;

/// Reads the first line of a hand into the hand; `false` when it is not a header of the room.
pub(super) type HeaderReader = fn(&str, &mut ParsedHand) -> bool;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Section {
    Header,
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

/// `Name: raises 40 to 60` becomes `Name raises 40 to 60`, the way the other rooms write actions
/// (the structured readers accept both, the text stored is kept uniform).
fn without_colon(line: &str) -> String {
    match regex!(r"^(.+?): (posts|folds|checks|calls|bets|raises)\b(.*)$").captures(line) {
        Some(c) => format!("{} {}{}", &c[1], &c[2], &c[3]),
        None => line.to_string(),
    }
}

/// `2023/06/15 20:30:45` as stored (`2023-06-15 20:30:45`).
pub(super) fn format_date(raw: &str) -> Option<String> {
    NaiveDateTime::parse_from_str(raw.trim(), "%Y/%m/%d %H:%M:%S").ok().map(|d| d.format("%Y-%m-%d %H:%M:%S").to_string())
}

/// The level of a tournament as digits or roman numerals ("IV").
pub(super) fn parse_level(raw: &str) -> i32 {
    if let Ok(n) = raw.parse() {
        return n;
    }
    let value = |c: char| match c {
        'I' => 1,
        'V' => 5,
        'X' => 10,
        'L' => 50,
        'C' => 100,
        _ => 0,
    };
    let digits: Vec<i32> = raw.chars().map(value).collect();
    digits.iter().enumerate().map(|(i, &d)| if digits.get(i + 1).is_some_and(|&next| next > d) { -d } else { d }).sum()
}

/// Money written with a symbol or a thousands comma ("$1,000.50").
pub(super) fn money(raw: &str) -> f64 {
    parse_f64(&raw.replace([',', '$', '€', '£', ' '], ""))
}

pub(super) fn parse_hand(text: &str, room: &'static str, game_mode: &'static str, read_header: HeaderReader) -> Option<ParsedHand> {
    let lines = clean_lines(text);
    let first = lines.first()?;
    let mut hand = ParsedHand {
        room: Some(room.into()),
        game_mode: Some(game_mode.into()),
        game_type: Some("Holdem no limit".into()),
        game_variant: Some("HOLDEM".into()),
        limit_type: Some("NL".into()),
        ..ParsedHand::default()
    };
    if !read_header(first, &mut hand) {
        return None;
    }

    let mut streets = StreetLines::default();
    let mut section = Section::Header;
    let mut seats: HashMap<String, i32> = HashMap::new();
    let mut hero_name: Option<String> = None;
    let mut returned: HashMap<String, f64> = HashMap::new();

    for raw in lines.iter().skip(1) {
        hand.result.push_str(raw);
        hand.result.push('\n');
        let line = raw.as_str();

        if line.starts_with("*** HOLE CARDS ***") {
            section = Section::Preflop;
            continue;
        }
        if line.starts_with("*** FLOP ***") || line.starts_with("*** TURN ***") || line.starts_with("*** RIVER ***") {
            let groups: Vec<&str> = regex!(r"\[(.*?)\]").captures_iter(line).filter_map(|c| c.get(1)).map(|m| m.as_str()).collect();
            if line.starts_with("*** FLOP ***") {
                section = Section::Flop;
                hand.flop = groups.first().map(|g| g.trim().to_string());
            } else if line.starts_with("*** TURN ***") {
                section = Section::Turn;
                hand.turn = groups.get(1).map(|g| g.trim().to_string());
            } else {
                section = Section::River;
                hand.river = groups.get(1).map(|g| g.trim().to_string());
            }
            continue;
        }
        if line.starts_with("*** SHOW DOWN ***") || line.starts_with("*** SHOWDOWN ***") {
            section = Section::Showdown;
            hand.went_to_showdown = true;
            continue;
        }
        if line.starts_with("*** SUMMARY ***") {
            section = Section::Summary;
            continue;
        }

        if section == Section::Header {
            if let Some(t) = regex!(r"^Table '([^']+)' (\d+)-max Seat #(\d+) is the button").captures(line) {
                hand.table_id = Some(t[1].trim().to_string());
                hand.button_seat = Some(parse_i32(&t[3]));
                continue;
            }
            if let Some(c) = regex!(r"^Seat (\d+): (.+?) \(\$?€?([\d.,]+) in chips").captures(line) {
                let name = c[2].trim().to_string();
                hand.players.push(PlayerInfo { name: name.clone(), stack: money(&c[3]), ..PlayerInfo::default() });
                seats.insert(name, parse_i32(&c[1]));
                continue;
            }
            // Blinds and antes come before the hole cards.
            if regex!(r"^.+?: posts ").is_match(line) {
                streets.preflop.push(without_colon(line));
                if line.contains("and is all-in") && hand.all_in_street.is_none() {
                    hand.all_in_street = Some(Section::Preflop.name().to_string());
                }
                continue;
            }
        }

        if let Some(c) = regex!(r"^Dealt to (.+?) \[([^\]]+)\]").captures(line) {
            let name = c[1].trim().to_string();
            if let Some(hero) = hand.players.iter_mut().find(|p| eq_ic(&p.name, &name)) {
                hero.is_hero = true;
                hero.cards = c[2].trim().to_string();
            }
            hero_name = Some(name);
            continue;
        }
        if let Some(c) = regex!(r"^Uncalled bet \(\$?€?([\d.,]+)\) returned to (.+)$").captures(line) {
            *returned.entry(c[2].trim().to_string()).or_default() += money(&c[1]);
            continue;
        }
        if let Some(c) = regex!(r"^(.+?) collected \$?€?([\d.,]+) from").captures(line) {
            let name = c[1].trim();
            if let Some(winner) = hand.players.iter_mut().find(|p| eq_ic(&p.name, name)) {
                winner.chips_won += money(&c[2]);
            }
            continue;
        }

        match section {
            Section::Preflop | Section::Flop | Section::Turn | Section::River => {
                let target = match section {
                    Section::Preflop => &mut streets.preflop,
                    Section::Flop => &mut streets.flop,
                    Section::Turn => &mut streets.turn,
                    _ => &mut streets.river,
                };
                target.push(without_colon(line));
                if line.to_lowercase().contains("and is all-in") {
                    if hand.all_in_street.as_deref().map_or(true, str::is_empty) {
                        hand.all_in_street = Some(section.name().to_string());
                    }
                    if let Some(action) = parse_actions(line).first() {
                        if let Some(p) = hand.players.iter_mut().find(|p| eq_ic(&p.name, &action.player)) {
                            p.is_all_in = true;
                        }
                    }
                }
            }
            Section::Showdown => {
                if let Some(c) = regex!(r"^(.+?): shows \[([^\]]+)\]").captures(line) {
                    let name = c[1].trim();
                    if let Some(p) = hand.players.iter_mut().find(|p| eq_ic(&p.name, name)) {
                        p.cards = c[2].trim().to_string();
                        p.went_to_showdown = true;
                    }
                }
            }
            Section::Summary => {
                if let Some(c) = regex!(r"^Total pot \$?€?([\d.,]+)").captures(line) {
                    hand.total_pot = money(&c[1]);
                }
                if let Some(c) = regex!(r"Rake \$?€?([\d.,]+)").captures(line) {
                    hand.rake = money(&c[1]);
                }
            }
            Section::Header => {}
        }
    }

    if hand.players.is_empty() {
        return None;
    }
    hand.player_count = hand.players.len() as i32;
    hand.preflop_action = join_lines(&streets.preflop);
    hand.flop_action = join_lines(&streets.flop);
    hand.turn_action = join_lines(&streets.turn);
    hand.river_action = join_lines(&streets.river);

    assign_positions(&mut hand, &seats, &streets.preflop);
    for player in &mut hand.players {
        let back = returned.iter().find(|(n, _)| eq_ic(n, &player.name)).map_or(0.0, |(_, v)| *v);
        player.investment = (investment(&streets, &player.name) - back).max(0.0);
        player.net_profit = player.chips_won - player.investment;
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

/// What a player put in over the hand: antes, plus on each street the total they reached (a raise
/// says the total it goes to, a call or a bet adds to it).
fn investment(streets: &StreetLines, player: &str) -> f64 {
    let mut total = 0.0;
    for lines in [&streets.preflop, &streets.flop, &streets.turn, &streets.river] {
        let (mut ante, mut street) = (0.0, 0.0);
        for action in parse_actions(&join_lines(lines)).into_iter().filter(|a| eq_ic(&a.player, player)) {
            let amount = action.amount.unwrap_or(0.0);
            match action.kind {
                ActionKind::Post if action.is_ante => ante += amount,
                ActionKind::Post | ActionKind::Call | ActionKind::Bet => street += amount,
                ActionKind::Raise => street = action.amount_to.unwrap_or(amount).max(street),
                ActionKind::Fold | ActionKind::Check => {}
            }
        }
        total += ante + street;
    }
    total
}

fn assign_positions(hand: &mut ParsedHand, seats: &HashMap<String, i32>, preflop: &[String]) {
    let count = hand.players.len();
    let Some(button) = hand.button_seat else { return };
    let seat_of = |name: &str| seats.iter().find(|(n, _)| eq_ic(n, name)).map(|(_, s)| *s);
    for p in &mut hand.players {
        if seat_of(&p.name) == Some(button) {
            p.position = if count == 2 { "SB" } else { "BTN" }.to_string();
        }
    }
    for (needle, position) in [(" posts small blind", "SB"), (" posts big blind", "BB")] {
        let Some(line) = preflop.iter().find(|l| l.to_lowercase().contains(needle)) else { continue };
        let name = line.split(needle).next().unwrap_or("").trim();
        if let Some(p) = hand.players.iter_mut().find(|p| eq_ic(&p.name, name)) {
            if position == "BB" || count == 2 || p.position.trim().is_empty() {
                p.position = position.into();
            }
        }
    }
}

/// Fills the blinds of a hand from the numbers of its header.
pub(super) fn set_blinds(hand: &mut ParsedHand, small: f64, big: f64) {
    hand.blinds = Some(format!("{small}/{big}"));
    hand.structured_blinds = Some(BlindsInfo { sb: small, bb: big, ante: None });
}
