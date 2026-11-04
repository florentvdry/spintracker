//! Parser parity tests: the sample hand histories must reproduce the figures recorded in the
//! `expected_result*.txt` files (hands, tournaments and the hero's chips won).

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use spintracker_core::models::ParsedHand;
use spintracker_core::parsers::{get_parser, BetclicParser, HandParser, UnibetParser, WinamaxParser};

fn sample_dir(room: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/exemple-data").join(room)
}

fn read_text(path: &Path) -> String {
    let bytes = fs::read(path).unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()));
    String::from_utf8_lossy(&bytes).trim_start_matches('\u{feff}').to_string()
}

fn files_in(dir: &Path, keep: impl Fn(&str) -> bool) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("cannot list {}: {e}", dir.display()))
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map_or(false, |x| x == "txt"))
        .filter(|p| keep(&p.file_name().unwrap().to_string_lossy()))
        .collect();
    files.sort();
    assert!(!files.is_empty(), "no sample files in {}", dir.display());
    files
}

fn parse_all(parser: &dyn HandParser, files: &[PathBuf]) -> Vec<ParsedHand> {
    let mut hands = Vec::new();
    for file in files {
        let result = parser.parse_file(&read_text(file));
        assert!(result.success, "parser failed on {}: {:?}", file.display(), result.error);
        hands.extend(result.hands);
    }
    hands
}

/// Figures of the first ("Global") block of an expected-results file.
#[derive(Debug, Default)]
struct Expected {
    hero: String,
    hands: usize,
    tournaments: usize,
    chips_won: i64,
    chips_won_showdown: i64,
    chips_won_non_showdown: i64,
}

fn parse_expected(path: &Path) -> Expected {
    let mut e = Expected::default();
    let (mut seen_hands, mut seen_tournaments, mut seen_chips, mut seen_sd, mut seen_nsd) = (false, false, false, false, false);
    for line in read_text(path).lines().map(str::trim) {
        let number = |token: Option<&str>| token.and_then(|t| t.parse::<i64>().ok());
        let words: Vec<&str> = line.split_whitespace().collect();
        if let Some(rest) = line.split_once("pseudo:") {
            if e.hero.is_empty() {
                e.hero = rest.1.trim().to_string();
            }
        } else if line.contains("Mains") && !seen_hands {
            e.hands = number(words.first().copied()).unwrap_or(0) as usize;
            seen_hands = true;
        } else if (line.starts_with("Tornaments") || line.starts_with("Tournaments")) && !seen_tournaments {
            e.tournaments = number(words.last().copied()).unwrap_or(0) as usize;
            seen_tournaments = true;
        } else if line.ends_with("chips won with showdown") && !seen_sd {
            e.chips_won_showdown = number(words.first().copied()).unwrap();
            seen_sd = true;
        } else if line.ends_with("chips won without showdown") && !seen_nsd {
            e.chips_won_non_showdown = number(words.first().copied()).unwrap();
            seen_nsd = true;
        } else if line.ends_with("chips won") && !seen_chips {
            e.chips_won = number(words.first().copied()).unwrap();
            seen_chips = true;
        }
    }
    assert!(seen_hands && seen_tournaments && seen_chips && seen_sd && seen_nsd, "incomplete {}", path.display());
    e
}

/// Compares the parsed hands with the expected figures for the hero picked by `hero_of`.
fn assert_matches_expected(hands: &[ParsedHand], expected: &Expected, hero_of: impl Fn(&ParsedHand) -> Option<usize>) {
    assert_eq!(hands.len(), expected.hands, "hands");
    let tournaments: HashSet<&str> =
        hands.iter().filter_map(|h| h.game_id.as_deref()).filter(|id| !id.trim().is_empty()).collect();
    assert_eq!(tournaments.len(), expected.tournaments, "tournaments");

    let (mut won, mut won_sd, mut won_nsd) = (0.0, 0.0, 0.0);
    for hand in hands {
        let Some(i) = hero_of(hand) else { continue };
        let hero = &hand.players[i];
        won += hero.net_profit;
        if hero.went_to_showdown {
            won_sd += hero.net_profit;
        } else {
            won_nsd += hero.net_profit;
        }
    }
    assert_eq!(f64::round_ties_even(won) as i64, expected.chips_won, "chips won");
    assert_eq!(f64::round_ties_even(won_sd) as i64, expected.chips_won_showdown, "chips won with showdown");
    assert_eq!(f64::round_ties_even(won_nsd) as i64, expected.chips_won_non_showdown, "chips won without showdown");
}

#[test]
fn betclic_samples_match_expected_figures() {
    let dir = sample_dir("Betclic");
    let expected = parse_expected(&dir.join("excepted_result.txt"));
    let files = files_in(&dir, |name| name != "excepted_result.txt");
    let hands = parse_all(&BetclicParser, &files);
    assert_matches_expected(&hands, &expected, |h| {
        h.players.iter().position(|p| p.is_hero || p.name == expected.hero)
    });
}

#[test]
fn winamax_samples_match_expected_figures() {
    let dir = sample_dir("Winamax");
    let expected = parse_expected(&dir.join("expected_result.txt"));
    let files = files_in(&dir, |name| name != "expected_result.txt" && !name.contains("_summary"));
    let hands = parse_all(&WinamaxParser, &files);
    for hand in &hands {
        assert!(hand.players.iter().any(|p| p.is_hero), "hand {:?} has no hero", hand.hand_id);
    }
    assert_matches_expected(&hands, &expected, |h| h.players.iter().position(|p| p.is_hero));
}

