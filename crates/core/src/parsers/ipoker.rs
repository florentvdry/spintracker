//! iPoker Network hand histories.
//!
//! iPoker Network exports hands separated by lines starting with `GAME #<id>`. Each block holds
//! a header line (`GAME #... Tournament <date>/GMT`), a `Table Info` line (size, blinds), a
//! `Table ... (Tournament: ... Buy-In: €... + €...)` line, `Seat` lines, `*** HOLE CARDS ***`,
//! per-street action markers, `*** SUMMARY ***` with `Total pot ... Rake ...` and per-player
//! `... wins €...`. The word "ipoker" is not present in these exports, so detection relies on
//! the `GAME #` hand boundary and the `Table Info`/`Uncalled:Y` markers.

use chrono::NaiveDateTime;

use super::{clean_lines, content_id, entry_cost, join_lines, parse_f64, parse_i32, regex, HandParser};
use crate::models::{BlindsInfo, ParseResult, ParsedHand, PlayerInfo};

const HAND_SEPARATOR: &str = "GAME #";

pub struct IPokerParser;

#[derive(Clone, Copy, PartialEq)]
enum Section {
    Header,
    HoleCards,
    Preflop,
    Flop,
    Turn,
    River,
    Summary,
}

#[derive(Default)]
struct StreetLines {
    preflop: Vec<String>,
    flop: Vec<String>,
    turn: Vec<String>,
    river: Vec<String>,
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

