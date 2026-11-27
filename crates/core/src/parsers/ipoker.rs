//! iPoker Spin & Go hand histories.
//!
//! iPoker skins (Betclic, Winamax on iPoker, etc.) export hands in a shared layout:
//! sections `*** HEADER ***`, `*** PLAYERS ***`, `*** HOLE CARDS ***`, streets,
//! `*** SHOWDOWN ***`, `*** SUMMARY ***`, separated by `------------`. iPoker is
//! detected separately from Betclic so that each room can keep its own parser version
//! and detection marker even though they share the export layout.

use chrono::NaiveDateTime;

use super::{after_first, clean_lines, content_id, join_lines, parse_f64, parse_i32, regex, split_before_marker, HandParser};
use crate::models::{
    ActionType, BlindsInfo, BoardInfo, HandActions, HandInfo, HandSummary, ParseResult, ParsedHand,
    PlayerHandInfo, PlayerInfo, StreetAction, WinnerInfo,
};

const HAND_SEPARATOR: &str = "------------";

pub struct IPokerParser;

#[derive(Clone, Copy, PartialEq)]
enum Section {
    Header,
    Players,
    HoleCards,
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
            Section::Players => "PLAYERS",
            Section::HoleCards => "HOLE_CARDS",
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

impl StreetLines {
    fn push(&mut self, section: Section, line: &str) {
        match section {
            Section::Preflop | Section::HoleCards => self.preflop.push(line.to_string()),
            Section::Flop => self.flop.push(line.to_string()),
            Section::Turn => self.turn.push(line.to_string()),
            Section::River => self.river.push(line.to_string()),
            _ => {}
        }
    }

    fn by_street(&self) -> [(&'static str, &Vec<String>); 4] {
        [
            ("preflop", &self.preflop),
            ("flop", &self.flop),
            ("turn", &self.turn),
            ("river", &self.river),
        ]
    }
}

#[derive(Default)]
struct State {
    hero_name: Option<String>,
    players: Vec<String>,
    hero_has_pot_recorded: bool,
    explicit_pot_win_found: bool,
    showdown_section_encountered: bool,
    streets: StreetLines,
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

    /// Séparateur entre deux mains. Le format actuel iPoker Network ouvre chaque main par
    /// `GAME #…` ; les mains sont séparées par une ligne vide.
    fn hand_separator_for(&self, content: &str) -> &'static str {
        if content.contains("GAME #") {
            "GAME #"
        } else {
            HAND_SEPARATOR
        }
    }

    fn detect_format(&self, content: &str) -> bool {
        let lower = content.to_lowercase();
        // Ancien format : `Site: iPoker…` avec sections `*** HEADER ***` / `*** PLAYERS ***`.
        if lower.contains("site:") && lower.contains("ipoker") {
            return true;
        }
        // Format actuel iPoker Network (`GAME #…`, `Uncalled:Y`, `Table Info:`).
        // Aucun `Site:` ni nom de room explicite : on s'appuie sur la structure d'export.
        lower.contains("game #")
            && lower.contains("uncalled:y")
            && lower.contains("table info:")
    }

    fn parse_file(&self, content: &str) -> ParseResult {
        let separator = self.hand_separator_for(content);
        let hands: Vec<&str> = if separator == "GAME #" {
            split_before_marker(content, separator)
        } else {
            content
                .split(separator)
                .map(str::trim)
                .filter(|t| !t.is_empty())
                .collect()
        };
        let hands = hands.into_iter().filter_map(|t| self.parse_hand(t)).collect();
        ParseResult::ok(hands)
    }