#[test]
fn unibet_samples_match_expected_figures() {
    let dir = sample_dir("Unibet");
    let expected = parse_expected(&dir.join("expected_results.txt"));
    let files = files_in(&dir, |name| name.starts_with('H'));
    let hands = parse_all(&UnibetParser, &files);
    let hero = expected.hero.to_lowercase();
    assert_matches_expected(&hands, &expected, |h| {
        h.players.iter().position(|p| p.name.to_lowercase().contains(&hero))
    });
}

#[test]
fn format_detection_picks_the_right_room() {
    for (room, parser) in [("Betclic", "Betclic"), ("Winamax", "Winamax"), ("Unibet", "Unibet")] {
        let dir = sample_dir(room);
        let file = files_in(&dir, |n| n.starts_with(|c: char| c != 'e') && !n.contains("_summary") && !n.starts_with("TS"))
            .remove(0);
        let content = read_text(&file);
        assert_eq!(get_parser(&content).map(|p| p.room_name()), Some(parser), "room {room}");
    }
}

#[test]
fn parsed_hands_are_internally_consistent() {
    let cases: [(&str, &dyn HandParser, fn(&str) -> bool); 3] = [
        ("Betclic", &BetclicParser, |n| n != "excepted_result.txt"),
        ("Winamax", &WinamaxParser, |n| n != "expected_result.txt" && !n.contains("_summary")),
        ("Unibet", &UnibetParser, |n| n.starts_with('H')),
    ];
    for (room, parser, keep) in cases {
        let hands = parse_all(parser, &files_in(&sample_dir(room), keep));
        let ids: HashSet<&str> = hands.iter().filter_map(|h| h.id.as_deref()).collect();
        assert_eq!(ids.len(), hands.len(), "{room}: hand ids must be unique");
        for hand in &hands {
            assert!(!hand.players.is_empty(), "{room}: no players in {:?}", hand.id);
            assert_eq!(hand.player_count as usize, hand.players.len(), "{room}: player count");
            assert!(!hand.preflop_action.is_empty(), "{room}: no preflop action in {:?}", hand.id);
        }
    }
}

#[test]
fn betclic_hand_has_the_expected_fields() {
    let content = read_text(&sample_dir("Betclic").join("21793509_ExportHH_2026-1-2.txt"));
    let hand = BetclicParser.parse_file(&content).hands.remove(0);

    assert_eq!(hand.room.as_deref(), Some("Betclic.fr"));
    assert_eq!(hand.game_id.as_deref(), Some("01KE0E9VW7KKPNRM9PYPG9D7A5"));
    assert_eq!(hand.id.as_deref(), Some("01KE0EM78GQ5YJ5JGPZKQKTVCA"));
    assert_eq!(hand.date_time.as_deref(), Some("2026-01-02 22:53:05"));
    assert_eq!((hand.prize_pool, hand.multiplier, hand.buy_in), (4.0, 2, 2.0));
    assert_eq!(hand.blinds.as_deref(), Some("50/100"));
    assert_eq!(hand.total_pot, 1360.0);
    assert_eq!(hand.player_count, 2);
    assert!(hand.went_to_showdown);
    assert_eq!(hand.all_in_street.as_deref(), Some("PREFLOP"));
    assert_eq!(hand.position, 2, "hero finished 2nd");
    assert_eq!(hand.flop.as_deref(), Some("3c 9s Js"));
    assert_eq!(hand.turn.as_deref(), Some("2c"));
    assert_eq!(hand.river.as_deref(), Some("7h"));

    let hero = hand.players.iter().find(|p| p.is_hero).unwrap();
    assert_eq!((hero.name.as_str(), hero.position.as_str()), ("jmenfouu", "SB"), "BTN SB becomes SB heads-up");
    assert_eq!((hero.investment, hero.chips_won, hero.net_profit), (680.0, 0.0, -680.0));
    assert_eq!(hero.cards, "Kc 2d");

    let villain = hand.players.iter().find(|p| !p.is_hero).unwrap();
    assert_eq!((villain.investment, villain.chips_won, villain.net_profit), (680.0, 1360.0, 680.0));
    assert!(hand.result.contains("Hero: Raises to 680"), "hero name is hidden in the result log");

    let actions = hand.structured_actions.as_ref().unwrap();
    assert_eq!(actions.actions.len(), 4);
    assert_eq!(actions.actions[2].amount, Some(680.0));
    assert!(actions.actions[2].is_all_in);
}

#[test]
fn winamax_hand_has_the_expected_fields() {
    let dir = sample_dir("Winamax");
    let file = files_in(&dir, |n| n.starts_with("20260415_Expresso(1096047576)") && !n.contains("_summary")).remove(0);
    let hand = WinamaxParser.parse_file(&read_text(&file)).hands.remove(0);

    assert_eq!(hand.game_id.as_deref(), Some("1096047576"));
    assert_eq!(hand.hand_id.as_deref(), Some("4707488493780074497-6-1776261096"));
    assert_eq!(hand.date_time.as_deref(), Some("2026-04-15 13:51:36"));
    assert_eq!((hand.buy_in, hand.rake_per_player), (0.93, Some(0.07)));
    assert_eq!(hand.tournament_level, Some(2));
    assert_eq!(hand.blinds.as_deref(), Some("15/30"));
    assert_eq!(hand.button_seat, Some(3));
    assert_eq!(hand.player_count, 3);

    let position_of = |name: &str| hand.players.iter().find(|p| p.name == name).unwrap().position.clone();
    assert_eq!(position_of("Nelfrot-YT"), "BTN");
    assert_eq!(position_of("riickyy777"), "SB");
    assert_eq!(position_of("CG_Boss2336"), "BB");
    let hero = hand.players.iter().find(|p| p.is_hero).unwrap();
    assert_eq!((hero.name.as_str(), hero.cards.as_str()), ("Nelfrot-YT", "5d 7d"));
}