    fn hand_separator_for(&self, _content: &str) -> &'static str {
        HAND_SEPARATOR
    }

    fn detect_format(&self, content: &str) -> bool {
        let lower = content.to_lowercase();
        // Real iPoker Network exports do not contain the word "ipoker". They are recognised by
        // the `GAME #` hand boundary plus the `Table Info:` / `Uncalled:Y` markers.
        lower.contains("game #")
            && (lower.contains("table info:") || lower.contains("uncalled:y"))
    }

    fn parse_file(&self, content: &str) -> ParseResult {
        // Split so each block keeps its opening `GAME #` line.
        let mut blocks = Vec::new();
        let mut current = String::new();
        for raw in content.split('\n') {
            let line = raw.trim_end_matches('\r');
            if line.starts_with(HAND_SEPARATOR) && !current.is_empty() {
                blocks.push(std::mem::take(&mut current));
            }
            current.push_str(line);
            current.push('\n');
        }
        if !current.trim().is_empty() {
            blocks.push(current);
        }
        let hands = blocks
            .into_iter()
            .filter(|b| !b.trim().is_empty())
            .filter_map(|b| self.parse_hand(&b))
            .collect();
        ParseResult::ok(hands)
    }

    fn parse_hand(&self, hand_text: &str) -> Option<ParsedHand> {
        let lines = clean_lines(hand_text);
        if lines.is_empty() {
            return None;
        }

        let mut hand = ParsedHand {
            room: Some("iPoker".into()),
            game_mode: Some("Tournament".into()),
            game_type: Some("Holdem no limit".into()),
            game_variant: Some("HOLDEM".into()),
            limit_type: Some("NL".into()),
            currency: Some("EUR".into()),
            ..ParsedHand::default()
        };
        let mut streets = StreetLines::default();
        let mut blind_posts: Vec<String> = Vec::new();
        let mut section = Section::Header;

        for line in &lines {
            hand.result.push_str(line);
            hand.result.push('\n');

            if line.starts_with(HAND_SEPARATOR) {
                if let Some(c) = regex!(r"GAME #([^\s]+)").captures(line) {
                    hand.hand_id = Some(c[1].to_string());
                }
                if let Some(c) = regex!(r"Tournament (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/GMT").captures(line) {
                    hand.date_time = Some(c[1].to_string());
                }
                section = Section::Header;
                continue;
            }
            if line.starts_with("Table Info:") {
                if let Some(c) = regex!(r"Size:\s*(\d+)").captures(line) {
                    hand.player_count = parse_i32(&c[1]);
                }
                if let Some(c) = regex!(r"Blinds:\s*(\d+(?:\.\d+)?)/(\d+(?:\.\d+)?)").captures(line) {
                    let (sb, bb) = (parse_f64(&c[1]), parse_f64(&c[2]));
                    hand.blinds = Some(format!("{sb}/{bb}"));
                    hand.structured_blinds = Some(BlindsInfo { sb, bb, ante: None });
                }
                continue;
            }
            if line.starts_with("Table ") {
                if let Some(c) = regex!(r",\s*([^\s,]+),\s*([^\s(]+)\s*\(").captures(line) {
                    hand.game_id = Some(c[1].to_string());
                    hand.tournament_id = hand.game_id.clone();
                }
                if let Some(c) = regex!(r"Buy-In:\s*€\s*([\d.,]+)\s*\+\s*€\s*([\d.,]+)").captures(line) {
                    hand.buy_in = entry_cost(parse_euro(&c[1]), parse_euro(&c[2]));
                    hand.rake_per_player = Some(parse_euro(&c[2]));
                }
                if let Some(c) = regex!(r"Tournament:\s*([^(]+)").captures(line) {
                    hand.game_name = Some(c[1].trim().to_string());
                }
                continue;
            }
            if line.starts_with("Seat ") {
                if let Some(c) = regex!(r"Seat (\d+): (.+?) \((€?[\d.,]+) in chips\)(.*)").captures(line) {
                    let name = c[2].trim().to_string();
                    let stack = parse_euro(&c[3]);
                    let is_dealer = c[4].contains("DEALER");
                    hand.players.push(PlayerInfo {
                        name: name.clone(),
                        stack,
                        position: if is_dealer { "BTN".into() } else { String::new() },
                        ..PlayerInfo::default()
                    });
                }
                continue;
            }

            // Section markers.
            if line == "*** HOLE CARDS ***" {
                section = Section::HoleCards;
                continue;
            }
            if line == "*** FLOP ***" {
                parse_board(line, &mut hand, Section::Flop);
                section = Section::Preflop;
                continue;
            }
            if line == "*** TURN ***" {
                parse_board(line, &mut hand, Section::Turn);
                section = Section::Turn;
                continue;
            }
            if line == "*** RIVER ***" {
                parse_board(line, &mut hand, Section::River);
                section = Section::River;
                continue;
            }
            if line == "*** SUMMARY ***" {
                section = Section::Summary;
                continue;
            }

            // Blind posts can appear before `*** HOLE CARDS ***` (still in Header section),
            // so collect them regardless of the current section for position assignment.
            let line_lower = line.to_lowercase();
            if line_lower.contains("post sb")
                || line_lower.contains("post bb")
                || line_lower.contains("post small blind")
                || line_lower.contains("post big blind")
            {
                blind_posts.push(line.clone());
            }

            let is_action_line = line.contains(':')
                && ["post", "call", "bet", "raise", "allin", "all-in", "fold", "check"]
                    .iter()
                    .any(|k| line.to_lowercase().contains(k));
            match section {
                Section::Header | Section::HoleCards => {
                    // Blind posts and preflop bets can appear before `*** HOLE CARDS ***`,
                    // so treat them as preflop actions for investment tracking.
                    if line.starts_with("Dealt to ") {
                        if let Some(c) = regex!(r"Dealt to (.+?) \[([^\]]+)\]").captures(line) {
                            let name = c[1].trim();
                            let cards = c[2].trim().to_string();
                            if let Some(p) = hand.players.iter_mut().find(|p| crate::util::eq_ic(&p.name, name)) {
                                p.is_hero = true;
                                p.cards = cards;
                            }
                        }
                    }
                    if is_action_line {
                        streets.preflop.push(line.clone());
                        track_action(line, &mut hand, Section::Preflop);
                    }
                }
                Section::Preflop => {
                    if is_action_line {
                        streets.preflop.push(line.clone());
                        track_action(line, &mut hand, Section::Preflop);
                    }
                }
                Section::Flop => {
                    if is_action_line {
                        streets.flop.push(line.clone());
                        track_action(line, &mut hand, Section::Flop);
                    }
                }
                Section::Turn => {
                    if is_action_line {
                        streets.turn.push(line.clone());
                        track_action(line, &mut hand, Section::Turn);
                    }
                }
                Section::River => {
                    if is_action_line {
                        streets.river.push(line.clone());
                        track_action(line, &mut hand, Section::River);
                    }
                }
                Section::Summary => {
                    if let Some(c) = regex!(r"Total pot\s*€\s*([\d.,]+)").captures(line) {
                        hand.total_pot = parse_euro(&c[1]);
                    }
                    if let Some(c) = regex!(r"Rake\s*€\s*([\d.,]+)").captures(line) {
                        hand.rake = parse_euro(&c[1]);
                    }
                    if let Some(c) = regex!(r"^(.+?):\s*wins\s*€\s*([\d.,]+)").captures(line) {
                        let name = c[1].trim();
                        let amount = parse_euro(&c[2]);
                        if let Some(p) = hand.players.iter_mut().find(|p| crate::util::eq_ic(&p.name, name)) {
                            p.chips_won += amount;
                        }
                    }
                    if line.contains("Shows") || line.contains("Mucks") {
                        hand.went_to_showdown = true;
                        let name = line.split(':').next().unwrap_or("").trim();
                        if let Some(p) = hand.players.iter_mut().find(|p| crate::util::eq_ic(&p.name, name)) {
                            p.went_to_showdown = true;
                        }
                    }
                }
            }
        }

        hand.player_count = if hand.player_count == 0 {
            hand.players.len() as i32
        } else {
            hand.player_count
        };
        hand.preflop_action = join_lines(&streets.preflop);
        hand.flop_action = join_lines(&streets.flop);
        hand.turn_action = join_lines(&streets.turn);
        hand.river_action = join_lines(&streets.river);

        assign_positions(&mut hand, &blind_posts);

        for p in &mut hand.players {
            p.investment = investment_for_player(&streets, &p.name);
            p.net_profit = p.chips_won - p.investment;
        }

        if hand.multiplier <= 0 && hand.buy_in > 0.0 && hand.prize_pool > 0.0 {
            hand.multiplier = i32::max(1, (hand.prize_pool / hand.buy_in).round() as i32);
        }

        hand.id = match hand.hand_id.as_deref() {
            Some(id) if !id.trim().is_empty() => Some(id.to_string()),
            _ => Some(content_id(&hand.result)),
        };
        Some(hand)
    }
}

