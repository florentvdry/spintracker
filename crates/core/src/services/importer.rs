//! Importing a hand-history file into the active database.
//!
//! The file is split into hands, which are parsed and analysed in parallel; a single writer
//! stores them in batches. Importing the same file again replaces the hands instead of
//! duplicating them.

use std::collections::HashSet;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::sync_channel;
use std::sync::Arc;
use std::time::{Duration, Instant};

use rayon::prelude::*;
use rusqlite::Connection;

use super::summaries::{self, SummaryKind, Summaries};
use crate::db::Database;
use crate::engines::analytics::AnalyticsCalculator;
use crate::models::{HandAnalytics, ImportProgress, ParsedHand};
use crate::parsers::{get_parser, regex, HandParser};
use crate::repos::hands::{self, ImportedHand};
use crate::repos::players;
use crate::stats::store::{self, HandFlagInput, PlayerFacts, SeatInput};
use crate::{Error, Result};

/// Hands per transaction.
const BATCH_SIZE: usize = 500;
/// Parsed hands waiting for the writer; bounds memory when the disk is slower than the parsers.
const QUEUE_CAPACITY: usize = 5000;
/// Hands parsed in parallel before being handed to the writer in order.
const ORDERED_CHUNK: usize = 2000;
/// Minimum delay between two progress reports.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(200);
/// Characters of the file used to recognise the room.
const SNIFF_CHARS: usize = 4096;
/// The EV is only computed for heads-up and three-handed hands.
const MAX_PLAYERS_FOR_EV: i32 = 3;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ImportSummary {
    pub imported: usize,
    pub skipped: usize,
    pub total_found: usize,
    pub cancelled: bool,
}

/// What the parsing threads need besides the blocks themselves.
pub(super) struct PipelineInput<'a> {
    pub parser: &'static dyn HandParser,
    pub summaries: &'a Summaries,
    pub detected_hero: Option<&'a str>,
    /// Whether all-in equity may be computed. It is not while the user sits at a poker table: the
    /// hands then get their plain result and are completed once the tables are closed.
    pub equity: bool,
    pub cancel: &'a AtomicBool,
}

/// What a run of [`Importer::run_pipeline`] did.
pub(super) struct PipelineRun {
    pub imported: usize,
    pub skipped: usize,
    /// Every player seen in the stored hands, for a partial recount of the player totals.
    pub touched_players: HashSet<String>,
    pub write_error: Option<Error>,
}

pub struct Importer {
    pub(super) db: Arc<Database>,
    analytics: Arc<AnalyticsCalculator>,
}

impl Importer {
    pub fn new(db: Arc<Database>, analytics: Arc<AnalyticsCalculator>) -> Self {
        Self { db, analytics }
    }

    /// Number of hands in a file; 0 when it is missing or of an unknown format.
    pub fn count_hands(&self, path: &Path) -> Result<usize> {
        if !path.is_file() {
            return Ok(0);
        }
        let text = read_text_file(path)?;
        let Some(parser) = get_parser(&sniff(&text)) else { return Ok(0) };
        // The same split the import uses, so the count always equals what an import will find
        // (counting separator lines alone is one short for Betclic, whose files open without one).
        Ok(split_hands(&text, parser.hand_separator()).len())
    }

