//! Tournament summary files that sit next to Winamax and Unibet hand histories.
//!
//! The hand histories do not carry the final position or the prize pool of a tournament; the
//! summary file does. They are matched to hands by tournament id.

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use crate::models::ParsedHand;
use crate::parsers::regex;

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct TournamentSummary {
    /// Final position of the hero (0 when unknown).
    pub position: i32,
    pub prize_pool: f64,
    pub buy_in: f64,
}

pub type Summaries = HashMap<String, TournamentSummary>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SummaryKind {
    Winamax,
    Unibet,
}

impl SummaryKind {
    fn matches_file_name(self, name: &str) -> bool {
        let lower = name.to_lowercase();
        match self {
            SummaryKind::Winamax => lower.ends_with("_summary.txt"),
            SummaryKind::Unibet => lower.starts_with("ts") && lower.ends_with(".txt"),
        }
    }

    fn parse(self, text: &str) -> Option<(String, TournamentSummary)> {
        match self {
            SummaryKind::Winamax => parse_winamax(text),
            SummaryKind::Unibet => parse_unibet(text),
        }
    }
}

fn number(raw: &str) -> f64 {
    raw.replace(',', ".").parse().unwrap_or(0.0)
}

fn position(text: &str, pattern: &regex::Regex) -> i32 {
    pattern.captures(text).and_then(|c| c["pos"].parse().ok()).unwrap_or(0)
}

pub fn parse_winamax(text: &str) -> Option<(String, TournamentSummary)> {
    let id = regex!(r"(?i)Tournament summary\s*:\s*.*\((?<id>\d+)\)").captures(text)?["id"].trim().to_string();
    if id.is_empty() {
        return None;
    }
    let prize_pool = regex!(r"(?i)Prizepool\s*:\s*(?<value>\d+(?:[.,]\d+)?)")
        .captures(text)
        .map_or(0.0, |c| number(&c["value"]));
    // Buy-in and fee are summed: the hand history only shows them separately.
    let buy_in = regex!(r"(?i)Buy-In\s*:\s*(?<buy>\d+(?:[.,]\d+)?)\D+\+\s*(?<fee>\d+(?:[.,]\d+)?)")
        .captures(text)
        .map_or(0.0, |c| number(&c["buy"]) + number(&c["fee"]));
    let pos = position(text, regex!(r"(?i)You finished in\s*(?<pos>\d+)(?:st|nd|rd|th)\s*place"));
    Some((id, TournamentSummary { position: pos, prize_pool, buy_in }))
}

pub fn parse_unibet(text: &str) -> Option<(String, TournamentSummary)> {
    let id = regex!(r"(?i)Unibet Tournament #(?<id>\d+)").captures(text)?["id"].trim().to_string();
    if id.is_empty() {
        return None;
    }
    let prize_pool = regex!(r"(?i)Total Prize Pool: €(?<value>\d+(?:[.,]\d+)?)")
        .captures(text)
        .map_or(0.0, |c| number(&c["value"]));
    // Only the buy-in is kept (the fee is not part of it for Unibet).
    let buy_in = regex!(r"(?i)Buy-In: €(?<buy>\d+(?:[.,]\d+)?)\s*\+\s*€(?<fee>\d+(?:[.,]\d+)?)")
        .captures(text)
        .map_or(0.0, |c| number(&c["buy"]).max(0.0));
    let pos = position(text, regex!(r"(?i)You finished in (?<pos>\d+)(?:st|nd|rd|th) place"));
    Some((id, TournamentSummary { position: pos, prize_pool, buy_in }))
}

