//! EV parity: the all-in adjusted results over the sample hand histories must reproduce the
//! figures recorded in the expected-results files (same checks and tolerances as the former
//! C# tests).

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use spintracker_core::engines::analytics::AnalyticsCalculator;
use spintracker_core::models::ParsedHand;
use spintracker_core::parsers::{BetclicParser, HandParser, UnibetParser, WinamaxParser};

fn sample_dir(room: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/exemple-data").join(room)
}

fn read_text(path: &Path) -> String {
    String::from_utf8_lossy(&fs::read(path).unwrap()).trim_start_matches('\u{feff}').to_string()
}

fn parse_room(parser: &dyn HandParser, room: &str, keep: impl Fn(&str) -> bool) -> Vec<ParsedHand> {
    let mut files: Vec<PathBuf> = fs::read_dir(sample_dir(room))
        .unwrap()
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "txt"))
        .filter(|p| keep(&p.file_name().unwrap().to_string_lossy()))
        .collect();
    files.sort();
    files.iter().flat_map(|f| parser.parse_file(&read_text(f)).hands).collect()
}

/// Signed integers of a line (`-?d+` matches), in order.
fn ints(line: &str) -> Vec<i64> {
    let bytes = line.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() {
            let start = if i > 0 && bytes[i - 1] == b'-' { i - 1 } else { i };
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
            out.push(line[start..i].parse().unwrap());
        } else {
            i += 1;
        }
    }
    out
}

#[derive(Debug, Default)]
struct Expected {
    hero: String,
    hands: i64,
    tournaments: i64,
    cev: Option<i64>,
    hu_sb: i64,
    hu_bb: i64,
    btn_3w: i64,
    sb_3w: i64,
    bb_3w: i64,
    chips_won: i64,
    net_expected: i64,
    won_showdown: i64,
    won_non_showdown: i64,
}

fn parse_expected(path: &Path) -> Expected {
    let mut e = Expected::default();
    for raw in read_text(path).lines() {
        let line = raw.trim();
        // Only the first ("global") block counts: per-day blocks start with a lowercase "date:".
        if line.starts_with("date:") {
            break;
        }
        let first = || ints(line).first().copied().unwrap_or(0);
        let last = || ints(line).last().copied().unwrap_or(0);
        let lower = line.to_lowercase();
        if let Some((_, hero)) = line.split_once("pseudo:") {
            e.hero = hero.trim().to_string();
        } else if lower.contains("mains") {
            e.hands = first();
        } else if lower.starts_with("tornaments") || lower.starts_with("tournaments") {
            e.tournaments = last();
        } else if lower.starts_with("chips ev / tournaments") {
            e.cev = Some(last());
        } else if lower.starts_with("headsup sb") || lower.starts_with("hu sb") {
            e.hu_sb = last();
        } else if lower.starts_with("headsup bb") || lower.starts_with("hu bb") {
            e.hu_bb = last();
        } else if lower.starts_with("button 3w") || lower.starts_with("btn") {
            e.btn_3w = last();
        } else if lower.starts_with("3way small blind") || lower.starts_with("3w sb") {
            e.sb_3w = last();
        } else if lower.starts_with("3way bigblinds") || lower.starts_with("3w bb") {
            e.bb_3w = last();
        } else if lower.contains("net excepted chips won") {
            e.net_expected = first();
        } else if lower.ends_with(" chips won") {
            e.chips_won = first();
        } else if lower.contains("chips won with showdown") {
            e.won_showdown = first();
        } else if lower.contains("chips won without showdown") {
            e.won_non_showdown = first();
        }
    }
    e
}

fn position_key(position: &str, player_count: i32) -> String {
    let prefix = if player_count == 2 { "HU" } else { "3W" };
    let pos = position.to_uppercase();
    if pos.contains("SB") {
        format!("{prefix} SB")
    } else if pos.contains("BB") {
        format!("{prefix} BB")
    } else if pos.contains("BTN") || pos.contains("BUTTON") {
        format!("{prefix} BTN")
    } else {
        format!("{prefix} {pos}")
    }
}