    fn parse_hand(&self, hand_text: &str) -> Option<ParsedHand> {
        let lines = clean_lines(hand_text);
        if lines.is_empty() {
            return None;
        }
        let mut hand = ParsedHand { room: Some("iPoker".into()), ..ParsedHand::default() };
        let mut st = State::default();
        let mut section = Section::Header;

        // Première ligne : `GAME #<id> Version:… Uncalled:Y Texas Hold'em NL  Tournament <date>/GMT`
        if let Some(first) = lines.first() {
            if let Some(c) = regex!(r"GAME #(\S+)").captures(first) {
                hand.game_id = Some(c[1].to_string());
                hand.hand_id = Some(c[1].to_string());
            }
            if let Some(c) = regex!(r"Tournament\s+(.*?)\s*/GMT").captures(first) {
                hand.date_time = Some(format_date_time(c[1].trim()));
            }
        }

        for line in &lines {
            let result_line = match st.hero_name.as_deref() {
                Some(h) if !h.is_empty() => line.replace(h, "Hero"),
                _ => line.clone(),
            };
            hand.result.push_str(&result_line);
            hand.result.push('\n');

            if let Some(new_section) = detect_section(line) {
                section = new_section;
                parse_board_cards(line, section, &mut hand);
                if section == Section::Showdown {
                    hand.went_to_showdown = true;
                    st.showdown_section_encountered = true;
                }
                continue;
            }

            match section {
                Section::Header => {
                    parse_header_line(line, &mut hand);
                    parse_meta_line(line, &mut hand, &mut st);
                    if line.contains("Seat ") {
                        parse_player_line(line, &mut hand, &mut st);
                    } else {
                        // Mises préflop avant `*** HOLE CARDS ***` (Post SB, Post BB, Raise…).
                        parse_game_play_line(line, &mut hand, Section::Preflop, &mut st);
                    }
                }
                Section::Players => {}
                Section::HoleCards
                | Section::Preflop
                | Section::Flop
                | Section::Turn
                | Section::River
                | Section::Showdown => {
                    if parse_card_reveals(line, &mut hand, section, &mut st) {
                        continue;
                    }
                    parse_game_play_line(line, &mut hand, section, &mut st);
                }
                Section::Summary => parse_summary_line(line, &mut hand, &mut st),
            }
        }

        hand.preflop_action = join_lines(&st.streets.preflop);
        hand.flop_action = join_lines(&st.streets.flop);
        hand.turn_action = join_lines(&st.streets.turn);
        hand.river_action = join_lines(&st.streets.river);

        if hand.multiplier <= 0 && hand.buy_in > 0.0 && hand.prize_pool > 0.0 {
            hand.multiplier = i32::max(1, (hand.prize_pool / hand.buy_in).round() as i32);
        }

        build_structured_actions(&mut hand, &st);
        calculate_investments_and_profits(&mut hand, &st);
        normalize_hand_data(&mut hand, &st);
        generate_hand_id(&mut hand);
        consolidate_showdown_status(&mut hand, &st);

        Some(hand)
    }
}

/// Méta-infos de la table : blinds, taille, buy-in / fee et nom du tournoi.
fn parse_meta_line(line: &str, hand: &mut ParsedHand, st: &mut State) {
    if line.contains("Table Info:") {
        // `Table Info: Size: 3, Blinds: 10/20`
        if let Some(c) = regex!(r"Blinds:\s*(\d+)\s*/\s*(\d+)").captures(line) {
            let sb = parse_f64(&c[1]);
            let bb = parse_f64(&c[2]);
            hand.structured_blinds = Some(BlindsInfo { sb, bb, ante: None });
            hand.limit_type = Some("NL".into());
            hand.game_variant = Some("HOLDEM".into());
            hand.blinds = Some(format!("{sb}/{bb}"));
        }
        if let Some(c) = regex!(r"Size:\s*(\d+)").captures(line) {
            hand.player_count = parse_i32(&c[1]);
            st.players.reserve(hand.player_count as usize);
        }
    } else if line.starts_with("Table ") {
        // `Table Twister 2?, 1218544661, 1218544660 (Tournament: Twister 2? Buy-In: ?1.86 + ?0.14)`
        if let Some(c) = regex!(r"Buy-In:\s*\??([\d.,]+)\s*\+\s*\??([\d.,]+)").captures(line) {
            let buy_in = parse_f64(&c[1].replace(',', ""));
            let fee = parse_f64(&c[2].replace(',', ""));
            hand.buy_in = buy_in;
            // L'entrée effective inclut le fee ; on l'ajoute au buy-in pour le calcul du multiplier.
            hand.prize_pool = buy_in + fee;
        }
        if let Some(c) = regex!(r"Tournament:\s*([^(]+)").captures(line) {
            let name = c[1].trim().trim_end_matches('?').trim().to_string();
            if !name.is_empty() {
                hand.game_name = Some(name);
            }
        }
    }
}

fn detect_section(line: &str) -> Option<Section> {
    [
        ("*** HEADER ***", Section::Header),
        ("*** PLAYERS ***", Section::Players),
        ("*** HOLE CARDS ***", Section::HoleCards),
        ("*** PRE-FLOP ***", Section::Preflop),
        ("*** FLOP ***", Section::Flop),
        ("*** TURN ***", Section::Turn),
        ("*** RIVER ***", Section::River),
        ("*** SHOWDOWN ***", Section::Showdown),
        ("*** SUMMARY ***", Section::Summary),
    ]
    .into_iter()
    .find(|(marker, _)| line.contains(marker))
    .map(|(_, s)| s)
}

fn parse_board_cards(line: &str, section: Section, hand: &mut ParsedHand) {
    let Some(c) = regex!(r"\[(.*?)\]").captures(line) else { return };
    match section {
        Section::Flop => hand.flop = Some(c[1].to_string()),
        Section::Turn => hand.turn = c[1].split(' ').next_back().map(str::to_string),
        Section::River => hand.river = c[1].split(' ').next_back().map(str::to_string),
        _ => {}
    }
}

fn first_number_not_after_x(line: &str) -> Option<f64> {
    let bytes = line.as_bytes();
    let start = (0..bytes.len()).find(|&i| bytes[i].is_ascii_digit() && (i == 0 || bytes[i - 1] != b'x'))?;
    let mut end = start;
    while end < bytes.len() && bytes[end].is_ascii_digit() {
        end += 1;
    }
    if end < bytes.len() && bytes[end] == b'.' {
        end += 1;
        while end < bytes.len() && bytes[end].is_ascii_digit() {
            end += 1;
        }
    }
    line[start..end].parse().ok()
}

fn format_date_time(raw: &str) -> String {
    let raw = raw.trim();
    for format in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y/%m/%d %H:%M:%S"] {
        if let Ok(d) = NaiveDateTime::parse_from_str(raw, format) {
            return d.format("%Y-%m-%d %H:%M:%S").to_string();
        }
    }
    raw.to_string()
}