/// Reads every summary file of the folder holding `imported_file`. Unreadable files are skipped.
pub fn load_for_file(imported_file: &Path, kind: SummaryKind) -> Summaries {
    let mut map = Summaries::new();
    let Some(dir) = imported_file.parent().filter(|d| d.is_dir()) else { return map };
    let Ok(entries) = fs::read_dir(dir) else {
        log::warn!("unable to list {} for tournament summaries", dir.display());
        return map;
    };

    for path in entries.filter_map(|e| e.ok().map(|e| e.path())).filter(|p| p.is_file()) {
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        if !kind.matches_file_name(&name) {
            continue;
        }
        match fs::read(&path) {
            Ok(bytes) => {
                if let Some((id, summary)) = kind.parse(&String::from_utf8_lossy(&bytes)) {
                    map.insert(id, summary);
                }
            }
            Err(e) => log::debug!("failed to read summary {}: {e}", path.display()),
        }
    }
    map
}

/// Fills the hand's tournament fields from its summary. Nothing known is ever overwritten with
/// an empty value.
pub fn apply(hand: &mut ParsedHand, summaries: &Summaries) {
    let Some(summary) = hand.game_id.as_deref().filter(|id| !id.trim().is_empty()).and_then(|id| summaries.get(id)) else {
        return;
    };
    if summary.position > 0 {
        hand.position = summary.position;
    }
    if summary.prize_pool > 0.0 {
        hand.prize_pool = summary.prize_pool;
    }
    if summary.buy_in > 0.0 {
        hand.buy_in = summary.buy_in;
    }
    if hand.buy_in > 0.0 && hand.prize_pool > 0.0 {
        hand.multiplier = i32::max(1, (hand.prize_pool / hand.buy_in).round() as i32);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WINAMAX: &str = "Winamax Poker - Tournament summary : Expresso(1096047576)\nBuy-In : 0,93€ + 0,07€\nPrizepool : 3€\nYou finished in 2nd place";
    const UNIBET: &str = "Unibet Tournament #83498893, No Limit Holdem\nBuy-In: €9.30 + €0.70\nTotal Prize Pool: €30.00\nYou finished in 3rd place (eliminated at hand #1).";

    #[test]
    fn parses_a_winamax_summary() {
        let (id, s) = parse_winamax(WINAMAX).unwrap();
        assert_eq!(id, "1096047576");
        assert_eq!(s, TournamentSummary { position: 2, prize_pool: 3.0, buy_in: 1.0 });
    }

    #[test]
    fn parses_a_unibet_summary_keeping_only_the_buy_in() {
        let (id, s) = parse_unibet(UNIBET).unwrap();
        assert_eq!(id, "83498893");
        assert_eq!(s, TournamentSummary { position: 3, prize_pool: 30.0, buy_in: 9.3 });
    }

    #[test]
    fn text_without_a_tournament_id_is_rejected() {
        assert!(parse_winamax("Buy-In : 1€ + 0€").is_none());
        assert!(parse_unibet("nothing here").is_none());
    }

    #[test]
    fn summary_file_names() {
        assert!(SummaryKind::Winamax.matches_file_name("20260415_Expresso(1)_real_holdem_no-limit_SUMMARY.txt"));
        assert!(!SummaryKind::Winamax.matches_file_name("20260415_Expresso(1)_real_holdem_no-limit.txt"));
        assert!(SummaryKind::Unibet.matches_file_name("TS20260512 T83498893 No Limit Holdem €9.30 + €0.70.txt"));
        assert!(!SummaryKind::Unibet.matches_file_name("H20260512 T83498893 €10 Power Spin.txt"));
    }

    #[test]
    fn apply_fills_only_known_fields_and_derives_the_multiplier() {
        let mut summaries = Summaries::new();
        summaries.insert("g1".into(), TournamentSummary { position: 0, prize_pool: 30.0, buy_in: 10.0 });
        let mut hand = ParsedHand { game_id: Some("g1".into()), position: 2, ..ParsedHand::default() };
        apply(&mut hand, &summaries);
        assert_eq!((hand.position, hand.prize_pool, hand.buy_in, hand.multiplier), (2, 30.0, 10.0, 3));

        let mut other = ParsedHand { game_id: Some("g2".into()), ..ParsedHand::default() };
        apply(&mut other, &summaries);
        assert_eq!((other.prize_pool, other.multiplier), (0.0, 1));
    }
}
