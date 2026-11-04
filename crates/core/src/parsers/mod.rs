//! Per-room hand-history parsers.
//!
//! Each room has its own module; shared helpers live here. The parsers are faithful ports of
//! the former C# ones: they build the legacy `ParsedHand` (per-street action text, per-player
//! investment and profit) that the importer and the repositories still rely on.
use crate::models::{ParseResult, ParsedHand};

pub mod betclic;
pub mod unibet;
pub mod winamax;

pub use betclic::BetclicParser;
pub use unibet::UnibetParser;
pub use winamax::WinamaxParser;

pub trait HandParser: Sync {
    fn room_name(&self) -> &'static str;
    fn parser_version(&self) -> u32;
    fn hand_separator(&self) -> &'static str;
    fn detect_format(&self, content: &str) -> bool;
    fn parse_file(&self, content: &str) -> ParseResult;
    fn parse_hand(&self, hand_text: &str) -> Option<ParsedHand>;
}

/// Returns the first parser that recognises `content` (Betclic, then Winamax, then Unibet).
pub fn get_parser(content: &str) -> Option<&'static dyn HandParser> {
    all_parsers().iter().copied().find(|p| p.detect_format(content))
}

pub fn get_parser_by_room(room: &str) -> Option<&'static dyn HandParser> {
    all_parsers().iter().copied().find(|p| p.room_name().eq_ignore_ascii_case(room))
}

fn all_parsers() -> &'static [&'static dyn HandParser] {
    static PARSERS: [&dyn HandParser; 3] = [&BetclicParser, &WinamaxParser, &UnibetParser];
    &PARSERS
}

/// Compiles a regex once per call site.
macro_rules! regex {
    ($pattern:expr) => {{
        static RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
        RE.get_or_init(|| regex::Regex::new($pattern).expect("valid regex"))
    }};
}
pub(crate) use regex;

/// Trimmed, non-blank lines.
pub(crate) fn clean_lines(text: &str) -> Vec<String> {
    text.split('\n')
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect()
}



pub(crate) fn parse_f64(s: &str) -> f64 {
    s.parse().unwrap_or(0.0)
}

pub(crate) fn parse_i32(s: &str) -> i32 {
    s.parse().unwrap_or(0)
}

/// `"HH:MM:SS"`-less split used by every parser: text after the first `separator` of `line`.
pub(crate) fn after_first<'a>(line: &'a str, separator: char) -> &'a str {
    line.split_once(separator).map(|(_, rest)| rest).unwrap_or("").trim()
}

/// Splits `content` at each occurrence of `marker`, keeping the marker at the start of every
/// block (a zero-width split). Text before the first marker is dropped.
pub(crate) fn split_before_marker<'a>(content: &'a str, marker: &str) -> Vec<&'a str> {
    let starts: Vec<usize> = content.match_indices(marker).map(|(i, _)| i).collect();
    starts
        .iter()
        .enumerate()
        .map(|(n, &start)| {
            let end = starts.get(n + 1).copied().unwrap_or(content.len());
            content[start..end].trim()
        })
        .filter(|block| !block.is_empty())
        .collect()
}

/// Joins action lines the way the legacy text columns store them.
pub(crate) fn join_lines(lines: &[String]) -> String {
    lines.join("\n")
}