fn parse_header_line(line: &str, hand: &mut ParsedHand) {
    if line.contains("Site:") {
        hand.room = Some(after_first(line, ':').to_string());
    } else if line.contains("Game Mode:") {
        hand.game_mode = Some(after_first(line, ':').to_string());
    } else if line.contains("Game Type:") {
        hand.game_type = Some(after_first(line, ':').to_string());
    } else if line.contains("Game Name:") {
        hand.game_name = Some(after_first(line, ':').to_string());
    } else if line.contains("Game ID:") {
        hand.game_id = Some(after_first(line, ':').to_string());
    } else if line.contains("Hand ID:") {
        hand.hand_id = Some(after_first(line, ':').to_string());
    } else if line.contains("Prize pool:") {
        if let Some(n) = first_number_not_after_x(line) {
            hand.prize_pool = n;
        }
    } else if line.contains("Multiplier:") {
        if let Some(c) = regex!(r"x(\d+)").captures(line) {
            hand.multiplier = parse_i32(&c[1]);
        }
    } else if line.contains("Buy In:") {
        if regex!(r"[\d.]+").is_match(line) {
            let amounts = line.split(':').nth(1).unwrap_or("");
            hand.buy_in = regex!(r"[\d.]+")
                .find_iter(amounts)
                .filter_map(|m| m.as_str().parse::<f64>().ok())
                .sum();
        }
    } else if line.contains("Date & Time:") {
        let raw = after_first(line, ':').replace("(UTC)", "");
        hand.date_time = Some(format_date_time(&raw));
    } else if line.contains("Table ID:") {
        hand.table_id = Some(after_first(line, ':').to_string());
    } else if line.contains("Blinds:") {
        let blinds = after_first(line, ':').to_string();
        parse_blinds(hand, &blinds);
        hand.blinds = Some(blinds);
    } else if line.contains("Total Pot:") {
        if let Some(n) = first_number_not_after_x(line) {
            hand.total_pot = n;
        }
    } else if line.contains("Rake:") {
        if let Some(n) = first_number_not_after_x(line) {
            hand.rake = n;
        }
    }
}

