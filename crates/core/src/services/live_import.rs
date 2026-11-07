//! Automatic import: handles a hand-history file while the room is still writing it.
//!
//! Each call re-reads the file, skips the hands already handled (counted, not located by byte
//! offset, so a rewritten file cannot corrupt the position) and keeps the last hand back until it is
//! complete. Importing is idempotent, so a hand seen twice is replaced, never duplicated.

use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::time::UNIX_EPOCH;

use super::importer::{detect_hero_name, read_text_file, sniff, split_hands, Importer, PipelineInput};
use super::summaries::{self, Summaries, SummaryKind};
use crate::parsers::get_parser;
use crate::repos::import_files::{self, ImportFileState};
use crate::repos::players;
use crate::{Error, Result};

/// Marker opening the summary section that ends every Winamax and Unibet hand.
const WINAMAX_SUMMARY_MARKER: &str = "*** summary ***";
const UNIBET_SUMMARY_MARKER: &str = "*** summary ***";

/// Why a file is being imported.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LiveMode {
    /// The file grew: handle the hands not seen yet, the last one only when it is complete.
    Resume,
    /// The tournament is over (its summary arrived): handle the whole file again, the last hand
    /// included, so every hand gets the position and the prize pool.
    Finish,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct LiveImport {
    pub imported: usize,
    pub skipped: usize,
    /// The last hand is still being written and was left for the next call.
    pub pending: bool,
    /// False for files this import does not handle (Betclic exports, unknown formats).
    pub supported: bool,
}

/// Whether the last block of a file holds a finished hand. The rule is the room's own: both
/// supported rooms close a hand with a summary section followed by an empty line.
fn hand_is_complete(room: &str, block: &str, strict: bool) -> bool {
    let marker = match room {
        "Winamax" => WINAMAX_SUMMARY_MARKER,
        "Unibet" => UNIBET_SUMMARY_MARKER,
        _ => return false,
    };
    let has_summary = block.to_lowercase().contains(marker);
    // The trailing empty line proves the room finished writing the summary lines.
    has_summary && (!strict || block.ends_with("\n\n"))
}

fn summary_kind(room: &str) -> Option<SummaryKind> {
    match room {
        "Winamax" => Some(SummaryKind::Winamax),
        "Unibet" => Some(SummaryKind::Unibet),
        _ => None,
    }
}

fn file_state(path: &Path) -> Result<(i64, i64)> {
    let meta = std::fs::metadata(path)?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as i64);
    Ok((meta.len() as i64, mtime))
}

/// Text files of a folder tree: the hand histories and the tournament summaries a room writes.
pub fn list_history_files(dir: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    collect_history_files(dir, &mut found);
    found
}

fn collect_history_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for path in entries.filter_map(|e| e.ok().map(|e| e.path())) {
        if path.is_dir() {
            collect_history_files(&path, out);
        } else if is_history_file(&path) {
            out.push(path);
        }
    }
}

/// A `.txt` file, the only kind the supported rooms write.
pub fn is_history_file(path: &Path) -> bool {
    path.extension().is_some_and(|e| e.eq_ignore_ascii_case("txt"))
}

fn is_summary_file(path: &Path) -> bool {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    summaries::summary_kind_of(&name).is_some()
}

impl Importer {
    /// True when the file changed since it was last handled (or was never handled).
    pub fn needs_live_import(&self, path: &Path) -> Result<bool> {
        let (size, mtime) = file_state(path)?;
        let conn = self.db.conn()?;
        Ok(import_files::get(&conn, &path.to_string_lossy())?.map_or(true, |s| (s.size, s.mtime) != (size, mtime)))
    }

    /// Handles a file the watcher reported: a summary finishes its tournament, anything else is a
    /// hand history that may have grown. `None` when a summary has no hand history (yet).
    pub fn import_path(&self, path: &Path, equity: bool) -> Result<Option<LiveImport>> {
        if !is_summary_file(path) {
            return self.import_live_with(path, LiveMode::Resume, equity).map(Some);
        }
        let Some(history) = summaries::hand_file_for_summary(path) else { return Ok(None) };
        let (size, mtime) = file_state(path)?;
        let result = self.import_live_with(&history, LiveMode::Finish, equity)?;
        // The summary is remembered like a history file, so the startup catch-up skips it.
        let conn = self.db.conn()?;
        import_files::upsert(&conn, &path.to_string_lossy(), ImportFileState { size, mtime, hands_done: 0 })?;
        Ok(Some(result))
    }