    /// Imports `path`, reporting progress through `on_progress` (at most every 200 ms, and a
    /// final report with `success` set). `cancel` stops the import early: what was already
    /// written stays.
    pub fn import_file(
        &self,
        path: &Path,
        cancel: &AtomicBool,
        mut on_progress: impl FnMut(ImportProgress),
    ) -> Result<ImportSummary> {
        if !path.is_file() {
            return Err(Error::Message(format!("File not found: {}", path.display())));
        }
        on_progress(ImportProgress { message: "Initializing pipeline...".into(), ..ImportProgress::default() });

        let text = read_text_file(path)?;
        let parser = get_parser(&sniff(&text))
            .ok_or_else(|| Error::Message("Could not detect hand history format".into()))?;
        log::info!("[import] {} ({} bytes), format {}", path.display(), text.len(), parser.room_name());

        let mut conn = self.db.conn()?;
        let summaries = match parser.room_name() {
            "Winamax" => {
                let cleaned = hands::cleanup_corrupted_winamax_hands(&mut conn)?;
                if cleaned > 0 {
                    log::info!("[import] cleaned {cleaned} stale Winamax rows before import");
                }
                summaries::load_for_file(path, SummaryKind::Winamax)
            }
            "Unibet" => summaries::load_for_file(path, SummaryKind::Unibet),
            _ => Summaries::new(),
        };
        // Unibet files never say which player is the hero: it is whoever is dealt cards most often.
        let detected_hero = (parser.room_name() == "Unibet").then(|| detect_hero_name(&text)).flatten();

        let blocks = split_hands(&text, parser.hand_separator());
        let run = self.run_pipeline(
            &mut conn,
            PipelineInput { parser, summaries: &summaries, detected_hero: detected_hero.as_deref(), cancel, equity: true },
            &blocks,
            &mut on_progress,
        );
        let (imported, skipped, write_error) = (run.imported, run.skipped, run.write_error);
        let total = blocks.len();

        if let Some(e) = write_error {
            on_progress(ImportProgress { message: "Import failed".into(), error: Some(e.to_string()), ..ImportProgress::default() });
            return Err(e);
        }

        if imported > 0 {
            players::update_player_stats(&conn)?;
        }

        let summary = ImportSummary {
            imported,
            skipped,
            total_found: total,
            cancelled: cancel.load(Ordering::Relaxed),
        };
        let stats = self.analytics.equity_cache().stats();
        log::info!(
            "[import] {} hands imported, {} skipped; equity cache {} hits, {} misses, {} entries",
            summary.imported, summary.skipped, stats.hits, stats.misses, stats.size
        );
        on_progress(ImportProgress {
            message: if summary.cancelled { "Import cancelled" } else { "Import completed successfully" }.into(),
            percent: 100,
            hands_imported: summary.imported,
            hands_skipped: summary.skipped,
            total_hands: summary.imported + summary.skipped,
            success: true,
            error: None,
        });
        Ok(summary)
    }