fn parse_blinds(hand: &mut ParsedHand, blinds: &str) {
    if let Some(c) = regex!(r"(\d+\.?\d*)/(\d+\.?\d*)").captures(blinds) {
        hand.structured_blinds = Some(BlindsInfo { sb: parse_f64(&c[1]), bb: parse_f64(&c[2]), ante: None });
        hand.limit_type = Some("NL".into());
        hand.game_variant = Some("HOLDEM".into());
    }
    if let Some(c) = regex!(r"(?i)ante (\d+\.?\d*)").captures(blinds) {
        let ante = parse_f64(&c[1]);
        hand.ante = Some(ante);
        hand.structured_blinds.get_or_insert_with(BlindsInfo::default).ante = Some(ante);
    }
}

fn extract_position(positions: &str) -> &'static str {
    let upper = positions.to_uppercase();
    if upper.contains("BTN") && upper.contains("SB") {
        "BTN SB"
    } else if upper.contains("BTN") {
        "BTN"
    } else if upper.contains("SB") {
        "SB"
    } else if upper.contains("BB") {
        "BB"
    } else if upper.contains("CO") {
        "CO"
    } else if upper.contains("MP") {
        "MP"
    } else if upper.contains("UTG") {
        "UTG"
    } else {
        "Unknown"
    }
}

fn parse_player_line(line: &str, hand: &mut ParsedHand, st: &mut State) {
    if !line.contains("Seat ") {
        return;
    }
    // `Seat 1: hero_player (?1500.00 in chips)  DEALER`
    if let Some(c) = regex!(r"Seat (\d+): (.+?) \(\??([\d.,]+) in chips\)(.*)").captures(line) {
        let name = c[2].to_string();
        let positions = &c[4];
        let is_hero = positions.contains("Hero");
        st.players.push(name.clone());
        hand.players.push(PlayerInfo {
            name: name.clone(),
            stack: parse_f64(&c[3].replace(',', "")),
            is_hero,
            position: extract_position(positions).to_string(),
            ..PlayerInfo::default()
        });
        if is_hero {
            st.hero_name = Some(name);
        }
    }
}

fn parse_game_play_line(line: &str, hand: &mut ParsedHand, section: Section, st: &mut State) {
    if !parse_card_reveals(line, hand, section, st) {
        parse_action_line(line, hand, section, st);
    }
}

fn is_hero_name(name: &str, hero_name: Option<&str>) -> bool {
    hero_name.is_some_and(|h| !h.is_empty() && crate::util::eq_ic(name, h)) || crate::util::eq_ic(name, "Hero")
}

fn is_valid_card_string(cards: &str) -> bool {
    !crate::util::eq_ic(cards, "none") && !cards.to_lowercase().contains("folded")
}

fn update_player_cards(hand: &mut ParsedHand, name: &str, cards: &str) {
    if let Some(p) = hand.players.iter_mut().find(|p| crate::util::eq_ic(&p.name, name)) {
        if p.cards.is_empty() {
            p.cards = cards.to_string();
        } else if !p.cards.contains(cards) {
            p.cards.push('|');
            p.cards.push_str(cards);
        }
    }
}