    /// The history files that still have hands imported without equity (see [`Importer::import_path`]).
    pub fn files_missing_equity(&self) -> Result<Vec<PathBuf>> {
        let conn = self.db.conn()?;
        Ok(import_files::equity_pending_paths(&conn)?.into_iter().map(PathBuf::from).collect())
    }

    /// Imports a file again from its first hand, with equity: what the automatic import left
    /// without while a table was open.
    pub fn reimport_path(&self, path: &Path) -> Result<()> {
        if is_summary_file(path) {
            self.import_path(path, true)?;
        } else {
            self.import_live_with(path, LiveMode::Finish, true)?;
        }
        Ok(())
    }

    /// Imports what `path` holds beyond what was already handled. See [`LiveMode`].
    pub fn import_live(&self, path: &Path, mode: LiveMode) -> Result<LiveImport> {
        self.import_live_with(path, mode, true)
    }

    /// Like [`Importer::import_live`]; with `equity` off the hands get no all-in equity (see
    /// `PipelineInput::equity`), and importing the file again later completes them.
    pub fn import_live_with(&self, path: &Path, mode: LiveMode, equity: bool) -> Result<LiveImport> {
        if !path.is_file() {
            return Err(Error::Message(format!("File not found: {}", path.display())));
        }
        // Read the state before the text: a write landing in between leaves a newer file than the
        // stored state, so the next call picks it up.
        let (size, mtime) = file_state(path)?;
        let text = read_text_file(path)?;
        let key = path.to_string_lossy().into_owned();

        let mut conn = self.db.conn()?;
        let Some(parser) = get_parser(&sniff(&text)).filter(|p| summary_kind(p.room_name()).is_some()) else {
            import_files::upsert(&conn, &key, ImportFileState { size, mtime, hands_done: 0 })?;
            return Ok(LiveImport::default());
        };
        let room = parser.room_name();

        let mut blocks = split_hands(&text, parser.hand_separator_for(&text));
        let pending = match blocks.last() {
            Some(last) if !hand_is_complete(room, last, mode == LiveMode::Resume) => {
                blocks.pop();
                true
            }
            _ => false,
        };

        let already_done = match mode {
            LiveMode::Finish => 0,
            LiveMode::Resume => import_files::get(&conn, &key)?.map_or(0, |s| s.hands_done),
        };
        // A shorter file than before was rewritten: start over.
        let start = if already_done > blocks.len() { 0 } else { already_done };

        let mut result = LiveImport { pending, supported: true, ..LiveImport::default() };
        if start < blocks.len() {
            let summaries = match (summary_kind(room), file_tournament_id(path, room)) {
                (Some(kind), Some(id)) => summaries::load_for_tournament(path, kind, &id),
                (Some(kind), None) => summaries::load_for_file(path, kind),
                _ => Summaries::new(),
            };
            let detected_hero = (room == "Unibet").then(|| detect_hero_name(&text)).flatten();
            let cancel = AtomicBool::new(false);
            let input = PipelineInput { parser, summaries: &summaries, detected_hero: detected_hero.as_deref(), cancel: &cancel, equity };
            let run = self.run_pipeline(&mut conn, input, &blocks[start..], &mut |_| {});
            if let Some(e) = run.write_error {
                return Err(e);
            }
            if run.imported > 0 {
                let names: Vec<String> = run.touched_players.into_iter().collect();
                players::update_stats_for_players(&conn, &names)?;
            }
            result.imported = run.imported;
            result.skipped = run.skipped;
        }

        import_files::upsert(&conn, &key, ImportFileState { size, mtime, hands_done: blocks.len() })?;
        // Hands imported without equity stay flagged until the whole file is imported again with it.
        let pending_equity = if equity && mode == LiveMode::Finish {
            false
        } else {
            (!equity && result.imported > 0) || import_files::is_equity_pending(&conn, &key)?
        };
        import_files::set_equity_pending(&conn, &key, pending_equity)?;
        Ok(result)
    }
}

fn file_tournament_id(path: &Path, room: &str) -> Option<String> {
    let name = path.file_name()?.to_string_lossy().into_owned();
    summaries::tournament_id_from_file_name(&name, summary_kind(room)?)
}