fn parse_board(line: &str, hand: &mut ParsedHand, section: Section) {
    let groups: Vec<&str> = regex!(r"\[(.*?)\]").captures_iter(line).map(|c| c.get(1).unwrap().as_str()).collect();
    match section {
        Section::Flop if !groups.is_empty() => hand.flop = Some(groups[0].to_string()),
        Section::Turn if !groups.is_empty() => hand.turn = Some(groups[0].to_string()),
        Section::River if !groups.is_empty() => hand.river = Some(groups[0].to_string()),
        _ => {}
    }
}

fn track_action(line: &str, hand: &mut ParsedHand, section: Section) {
    let lower = line.to_lowercase();
    if lower.contains("allin") || lower.contains("all-in") {
        if hand.all_in_street.as_deref().map_or(true, str::is_empty) {
            hand.all_in_street = Some(match section {
                Section::Preflop => "PREFLOP",
                Section::Flop => "FLOP",
                Section::Turn => "TURN",
                Section::River => "RIVER",
                _ => "UNKNOWN",
            }
            .to_string());
        }
        let name = line.split(':').next().unwrap_or("").trim();
        if let Some(p) = hand.players.iter_mut().find(|p| crate::util::eq_ic(&p.name, name)) {
            p.is_all_in = true;
        }
    }
    if lower.contains("fold") {
        let name = line.split(':').next().unwrap_or("").trim();
        if let Some(p) = hand.players.iter_mut().find(|p| crate::util::eq_ic(&p.name, name)) {
            p.folded = true;
        }
    }
}

fn assign_positions(hand: &mut ParsedHand, preflop: &[String]) {
    let player_count = hand.players.len();
    if player_count == 0 {
        return;
    }
    for line in preflop {
        let lower = line.to_lowercase();
        let name = line.split(':').next().unwrap_or("").trim();
        if lower.contains("post sb") || lower.contains("post small blind") {
            if let Some(p) = hand.players.iter_mut().find(|p| crate::util::eq_ic(&p.name, name)) {
                if player_count == 2 || p.position.trim().is_empty() {
                    p.position = "SB".into();
                }
            }
        } else if lower.contains("post bb") || lower.contains("post big blind") {
            if let Some(p) = hand.players.iter_mut().find(|p| crate::util::eq_ic(&p.name, name)) {
                p.position = "BB".into();
            }
        }
    }
    // Heads-up: button is the small blind.
    if player_count == 2 {
        for p in &mut hand.players {
            if p.position == "BTN" {
                p.position = "SB".into();
            }
        }
    }
}