    /// Parses `blocks` in parallel and stores them through a single writer. Shared by the manual
    /// import and the automatic one. Progress is reported only while hands are being written.
    pub(super) fn run_pipeline(
        &self,
        conn: &mut Connection,
        input: PipelineInput<'_>,
        blocks: &[String],
        on_progress: &mut impl FnMut(ImportProgress),
    ) -> PipelineRun {
        let PipelineInput { parser, summaries, detected_hero, cancel, equity } = input;
        let total = blocks.len();
        let skipped = AtomicUsize::new(0);
        let abort = AtomicBool::new(false);
        let mut imported = 0usize;
        let mut write_error: Option<Error> = None;
        let mut touched_players = HashSet::new();
        let mut last_report = Instant::now();

        std::thread::scope(|scope| {
            let (tx, rx) = sync_channel::<ImportedHand>(QUEUE_CAPACITY);
            let (skipped, abort) = (&skipped, &abort);

            scope.spawn(move || {
                // Chunks are parsed in parallel but sent in file order, so rows are stored in the
                // order of the file (ties in sorted queries then stay stable between imports).
                for chunk in blocks.chunks(ORDERED_CHUNK) {
                    if abort.load(Ordering::Relaxed) || cancel.load(Ordering::Relaxed) {
                        return;
                    }
                    let processed: Vec<Option<ImportedHand>> =
                        chunk.par_iter().map(|block| self.process_block(parser, block, summaries, detected_hero, equity)).collect();
                    for item in processed {
                        match item {
                            Some(item) => {
                                if tx.send(item).is_err() {
                                    return;
                                }
                            }
                            None => {
                                skipped.fetch_add(1, Ordering::Relaxed);
                            }
                        }
                    }
                }
            });

            let mut batch = Vec::with_capacity(BATCH_SIZE);
            let mut flush = |batch: &mut Vec<ImportedHand>| -> Result<usize> {
                touched_players.extend(batch.iter().flat_map(|item| item.hand.players.iter().map(|p| p.name.clone())));
                let written = hands::insert_batch(conn, batch)?;
                batch.clear();
                Ok(written)
            };

            for item in rx {
                batch.push(item);
                if batch.len() < BATCH_SIZE {
                    continue;
                }
                match flush(&mut batch) {
                    Ok(written) => imported += written,
                    Err(e) => {
                        write_error = Some(e);
                        abort.store(true, Ordering::Relaxed);
                        break;
                    }
                }
                if last_report.elapsed() >= PROGRESS_INTERVAL {
                    let done = imported + skipped.load(Ordering::Relaxed);
                    on_progress(ImportProgress {
                        message: format!("Imported {imported} hands..."),
                        percent: (done * 100 / total.max(1)).min(99) as i32,
                        hands_imported: imported,
                        hands_skipped: skipped.load(Ordering::Relaxed),
                        total_hands: total,
                        ..ImportProgress::default()
                    });
                    last_report = Instant::now();
                }
            }
            if write_error.is_none() && !batch.is_empty() {
                match flush(&mut batch) {
                    Ok(written) => imported += written,
                    Err(e) => write_error = Some(e),
                }
            }
            // Leaving the loop early drops `rx`; the producers then stop on `abort`.
        });

        if imported > 0 || write_error.is_some() {
            self.db.bump_players(&touched_players);
        }
        PipelineRun { imported, skipped: skipped.load(Ordering::Relaxed), touched_players, write_error }
    }

    /// Stores hands that were parsed elsewhere (the hero is the player marked as such), with their
    /// analytics and stat flags. Returns `(written, received)`.
    pub fn insert_parsed_hands(&self, hands: Vec<ParsedHand>) -> Result<(usize, usize)> {
        let received = hands.len();
        let items: Vec<ImportedHand> = hands
            .into_iter()
            .map(|hand| {
                let analytics = self.analytics.calculate_hand_analytics(&hand);
                let flags = flags_of(&hand);
                ImportedHand { hand, analytics, flags }
            })
            .collect();
        let mut conn = self.db.conn()?;
        let written = hands::insert_batch(&mut conn, &items)?;
        players::update_player_stats(&conn)?;
        self.db.bump_data_version();
        Ok((written, received))
    }

    /// Parses one hand and computes everything stored with it. `None` when the text holds no hand.
    fn process_block(
        &self,
        parser: &dyn HandParser,
        block: &str,
        summaries: &Summaries,
        detected_hero: Option<&str>,
        equity: bool,
    ) -> Option<ImportedHand> {
        // A parser bug on one hand must not take the whole import down.
        let mut hand = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| parser.parse_hand(block))) {
            Ok(hand) => hand?,
            Err(_) => {
                log::warn!("[import] a hand made the {} parser panic; skipped", parser.room_name());
                return None;
            }
        };
        summaries::apply(&mut hand, summaries);
        select_hero(&mut hand, detected_hero);

        let analytics = if equity && needs_analytics(&hand) {
            self.analytics.calculate_hand_analytics(&hand)
        } else {
            plain_analytics(&hand)
        };

        let flags = flags_of(&hand);
        Some(ImportedHand { hand, analytics, flags })
    }
}

/// Stat flags of every player of a parsed hand.
fn flags_of(hand: &ParsedHand) -> Vec<(String, PlayerFacts)> {
    let seats: Vec<SeatInput> = hand
        .players
        .iter()
        .map(|p| SeatInput { name: p.name.clone(), position: p.position.clone(), went_to_showdown: p.went_to_showdown, net_profit: p.net_profit })
        .collect();
    store::flags_for_hand(&HandFlagInput {
        preflop_action: &hand.preflop_action,
        flop_action: &hand.flop_action,
        turn_action: &hand.turn_action,
        river_action: &hand.river_action,
        flop_cards: hand.flop.as_deref().unwrap_or(""),
        blinds: hand.blinds.as_deref().unwrap_or(""),
        player_count: hand.player_count,
        players: &seats,
    })
}