fn parse_card_reveals(line: &str, hand: &mut ParsedHand, section: Section, st: &mut State) -> bool {
    let show = regex!(r"(?i)^(?:[0-9]{1,2}:[0-9]{2}\s*-\s*)?(.+?)\s+(?:shows|mucks)\s+\[(.*?)\]").captures(line);
    let hole = regex!(r"(?i)^(?:[0-9]{1,2}:[0-9]{2}\s*-\s*)?(.+?):\s*\[(.+?)\]").captures(line);
    let dealt = regex!(r"(?i)^Dealt to (.+?) \[(.+?)\]").captures(line);
    let no_show = regex!(r"(?i)^(?:[0-9]{1,2}:[0-9]{2}\s*-\s*)?(.+?)\s+does not show").captures(line);
    let summary_show = regex!(r"(?i)Seat \d+: (.+?) .*showed \[(.+?)\]").captures(line);

    if let Some(c) = dealt {
        let name = c[1].trim().trim_end_matches(':').trim();
        let cards = c[2].trim().to_string();
        if let Some(p) = hand.players.iter_mut().find(|p| crate::util::eq_ic(&p.name, name)) {
            p.is_hero = true;
            p.cards = cards;
        }
        return true;
    }

    if let Some(c) = show {
        let name = c[1].trim().trim_end_matches(':').trim();
        let cards = c[2].trim();
        hand.went_to_showdown = true;
        st.showdown_section_encountered = true;
        update_player_cards(hand, name, cards);
        return true;
    }

    if hole.is_some() || summary_show.is_some() {
        let is_summary_show = summary_show.is_some();
        let c = hole.or(summary_show).expect("one of the two matched");
        let name = c[1].trim().trim_end_matches(':').trim();
        let cards = c[2].trim();

        let player_idx = hand.players.iter().position(|p| crate::util::eq_ic(&p.name, name));
        if let Some(i) = player_idx {
            hand.players[i].cards = cards.to_string();
            if matches!(section, Section::Showdown | Section::Summary) {
                hand.players[i].went_to_showdown = true;
            }
        }

        if is_hero_name(name, st.hero_name.as_deref()) {
            if is_summary_show {
                hand.went_to_showdown = true;
                st.showdown_section_encountered = true;
                if let Some(i) = player_idx {
                    hand.players[i].went_to_showdown = true;
                }
            }
        } else if is_valid_card_string(cards) && (is_summary_show || section == Section::Showdown) {
            hand.went_to_showdown = true;
            st.showdown_section_encountered = true;
            if let Some(i) = player_idx {
                hand.players[i].went_to_showdown = true;
            }
        }
        return true;
    }

    if let Some(c) = no_show {
        let name = c[1].trim().trim_end_matches(':').trim();
        hand.went_to_showdown = true;
        st.showdown_section_encountered = true;
        if let Some(p) = hand.players.iter_mut().find(|p| crate::util::eq_ic(&p.name, name)) {
            p.went_to_showdown = true;
        }
        return true;
    }

    false
}

fn is_line_of(line: &str, player: &str) -> bool {
    regex!(r"^(?:[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\s*-\s*)?(.+?):").captures(line).is_some_and(|c| crate::util::eq_ic(c[1].trim(), player))
}

fn parse_action_line(line: &str, hand: &mut ParsedHand, section: Section, st: &mut State) {
    let lower = line.to_lowercase();

    if lower.contains("folds") {
        handle_fold(line, hand);
    }

    let is_action = ["post", "raise", "call", "bet", "fold", "check", "all-in"]
        .iter()
        .any(|k| lower.contains(k));
    if !is_action {
        return;
    }

    st.streets.push(section, line);

    if lower.contains("all-in") {
        if hand.all_in_street.as_deref().map_or(true, str::is_empty) {
            hand.all_in_street = Some(section.name().to_string());
        }
        for p in &mut hand.players {
            if is_line_of(line, &p.name) {
                p.is_all_in = true;
            }
        }
    }
}