/// Runs the hands through the EV calculator and returns the differences with `expected`.
fn compare(hands: &mut [ParsedHand], expected: &Expected, hero_of: impl Fn(&ParsedHand) -> Option<usize>) -> Vec<String> {
    let calc = AnalyticsCalculator::default();
    let tournaments: HashSet<&str> =
        hands.iter().filter_map(|h| h.game_id.as_deref()).filter(|id| !id.trim().is_empty()).collect();
    let total_tournaments = tournaments.len() as f64;
    let total_hands = hands.len() as i64;

    let (mut chips, mut sd, mut nsd, mut net_expected) = (0.0, 0.0, 0.0, 0.0);
    let mut by_position = std::collections::HashMap::<String, f64>::new();

    for hand in hands.iter_mut() {
        let Some(i) = hero_of(hand) else { continue };
        for p in hand.players.iter_mut() {
            p.is_hero = false;
        }
        hand.players[i].is_hero = true;
        let hero = &hand.players[i];

        chips += hero.net_profit;
        if hero.went_to_showdown {
            sd += hero.net_profit;
        } else {
            nsd += hero.net_profit;
        }
        let adjusted = calc.calculate_hand_analytics(hand).net_won_adjusted.unwrap_or(hero.net_profit);
        net_expected += adjusted;
        *by_position.entry(position_key(&hero.position, hand.player_count)).or_default() += adjusted;
    }

    let per_tournament = |sum: f64| if total_tournaments == 0.0 { 0 } else { (sum / total_tournaments).round_ties_even() as i64 };
    let contribution = |key: &str| per_tournament(by_position.get(key).copied().unwrap_or(0.0));

    let mut diffs = Vec::new();
    let mut check = |label: &str, exp: i64, act: i64, tolerance: i64| {
        if (exp - act).abs() > tolerance {
            diffs.push(format!("{label}: expected={exp}, actual={act}"));
        }
    };
    check("Hands", expected.hands, total_hands, 0);
    check("Tournaments", expected.tournaments, total_tournaments as i64, 0);
    if let Some(cev) = expected.cev {
        check("Chips ev / Tournaments", cev, per_tournament(net_expected), 1);
    }
    check("HeadsUp SB", expected.hu_sb, contribution("HU SB"), 1);
    check("HeadsUp BB", expected.hu_bb, contribution("HU BB"), 1);
    check("Button 3W", expected.btn_3w, contribution("3W BTN"), 1);
    check("3Way Small Blind", expected.sb_3w, contribution("3W SB"), 1);
    check("3Way BigBlinds", expected.bb_3w, contribution("3W BB"), 1);
    check("chips won", expected.chips_won, chips.round_ties_even() as i64, 0);
    check("Net excepted Chips Won", expected.net_expected, net_expected.round_ties_even() as i64, 2);
    check("chips won with showdown", expected.won_showdown, sd.round_ties_even() as i64, 0);
    check("chips won without showdown", expected.won_non_showdown, nsd.round_ties_even() as i64, 0);
    diffs
}

#[test]
fn winamax_ev_matches_expected_figures() {
    let expected = parse_expected(&sample_dir("Winamax").join("expected_result.txt"));
    let mut hands = parse_room(&WinamaxParser, "Winamax", |n| n != "expected_result.txt" && !n.contains("_summary"));
    let diffs = compare(&mut hands, &expected, |h| h.players.iter().position(|p| p.is_hero));
    assert!(diffs.is_empty(), "Winamax expected vs actual mismatch:\n{}", diffs.join("\n"));
}

#[test]
fn unibet_ev_matches_expected_figures() {
    let expected = parse_expected(&sample_dir("Unibet").join("expected_results.txt"));
    let mut hands = parse_room(&UnibetParser, "Unibet", |n| n.starts_with('H'));
    let hero = expected.hero.to_lowercase();
    let diffs = compare(&mut hands, &expected, |h| h.players.iter().position(|p| p.name.to_lowercase().contains(&hero)));
    assert!(diffs.is_empty(), "Unibet expected vs actual mismatch:\n{}", diffs.join("\n"));
}

#[test]
fn betclic_ev_matches_expected_figures() {
    let expected = parse_expected(&sample_dir("Betclic").join("excepted_result.txt"));
    let mut hands = parse_room(&BetclicParser, "Betclic", |n| n != "excepted_result.txt");
    let hero = expected.hero.clone();
    let diffs = compare(&mut hands, &expected, |h| h.players.iter().position(|p| p.is_hero || p.name == hero));
    assert!(diffs.is_empty(), "Betclic expected vs actual mismatch:\n{}", diffs.join("\n"));
}