fn investment_for_player(streets: &StreetLines, player: &str) -> f64 {
    let mut total = 0.0;
    for lines in [&streets.preflop, &streets.flop, &streets.turn, &streets.river] {
        let mut street_total = 0.0;
        for line in lines {
            if !line.starts_with(&format!("{player}: ")) && !line.starts_with(&format!("{player}:")) {
                continue;
            }
            for re in [
                regex!(r"Post SB €([\d.,]+)"),
                regex!(r"Post BB €([\d.,]+)"),
                regex!(r"Call €([\d.,]+)"),
                regex!(r"Bet €([\d.,]+)"),
            ] {
                if let Some(c) = re.captures(line) {
                    street_total += parse_euro(&c[1]);
                }
            }
            if let Some(c) = regex!(r"Raise \(NF\) €([\d.,]+)").captures(line) {
                street_total = f64::max(street_total, parse_euro(&c[1]));
            }
            if let Some(c) = regex!(r"Allin €([\d.,]+)").captures(line) {
                street_total = f64::max(street_total, parse_euro(&c[1]));
            }
        }
        total += street_total;
    }
    total
}

fn parse_euro(raw: &str) -> f64 {
    // iPoker uses `.` as decimal separator and `,` as thousands separator (e.g. €1,020.00).
    parse_f64(&raw.replace('€', "").replace(',', "").trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn real_format_is_detected() {
        let content = "GAME #9178858768 Version:26.7.1.25 Uncalled:Y Texas Hold'em NL  Tournament 2026-11-24 19:36:38/GMT\nTable Info: Size: 3, Blinds: 10/20\n";
        assert!(IPokerParser.detect_format(content));
    }

    #[test]
    fn unrelated_content_is_not_detected_as_ipoker() {
        let winamax = "Winamax Poker - Tournament \"X\" buyIn: 1 + 0.1 level: 1 - HandId: #1 - Holdem no limit (10/20) - 2026/01/01 10:00:00 UTC";
        assert!(!IPokerParser.detect_format(winamax));
        let unibet = "Unibet Hand #1, Tournament #1, €1.00 + €0.10 - 10/20 - UTC 10:00:00 2026/01/01";
        assert!(!IPokerParser.detect_format(unibet));
    }

    #[test]
    fn euro_parsing_handles_thousands_separator_and_symbol() {
        assert_eq!(parse_euro("€1.86"), 1.86);
        assert_eq!(parse_euro("€1,020.00"), 1020.0);
        assert_eq!(parse_euro("10.00"), 10.0);
    }

    #[test]
    fn parse_a_real_showdown_hand() {
        let content = "\
GAME #9178858768 Version:26.7.1.25 Uncalled:Y Texas Hold'em NL  Tournament 2026-11-24 19:36:38/GMT\n\
Table Info: Size: 3, Blinds: 10/20\n\
Table Twister 2€, 1218544661, 1218544660 (Tournament: Twister 2€ Buy-In: €1.86 + €0.14)\n\
Seat 3: gamblerpurple64 (€500.00 in chips)  DEALER\n\
Seat 6: jmenfouu (€500.00 in chips)\n\
Seat 10: Calibr12 (€500.00 in chips)\n\
jmenfouu: Post SB €10.00\n\
Calibr12: Post BB €20.00\n\
*** HOLE CARDS ***\n\
Dealt to jmenfouu [CQ SA]\n\
jmenfouu: Raise (NF) €500.00\n\
Calibr12: Allin €480.00\n\
gamblerpurple64: Fold\n\
*** FLOP *** [D9 C9 C5]\n\
*** TURN *** [H7]\n\
*** RIVER *** [HA]\n\
*** SUMMARY ***\n\
Total pot €1,020.00 Rake €0.00\n\
jmenfouu: Shows [CQ SA] Two Pair, Aces and Nines\n\
Calibr12: Shows [C4 DA] Two Pair, Aces and Nines\n\
jmenfouu: wins €1,020.00\n";
        let hand = IPokerParser.parse_hand(content).expect("parse real hand");
        assert_eq!(hand.hand_id.as_deref(), Some("9178858768"));
        assert_eq!(hand.date_time.as_deref(), Some("2026-11-24 19:36:38"));
        assert_eq!((hand.buy_in, hand.rake_per_player), (2.0, Some(0.14)));
        assert_eq!(hand.blinds.as_deref(), Some("10/20"));
        assert_eq!(hand.player_count, 3);
        assert_eq!(hand.total_pot, 1020.0);
        assert_eq!(hand.went_to_showdown, true);

        let hero = hand.players.iter().find(|p| p.is_hero).unwrap();
        assert_eq!(hero.name, "jmenfouu");
        assert_eq!(hero.cards, "CQ SA");
        assert_eq!(hero.position, "SB");
        assert_eq!((hero.investment, hero.chips_won, hero.net_profit), (500.0, 1020.0, 520.0));

        let villain = hand.players.iter().find(|p| p.name == "Calibr12").unwrap();
        assert!(villain.is_all_in);
        assert_eq!(villain.chips_won, 0.0);
    }
}