fn handle_fold(line: &str, hand: &mut ParsedHand) {
    let lower = line.to_ascii_lowercase();
    let mut name = String::new();

    let extract = || -> String {
        let idx = line.to_ascii_lowercase().rfind("folds").unwrap_or(line.len());
        let mut pre_fold = line[..idx].trim().to_string();
        if pre_fold.ends_with(':') {
            pre_fold.pop();
            pre_fold = pre_fold.trim().to_string();
        }
        match pre_fold.rfind("- ") {
            Some(dash) => pre_fold[dash + 1..].trim().to_string(),
            None => pre_fold,
        }
    };

    if lower.ends_with("folds") || lower.contains(" folds ") || regex!(r"(?i)(?:^|:\s*)Folds\b").is_match(line) {
        name = extract();
    }

    if !name.is_empty() {
        if let Some(p) = hand.players.iter_mut().find(|p| crate::util::eq_ic(&p.name, &name)) {
            p.folded = true;
        }
    }
}

fn parse_summary_line(line: &str, hand: &mut ParsedHand, st: &mut State) {
    let lower = line.to_lowercase();

    if !line.trim().is_empty() {
        if hand.showdown.is_empty() {
            hand.showdown = line.to_string();
        } else {
            hand.showdown.push('\n');
            hand.showdown.push_str(line);
        }
    }

    if let Some(c) = regex!(r"(?i)^(?:[0-9]{1,2}:[0-9]{2}:[0-9]{2}\s*-\s*)?(.+?) finished (\d+)(?:st|nd|rd)").captures(line) {
        if is_hero_name(c[1].trim(), st.hero_name.as_deref()) {
            hand.position = parse_i32(&c[2]);
        }
    }

    if lower.contains("total pot") {
        if let Some(c) = regex!(r"(\d+\.?\d*)").captures(line) {
            hand.total_pot = parse_f64(&c[1]);
        }
    }

    let showdown_seen = st.showdown_section_encountered;

    if let Some(c) = regex!(r"(?i)^(?:[0-9]{1,2}:[0-9]{2}:[0-9]{2}\s*-\s*)?(.+?) wins .*?pot (?:of )?(\d+(?:\.\d+)?)").captures(line) {
        st.explicit_pot_win_found = true;
        let winner = c[1].trim();
        let amount = parse_f64(&c[2]);
        let is_hero_win = is_hero_name(winner, st.hero_name.as_deref());

        let mut idx = hand.players.iter().position(|p| crate::util::eq_ic(&p.name, winner));
        if idx.is_none() && is_hero_win {
            idx = hand.players.iter().position(|p| p.is_hero);
        }
        if let Some(i) = idx {
            hand.players[i].chips_won += amount;
        }

        let all_in_showdown = |hand: &ParsedHand, i: usize| {
            hand.players[i].is_all_in
                && hand.players.iter().any(|p| p.name != hand.players[i].name && p.is_all_in)
        };

        if is_hero_win {
            st.hero_has_pot_recorded = true;
            if showdown_seen || idx.is_some_and(|i| all_in_showdown(hand, i)) {
                hand.went_to_showdown = true;
                if let Some(i) = idx {
                    hand.players[i].went_to_showdown = true;
                }
            }
        } else if let Some(i) = idx {
            if showdown_seen || all_in_showdown(hand, i) {
                hand.went_to_showdown = true;
                hand.players[i].went_to_showdown = true;
            }
        }
    }

    let hero = st.hero_name.clone().unwrap_or_default();
    if !st.hero_has_pot_recorded
        && !st.explicit_pot_win_found
        && !hero.is_empty()
        && lower.contains("finished")
        && lower.contains("wins")
        && lower.contains(&hero.to_lowercase())
        && hand.total_pot > 0.0
    {
        let hero_idx = hand.players.iter().position(|p| p.is_hero);
        if let Some(i) = hero_idx {
            hand.players[i].chips_won += hand.total_pot;
        }
        st.hero_has_pot_recorded = true;

        let hero_all_in_showdown = hero_idx.is_some_and(|i| {
            hand.players[i].is_all_in && hand.players.iter().any(|p| p.name != hand.players[i].name && p.is_all_in)
        });
        if showdown_seen || hero_all_in_showdown {
            hand.went_to_showdown = true;
            if let Some(i) = hero_idx {
                hand.players[i].went_to_showdown = true;
            }
        }
    }
}

