//! Structured betting actions, parsed once from a street's action text.
//!
//! Every room's parser stores a street as plain lines ("Bob raises 30 to 60 and is all-in").
//! `parse_actions` is the single place that turns those lines into `Action`s; the stat flags
//! and the analysis code work on the result instead of re-reading text.

use crate::parsers::regex;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActionKind {
    Post,
    Call,
    Bet,
    Raise,
    Fold,
    Check,
}

impl ActionKind {
    /// Bets and raises.
    pub fn is_aggressive(self) -> bool {
        matches!(self, ActionKind::Bet | ActionKind::Raise)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Action {
    pub player: String,
    pub kind: ActionKind,
    pub is_all_in: bool,
    /// First amount found after the verb ("calls 580" -> 580, "raises 30 to 60" -> 30).
    pub amount: Option<f64>,
    /// Total a raise goes to; falls back to `amount` when the line has no "to <n>".
    pub amount_to: Option<f64>,
}

/// Parses the action lines of one street. Lines that are not actions (deals, shows,
/// collected chips...) are skipped.
pub fn parse_actions(text: &str) -> Vec<Action> {
    let line_re = regex!(
        r"(?i)^(?:[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\s*-\s*)?(?<name>[^:\n]+?)\s*:?\s+(?<act>posts|calls|bets|raises|folds|checks)\b(?<tail>.*)$"
    );

    text.split('\n')
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .filter_map(|raw| {
            let m = line_re.captures(raw)?;
            let kind = match m["act"].to_ascii_lowercase().as_str() {
                "posts" => ActionKind::Post,
                "calls" => ActionKind::Call,
                "bets" => ActionKind::Bet,
                "raises" => ActionKind::Raise,
                "folds" => ActionKind::Fold,
                _ => ActionKind::Check,
            };
            let tail = &m["tail"];
            let amount = first_amount(tail);
            let amount_to = regex!(r"(?i)\bto\s+(\d+(?:[.,]\d+)?)")
                .captures(tail)
                .and_then(|c| parse_amount(&c[1]))
                .or(amount);
            Some(Action {
                player: m["name"].trim().to_string(),
                kind,
                is_all_in: raw.to_ascii_lowercase().contains("all-in"),
                amount,
                amount_to,
            })
        })
        .collect()
}

fn parse_amount(raw: &str) -> Option<f64> {
    raw.replace(',', ".").parse().ok()
}

/// First number not glued to a word character or a dot, like the former `(?<![\w.])\d+(?:[.,]\d+)?`.
fn first_amount(tail: &str) -> Option<f64> {
    regex!(r"\d+(?:[.,]\d+)?")
        .find_iter(tail)
        .find(|m| {
            tail[..m.start()]
                .chars()
                .next_back()
                .map_or(true, |prev| !(prev.is_alphanumeric() || prev == '_' || prev == '.'))
        })
        .and_then(|m| parse_amount(m.as_str()))
}

/// Big blind of a "sb/bb" blinds string: the last integer in it (0 when there is none).
pub fn big_blind(blinds: &str) -> i64 {
    regex!(r"\d+").find_iter(blinds).last().and_then(|m| m.as_str().parse().ok()).unwrap_or(0)
}

/// Size of a raise in big blinds, when its "to" amount and the blinds are known.
pub fn raise_size_bb(action: &Action, blinds: &str) -> Option<f64> {
    let bb = big_blind(blinds);
    match action.amount_to {
        Some(to) if bb > 0 => Some(to / bb as f64),
        _ => None,
    }
}

/// Effective-stack bucket used by the push/fold tables.
pub fn stack_bucket(stack: f64, blinds: &str) -> &'static str {
    let bb = big_blind(blinds);
    if bb <= 0 || stack <= 0.0 {
        return "Unknown";
    }
    match stack / bb as f64 {
        s if s <= 8.0 => "0-8bb",
        s if s <= 12.0 => "8-12bb",
        s if s <= 18.0 => "12-18bb",
        _ => "18bb+",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_three_room_formats() {
        let betclic = parse_actions("22:53:05 - jmenfouu: Posts SB 50\n22:53:09 - jmenfouu: Raises to 680 and is all-in");
        assert_eq!(betclic.len(), 2);
        assert_eq!((betclic[0].player.as_str(), betclic[0].kind, betclic[0].amount), ("jmenfouu", ActionKind::Post, Some(50.0)));
        assert_eq!((betclic[1].kind, betclic[1].amount_to, betclic[1].is_all_in), (ActionKind::Raise, Some(680.0), true));

        let winamax = parse_actions("Bob raises 30 to 60\nAnn calls 30\nCG_Boss2336 posts big blind 30");
        assert_eq!((winamax[0].amount, winamax[0].amount_to), (Some(30.0), Some(60.0)));
        assert_eq!((winamax[1].kind, winamax[1].amount_to), (ActionKind::Call, Some(30.0)));
        assert_eq!(winamax[2].player, "CG_Boss2336");

        let unibet = parse_actions("Player One folds\nPlayer One checks");
        assert_eq!(unibet[0].player, "Player One");
        assert_eq!((unibet[0].kind, unibet[1].kind), (ActionKind::Fold, ActionKind::Check));
    }

    #[test]
    fn skips_lines_that_are_not_actions() {
        assert!(parse_actions("Dealt to Bob [As Ks]\nBob collected 60 from pot\n*** FLOP ***").is_empty());
    }

    #[test]
    fn amount_ignores_numbers_glued_to_words() {
        assert_eq!(first_amount(" x25 then 40"), Some(40.0));
        assert_eq!(first_amount(" 12,5"), Some(12.5));
        assert_eq!(first_amount(" nothing"), None);
    }

    #[test]
    fn blinds_and_stack_buckets() {
        assert_eq!(big_blind("50/100"), 100);
        assert_eq!(big_blind("15/30 ante 5"), 5, "the last integer wins, like the former backend");
        assert_eq!(big_blind(""), 0);
        assert_eq!(stack_bucket(700.0, "50/100"), "0-8bb");
        assert_eq!(stack_bucket(1000.0, "50/100"), "8-12bb");
        assert_eq!(stack_bucket(1500.0, "50/100"), "12-18bb");
        assert_eq!(stack_bucket(5000.0, "50/100"), "18bb+");
        assert_eq!(stack_bucket(0.0, "50/100"), "Unknown");
        let raise = &parse_actions("Bob raises 30 to 60")[0];
        assert_eq!(raise_size_bb(raise, "15/30"), Some(2.0));
    }
}