/// The hero is, in order: the player the parser marked, the player detected for the whole file,
/// or the first player whose cards are known. Exactly one player is left marked.
fn select_hero(hand: &mut ParsedHand, detected_hero: Option<&str>) {
    let mut hero = hand.players.iter().position(|p| p.is_hero);
    if hero.is_none() {
        hero = detected_hero.and_then(|name| hand.players.iter().position(|p| p.name == name));
    }
    let hero = hero.or_else(|| hand.players.iter().position(|p| !p.cards.is_empty()));
    if let Some(i) = hero {
        for p in &mut hand.players {
            p.is_hero = false;
        }
        hand.players[i].is_hero = true;
    }
}

/// All-in EV only matters for short-handed showdowns where chips went in with known hole cards.
fn needs_analytics(hand: &ParsedHand) -> bool {
    let Some(hero) = hand.players.iter().find(|p| p.is_hero) else { return false };
    hand.went_to_showdown
        && hand.player_count <= MAX_PLAYERS_FOR_EV
        && !hero.cards.is_empty()
        && (hero.is_all_in || hand.players.iter().any(|p| !p.is_hero && p.is_all_in))
}

/// Analytics of a hand with no EV adjustment: the actual result.
fn plain_analytics(hand: &ParsedHand) -> HandAnalytics {
    let mut analytics = HandAnalytics { hand_id: hand.id.clone(), ..HandAnalytics::default() };
    if let Some(hero) = hand.players.iter().find(|p| p.is_hero) {
        analytics.net_won_adjusted = Some(hero.net_profit);
        analytics.chips_won_showdown = Some(if hero.went_to_showdown { hero.net_profit } else { 0.0 });
        analytics.chips_won_no_showdown = Some(if hero.went_to_showdown { 0.0 } else { hero.net_profit });
    }
    analytics
}

/// The player dealt cards most often in the file (the first one met wins ties).
pub(super) fn detect_hero_name(text: &str) -> Option<String> {
    let dealt = regex!(r"Dealt to\s+(.+?)\s+\[");
    let mut counts: Vec<(String, usize)> = Vec::new();
    for line in text.lines() {
        if let Some(c) = dealt.captures(line) {
            let name = c[1].trim();
            match counts.iter_mut().find(|(n, _)| n == name) {
                Some((_, n)) => *n += 1,
                None => counts.push((name.to_string(), 1)),
            }
        }
    }
    let mut best: Option<&(String, usize)> = None;
    for entry in &counts {
        if best.map_or(true, |b| entry.1 > b.1) {
            best = Some(entry);
        }
    }
    best.map(|(name, _)| name.clone())
}

pub(super) fn sniff(text: &str) -> String {
    text.chars().take(SNIFF_CHARS).collect()
}

/// A line starting a hand: it equals or begins with the room's separator.
fn is_hand_boundary(line: &str, separator: &str) -> bool {
    let trimmed = line.trim();
    !trimmed.is_empty() && !separator.trim().is_empty() && trimmed.starts_with(separator)
}

/// Splits a file into hand blocks. The boundary line stays at the top of the block it opens (the
/// Winamax and Unibet headers are that line). Blocks holding nothing but the separator are dropped.
pub(super) fn split_hands(text: &str, separator: &str) -> Vec<String> {
    let mut blocks = Vec::new();
    let mut current = String::new();
    for raw in text.split('\n') {
        let line = raw.trim_end_matches('\r');
        if is_hand_boundary(line, separator) && !current.is_empty() {
            blocks.push(std::mem::take(&mut current));
        }
        current.push_str(line);
        current.push('\n');
    }
    if !current.is_empty() {
        blocks.push(current);
    }
    blocks.retain(|b| {
        let t = b.trim();
        !t.is_empty() && t != separator.trim()
    });
    blocks
}