fn calculate_player_investment(streets: &StreetLines, player: &str) -> f64 {
    let mut total = 0.0;
    for (_, actions) in streets.by_street() {
        let mut street_investment = 0.0;
        for action in actions {
            if !is_line_of(action, player) {
                continue;
            }
            if let Some(c) = regex!(r"Posts SB (\d+)").captures(action) {
                street_investment += parse_f64(&c[1]);
            }
            if let Some(c) = regex!(r"Posts BB (\d+)").captures(action) {
                street_investment += parse_f64(&c[1]);
            }
            if let Some(c) = regex!(r"Raises to (\d+)").captures(action) {
                street_investment = parse_f64(&c[1]);
            }
            if let Some(c) = regex!(r"Calls (\d+)").captures(action) {
                street_investment += parse_f64(&c[1]);
            }
            if let Some(c) = regex!(r"Bets (\d+)").captures(action) {
                street_investment += parse_f64(&c[1]);
            }
        }
        total += street_investment;
    }
    total
}

fn calculate_investments_and_profits(hand: &mut ParsedHand, st: &State) {
    let mut total_investment = 0.0;
    let mut max_investment = 0.0;
    let mut max_investor: Option<&str> = None;

    for name in &st.players {
        let inv = calculate_player_investment(&st.streets, name);
        if let Some(p) = hand.players.iter_mut().find(|p| &p.name == name) {
            p.investment = inv;
        }
        total_investment += inv;
        if inv > max_investment {
            max_investment = inv;
            max_investor = Some(name);
        }
    }

    if total_investment > hand.total_pot {
        if let Some(name) = max_investor {
            let excess = total_investment - hand.total_pot;
            if let Some(p) = hand.players.iter_mut().find(|p| p.name == name) {
                p.investment -= excess;
            }
        }
    }

    for p in &mut hand.players {
        p.net_profit = p.chips_won - p.investment;
    }
}

fn normalize_hand_data(hand: &mut ParsedHand, st: &State) {
    hand.player_count = st.players.len() as i32;
    if hand.player_count == 2 {
        for p in &mut hand.players {
            if p.position == "BTN SB" || p.position == "BTN" {
                p.position = "SB".into();
            }
        }
    }
}

fn generate_hand_id(hand: &mut ParsedHand) {
    let has = |v: &Option<String>| v.as_deref().map_or(false, |s| !s.is_empty());
    if has(&hand.hand_id) {
        hand.id = hand.hand_id.clone();
    } else if has(&hand.game_id) && has(&hand.date_time) {
        let id = format!("{}_{}", hand.game_id.as_deref().unwrap(), hand.date_time.as_deref().unwrap());
        hand.id = Some(id.replace(':', "").replace(' ', "_"));
        hand.hand_id = hand.game_id.clone();
    } else {
        hand.id = Some(content_id(&hand.result));
    }
}

fn consolidate_showdown_status(hand: &mut ParsedHand, st: &State) {
    if st.showdown_section_encountered {
        hand.went_to_showdown = true;
        for p in &mut hand.players {
            if !p.folded {
                p.went_to_showdown = true;
            }
        }
    }
}

