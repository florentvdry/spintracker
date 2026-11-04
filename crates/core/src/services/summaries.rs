//! Tournament summary files that sit next to Winamax and Unibet hand histories.
//!
//! The hand histories do not carry the final position or the prize pool of a tournament; the
//! summary file does. They are matched to hands by tournament id.

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use crate::models::ParsedHand;
use crate::parsers::{entry_cost, regex};

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
        .map_or(0.0, |c| entry_cost(number(&c["buy"]), number(&c["fee"])));
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
    // Buy-in and fee are summed, like the other rooms: that is what the player paid.
    let buy_in = regex!(r"(?i)Buy-In: €(?<buy>\d+(?:[.,]\d+)?)\s*\+\s*€(?<fee>\d+(?:[.,]\d+)?)")
        .captures(text)
        .map_or(0.0, |c| entry_cost(number(&c["buy"]), number(&c["fee"])));
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

/// Which room's summary a file name denotes, if it is a summary file at all.
pub fn summary_kind_of(file_name: &str) -> Option<SummaryKind> {
    [SummaryKind::Winamax, SummaryKind::Unibet].into_iter().find(|k| k.matches_file_name(file_name))
}

/// Tournament id carried by a hand-history or summary file name of `kind`.
pub fn tournament_id_from_file_name(file_name: &str, kind: SummaryKind) -> Option<String> {
    let pattern = match kind {
        SummaryKind::Winamax => regex!(r"\((?<id>\d+)\)"),
        SummaryKind::Unibet => regex!(r"\sT(?<id>\d+)\s"),
    };
    pattern.captures(file_name).map(|c| c["id"].to_string())
}

fn file_name_of(path: &Path) -> String {
    path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

/// Reads only the summary of one tournament, found next to `imported_file`: what the automatic
/// import needs after each hand, instead of parsing every summary of the folder.
pub fn load_for_tournament(imported_file: &Path, kind: SummaryKind, tournament_id: &str) -> Summaries {
    let mut map = Summaries::new();
    let Some(dir) = imported_file.parent().filter(|d| d.is_dir()) else { return map };
    let Ok(entries) = fs::read_dir(dir) else { return map };
    for path in entries.filter_map(|e| e.ok().map(|e| e.path())).filter(|p| p.is_file()) {
        let name = file_name_of(&path);
        if !kind.matches_file_name(&name) || tournament_id_from_file_name(&name, kind).as_deref() != Some(tournament_id) {
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

/// The hand-history file a summary file completes (same folder, same tournament id).
pub fn hand_file_for_summary(summary_file: &Path) -> Option<std::path::PathBuf> {
    let name = file_name_of(summary_file);
    let kind = summary_kind_of(&name)?;
    let id = tournament_id_from_file_name(&name, kind)?;
    let dir = summary_file.parent()?;
    fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_file())
        .find(|p| {
            let n = file_name_of(p);
            n.to_lowercase().ends_with(".txt")
                && !kind.matches_file_name(&n)
                && tournament_id_from_file_name(&n, kind).as_deref() == Some(id.as_str())
        })
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
    fn parses_a_unibet_summary_summing_buy_in_and_fee() {
        let (id, s) = parse_unibet(UNIBET).unwrap();
        assert_eq!(id, "83498893");
        assert_eq!(s, TournamentSummary { position: 3, prize_pool: 30.0, buy_in: 10.0 });
    }

    #[test]
    fn a_big_multiplier_is_derived_from_the_full_entry_cost() {
        let mut summaries = Summaries::new();
        summaries.insert("g1".into(), TournamentSummary { position: 1, prize_pool: 100.0, buy_in: 10.0 });
        let mut hand = ParsedHand { game_id: Some("g1".into()), buy_in: 10.0, ..ParsedHand::default() };
        apply(&mut hand, &summaries);
        assert_eq!(hand.multiplier, 10);
    }

    #[test]
    fn text_without_a_tournament_id_is_rejected() {
        assert!(parse_winamax("Buy-In : 1€ + 0€").is_none());
        assert!(parse_unibet("nothing here").is_none());
    }

    #[test]
    fn tournament_ids_come_from_file_names() {
        let w = "20260415_Expresso(1096047576)_real_holdem_no-limit_summary.txt";
        assert_eq!(tournament_id_from_file_name(w, SummaryKind::Winamax).as_deref(), Some("1096047576"));
        let u = "TS20260512 T83498893 No Limit Holdem €9.30 + €0.70.txt";
        assert_eq!(tournament_id_from_file_name(u, SummaryKind::Unibet).as_deref(), Some("83498893"));
        assert_eq!(tournament_id_from_file_name("notes.txt", SummaryKind::Winamax), None);
        assert_eq!(summary_kind_of(w), Some(SummaryKind::Winamax));
        assert_eq!(summary_kind_of("20260415_Expresso(1)_real_holdem_no-limit.txt"), None);
    }

    #[test]
    fn only_the_requested_tournament_summary_is_loaded() {
        let dir = tempfile::tempdir().unwrap();
        let history = dir.path().join("20260415_Expresso(1096047576)_real_holdem_no-limit.txt");
        std::fs::write(&history, "hands").unwrap();
        let summary = dir.path().join("20260415_Expresso(1096047576)_real_holdem_no-limit_summary.txt");
        std::fs::write(&summary, WINAMAX).unwrap();
        let other = WINAMAX.replace("1096047576", "1096047999");
        std::fs::write(dir.path().join("20260415_Expresso(1096047999)_real_holdem_no-limit_summary.txt"), other).unwrap();

        let loaded = load_for_tournament(&history, SummaryKind::Winamax, "1096047576");
        assert_eq!(loaded.keys().collect::<Vec<_>>(), ["1096047576"]);
        assert_eq!(hand_file_for_summary(&summary), Some(history));
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