/// Reads a text file, honouring a UTF-8 or UTF-16 byte-order mark; invalid bytes are replaced.
pub(super) fn read_text_file(path: &Path) -> Result<String> {
    let bytes = std::fs::read(path)?;
    let utf16 = |rest: &[u8], big_endian: bool| -> String {
        let units: Vec<u16> = rest
            .chunks_exact(2)
            .map(|b| if big_endian { u16::from_be_bytes([b[0], b[1]]) } else { u16::from_le_bytes([b[0], b[1]]) })
            .collect();
        String::from_utf16_lossy(&units)
    };
    Ok(match bytes.as_slice() {
        [0xFF, 0xFE, rest @ ..] => utf16(rest, false),
        [0xFE, 0xFF, rest @ ..] => utf16(rest, true),
        [0xEF, 0xBB, 0xBF, rest @ ..] => String::from_utf8_lossy(rest).into_owned(),
        other => String::from_utf8_lossy(other).into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splitting_keeps_each_boundary_line_with_its_hand() {
        let text = "Winamax Poker - Tournament A\nline 1\n\nWinamax Poker - Tournament B\nline 2\n";
        let blocks = split_hands(text, "Winamax Poker - Tournament");
        assert_eq!(blocks.len(), 2);
        assert!(blocks[0].starts_with("Winamax Poker - Tournament A") && blocks[0].contains("line 1"));
        assert!(blocks[1].starts_with("Winamax Poker - Tournament B"));
    }

    #[test]
    fn a_lone_separator_is_not_a_hand() {
        let text = "------------\n*** HEADER ***\nx\n------------\n";
        assert_eq!(split_hands(text, "------------").len(), 1);
        assert_eq!(split_hands("", "------------").len(), 0);
    }

    #[test]
    fn windows_line_endings_are_normalised() {
        let blocks = split_hands("Unibet Hand #1\r\nbody\r\nUnibet Hand #2\r\nbody\r\n", "Unibet Hand #");
        assert_eq!(blocks.len(), 2);
        assert!(!blocks[0].contains('\r'));
    }

    #[test]
    fn the_hero_is_the_most_frequently_dealt_player() {
        let text = "Dealt to Bob [As Ks]\nDealt to Ann [2c 3c]\nDealt to Ann [4c 5c]\nDealt to Bob [6c 7c]\n";
        assert_eq!(detect_hero_name(text).as_deref(), Some("Bob"), "the first player met wins ties");
        assert_eq!(detect_hero_name("nothing"), None);
    }

    #[test]
    fn hero_selection_order() {
        let mut hand = ParsedHand::default();
        for (name, cards, hero) in [("a", "", false), ("b", "As Ks", false), ("c", "2c 3c", false)] {
            hand.players.push(crate::models::PlayerInfo { name: name.into(), cards: cards.into(), is_hero: hero, ..Default::default() });
        }
        select_hero(&mut hand, Some("c"));
        assert_eq!(hand.players.iter().filter(|p| p.is_hero).map(|p| p.name.as_str()).collect::<Vec<_>>(), ["c"]);

        let mut hand2 = hand.clone();
        for p in &mut hand2.players {
            p.is_hero = false;
        }
        select_hero(&mut hand2, None);
        assert!(hand2.players[1].is_hero, "first player with known cards");
    }

    #[test]
    fn utf16_files_are_decoded() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("u16.txt");
        let mut bytes = vec![0xFF, 0xFE];
        bytes.extend("Unibet Hand #1 €".encode_utf16().flat_map(|u| u.to_le_bytes()));
        std::fs::write(&path, bytes).unwrap();
        assert_eq!(read_text_file(&path).unwrap(), "Unibet Hand #1 €");
    }
}