fn build_structured_actions(hand: &mut ParsedHand, st: &State) {
    let positive = |v: f64| (v > 0.0).then_some(v);
    let mut structured = HandActions {
        info: Some(HandInfo {
            hand_id: hand.hand_id.clone(),
            room: hand.room.clone(),
            table: hand.table_id.clone(),
            table_size: hand.player_count,
            button_seat: hand.button_seat,
            date: hand.date_time.clone(),
            limit: hand.limit_type.clone(),
            game: hand.game_variant.clone(),
            blinds: hand.structured_blinds.clone(),
            currency: hand.currency.clone(),
            game_type: hand.game_mode.clone(),
            tournament_id: hand.game_id.clone(),
            tournament_name: hand.game_name.clone(),
            tournament_level: hand.tournament_level,
            buy_in: positive(hand.buy_in),
            buyin_currency: hand.buyin_currency.clone(),
            multiplier: (hand.multiplier > 1).then_some(hand.multiplier),
            prize_pool: positive(hand.prize_pool),
            position: (hand.position > 0).then_some(hand.position),
            ante: hand.ante,
            rake_per_player: hand.rake_per_player,
            ..HandInfo::default()
        }),
        players: hand
            .players
            .iter()
            .map(|p| PlayerHandInfo { seat: 0, name: p.name.clone(), stack: p.stack, is_hero: p.is_hero })
            .collect(),
        board: Some(BoardInfo {
            flop: hand.flop.as_deref().filter(|f| !f.is_empty()).map(|f| f.split(' ').map(str::to_string).collect()),
            turn: hand.turn.clone(),
            river: hand.river.clone(),
        }),
        summary: Some(HandSummary {
            total_pot: hand.total_pot,
            rake: hand.rake,
            winners: hand
                .players
                .iter()
                .filter(|p| p.chips_won > 0.0)
                .map(|p| WinnerInfo { player: p.name.clone(), amount: p.chips_won, hand: None, cards: None })
                .collect(),
        }),
        ..HandActions::default()
    };

    for (street, lines) in st.streets.by_street() {
        for (n, line) in lines.iter().enumerate() {
            if let Some(action) = structured_action(line, street, n as i32 + 1) {
                structured.actions.push(action);
            }
        }
    }
    hand.structured_actions = Some(structured);
}

fn structured_action(line: &str, street: &str, order: i32) -> Option<StreetAction> {
    let lower = line.to_lowercase();
    let player = regex!(r"^(?:[0-9]{1,2}:[0-9]{2}\s*-\s*)?(.+?):")
        .captures(line)
        .map(|c| c[1].trim().to_string())
        .unwrap_or_else(|| "Unknown".to_string());
    let base = StreetAction { street: street.to_string(), order, player, ..StreetAction::default() };
    let amount_of = |pattern: &regex::Regex| pattern.captures(line).map(|c| parse_f64(&c[1]));
    let is_all_in = lower.contains("all-in");

    if lower.contains("posts sb") {
        Some(StreetAction {
            action_type: ActionType::Post,
            post_type: Some("sb".into()),
            amount: amount_of(regex!(r"Posts SB (\d+)")),
            ..base
        })
    } else if lower.contains("posts bb") {
        Some(StreetAction {
            action_type: ActionType::Post,
            post_type: Some("bb".into()),
            amount: amount_of(regex!(r"Posts BB (\d+)")),
            ..base
        })
    } else if lower.contains("folds") {
        Some(StreetAction { action_type: ActionType::Fold, ..base })
    } else if lower.contains("checks") {
        Some(StreetAction { action_type: ActionType::Check, ..base })
    } else if lower.contains("bets") {
        let amount = amount_of(regex!(r"Bets (\d+)"));
        Some(StreetAction { action_type: ActionType::Bet, amount, effective: amount, is_all_in, ..base })
    } else if lower.contains("calls") {
        let amount = amount_of(regex!(r"Calls (\d+)"));
        Some(StreetAction { action_type: ActionType::Call, amount, effective: amount, is_all_in, ..base })
    } else if lower.contains("raises") {
        let amount = amount_of(regex!(r"Raises to (\d+)"));
        Some(StreetAction { action_type: ActionType::Raise, amount, effective: amount, is_all_in, ..base })
    } else {
        None
    }
}
