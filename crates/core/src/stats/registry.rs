//! The stat registry: the single list of stat definitions.
//!
//! A definition names the flag counting the numerator and what the percentage is taken over.
//! The same entry drives the SQL aggregation, the drill-down to sample hands and the labels the
//! API returns, so adding a stat means adding one line here (and, for a brand-new decision, one
//! flag).

use super::flags::{Flag, Flags, WORDS};

/// What the percentage is taken over.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Denominator {
    /// Every hand of the selected rows.
    Hands,
    /// Hands where this flag (an opportunity) is set.
    Flag(Flag),
}

/// Table the stat is reported in (the section names of the former detailed-stats response).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Section {
    Preflop,
    HuSb,
    HuBb,
    ThreeWayPreflop,
    Steal,
    VsSteal,
}

/// Fixed seat/table-size a stat is restricted to, when the section implies one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Segment {
    /// Heads-up, small blind.
    HuSb,
    /// Heads-up, big blind.
    HuBb,
    /// Three-handed button.
    ThreeWayBtn,
    /// Three-handed small blind.
    ThreeWaySb,
    /// Three-handed big blind.
    ThreeWayBb,
}

#[derive(Debug, Clone, Copy)]
pub struct StatDef {
    pub section: Section,
    /// Label shown to the user (unchanged from the former API).
    pub label: &'static str,
    pub numerator: Flag,
    pub denominator: Denominator,
    pub segment: Option<Segment>,
}

const fn stat(section: Section, label: &'static str, numerator: Flag, denominator: Denominator) -> StatDef {
    StatDef { section, label, numerator, denominator, segment: None }
}

const fn seg(section: Section, segment: Segment, label: &'static str, numerator: Flag, denominator: Denominator) -> StatDef {
    StatDef { section, label, numerator, denominator, segment: Some(segment) }
}

use Denominator::{Flag as Over, Hands};
use Section::*;

/// All registered stats, in display order.
pub const STATS: &[StatDef] = &[
    // --- Preflop table (reported for total, heads-up, three-handed and each seat)
    stat(Preflop, "VPIP", Flag::Vpip, Hands),
    stat(Preflop, "PFR", Flag::Pfr, Hands),
    stat(Preflop, "Raise First In", Flag::Rfi, Over(Flag::RfiOpp)),
    stat(Preflop, "Open Raise 2x", Flag::Rfi2x, Over(Flag::RfiOpp)),
    stat(Preflop, "Open Raise 2x+", Flag::Rfi2xPlus, Over(Flag::RfiOpp)),
    stat(Preflop, "Open Raise 2x Exact", Flag::Rfi2x, Over(Flag::RfiOpp)),
    stat(Preflop, "Open Raise 2.5x", Flag::Rfi25x, Over(Flag::RfiOpp)),
    stat(Preflop, "Open Raise 3x", Flag::Rfi3x, Over(Flag::RfiOpp)),
    stat(Preflop, "Open Raise 3.5x+", Flag::Rfi35xPlus, Over(Flag::RfiOpp)),
    stat(Preflop, "Open Limp", Flag::Limp, Over(Flag::LimpOpp)),
    stat(Preflop, "Call Open", Flag::CallOpen, Over(Flag::CallOpenOpp)),
    stat(Preflop, "3-Bet", Flag::ThreeBet, Over(Flag::ThreeBetOpp)),
    stat(Preflop, "3-Bet Non-All-In", Flag::ThreeBetNonAllIn, Over(Flag::ThreeBetOpp)),
    stat(Preflop, "3-Bet Shove", Flag::ThreeBetShove, Over(Flag::ThreeBetOpp)),
    stat(Preflop, "Fold to 3-Bet", Flag::FoldTo3Bet, Over(Flag::FoldTo3BetOpp)),
    stat(Preflop, "Fold to 3-Bet Non-All-In", Flag::FoldTo3BetNonAllIn, Over(Flag::FoldTo3BetNonAllInOpp)),
    stat(Preflop, "Fold to 3-Bet Shove", Flag::FoldTo3BetShove, Over(Flag::FoldTo3BetShoveOpp)),
    stat(Preflop, "4-Bet", Flag::FourBet, Over(Flag::FourBetOpp)),
    stat(Preflop, "Fold to 4-Bet", Flag::FoldTo4Bet, Over(Flag::FoldTo4BetOpp)),
    stat(Preflop, "Limp-Fold", Flag::LimpFold, Over(Flag::LimpFoldOpp)),
    stat(Preflop, "Limp-Fold vs Non-All-In", Flag::LimpFoldVsNonAllIn, Over(Flag::LimpFoldVsNonAllInOpp)),
    stat(Preflop, "Limp-Fold vs All-In", Flag::LimpFoldVsAllIn, Over(Flag::LimpFoldVsAllInOpp)),
    stat(Preflop, "Limp-Raise", Flag::LimpRaise, Over(Flag::LimpFacedRaiseOpp)),
    stat(Preflop, "Hands vs Raise", Flag::FacingRaiseOpp, Over(Flag::FacingRaiseOpp)),
    stat(Preflop, "Fold vs Raise", Flag::FoldVsRaise, Over(Flag::FacingRaiseOpp)),
    stat(Preflop, "Call vs Raise", Flag::CallVsRaise, Over(Flag::FacingRaiseOpp)),
    stat(Preflop, "Fold vs 2x", Flag::FoldVs2x, Over(Flag::Facing2xOpp)),
    stat(Preflop, "Fold vs 2x+", Flag::FoldVs2xPlus, Over(Flag::Facing2xPlusOpp)),
    stat(Preflop, "Fold vs 2.5x", Flag::FoldVs25x, Over(Flag::Facing25xOpp)),
    stat(Preflop, "Fold vs 3x", Flag::FoldVs3x, Over(Flag::Facing3xOpp)),
    stat(Preflop, "Fold vs 3.5x+", Flag::FoldVs35xPlus, Over(Flag::Facing35xPlusOpp)),
    stat(Preflop, "Call vs 2x", Flag::CallVs2x, Over(Flag::Facing2xOpp)),
    stat(Preflop, "Call vs 2x+", Flag::CallVs2xPlus, Over(Flag::Facing2xPlusOpp)),
    stat(Preflop, "Call vs 2.5x", Flag::CallVs25x, Over(Flag::Facing25xOpp)),
    stat(Preflop, "Call vs 3x", Flag::CallVs3x, Over(Flag::Facing3xOpp)),
    stat(Preflop, "Call vs 3.5x+", Flag::CallVs35xPlus, Over(Flag::Facing35xPlusOpp)),
    stat(Preflop, "Hands vs Limp", Flag::FacingLimpOpp, Over(Flag::FacingLimpOpp)),
    stat(Preflop, "Iso Raise", Flag::IsoRaise, Over(Flag::FacingLimpOpp)),
    stat(Preflop, "Iso Non-All-In", Flag::IsoNonAllIn, Over(Flag::FacingLimpOpp)),
    stat(Preflop, "Iso All-In", Flag::IsoAllIn, Over(Flag::FacingLimpOpp)),
    stat(Preflop, "Hands vs Open Shove", Flag::FacingOpenShoveOpp, Over(Flag::FacingOpenShoveOpp)),
    stat(Preflop, "5-Bet", Flag::FiveBet, Over(Flag::FiveBetOpp)),
    stat(Preflop, "Call 4-Bet", Flag::Call4Bet, Over(Flag::Call4BetOpp)),
    stat(Preflop, "4-Bet-Fold", Flag::FourBetFold, Over(Flag::FourBetFoldOpp)),
    stat(Preflop, "Squeeze", Flag::Squeeze, Over(Flag::SqueezeOpp)),
    // --- Heads-up small blind
    seg(HuSb, Segment::HuSb, "Open Limp", Flag::Limp, Hands),
    seg(HuSb, Segment::HuSb, "Raise First In", Flag::Rfi, Hands),
    seg(HuSb, Segment::HuSb, "Limp-Fold vs Raise", Flag::HuSbLimpFoldVsRaise, Over(Flag::Limp)),
    seg(HuSb, Segment::HuSb, "Limp-Call vs Raise", Flag::HuSbLimpCallVsRaise, Over(Flag::Limp)),
    seg(HuSb, Segment::HuSb, "Limp-Raise vs Raise", Flag::HuSbLimpRaiseVsRaise, Over(Flag::Limp)),
    // --- Heads-up big blind
    seg(HuBb, Segment::HuBb, "vs Limp Check", Flag::HuBbVsLimpCheck, Over(Flag::HuBbVsLimpOpp)),
    seg(HuBb, Segment::HuBb, "vs Limp Raise", Flag::HuBbVsLimpRaise, Over(Flag::HuBbVsLimpOpp)),
    seg(HuBb, Segment::HuBb, "vs Raise Fold", Flag::HuBbVsRaiseFold, Over(Flag::HuBbVsRaiseOpp)),
    seg(HuBb, Segment::HuBb, "vs Raise Call", Flag::HuBbVsRaiseCall, Over(Flag::HuBbVsRaiseOpp)),
    seg(HuBb, Segment::HuBb, "vs Raise 3-Bet", Flag::HuBbVsRaise3Bet, Over(Flag::HuBbVsRaiseOpp)),
    // --- Three-handed preflop
    seg(ThreeWayPreflop, Segment::ThreeWayBtn, "BTN RFI", Flag::Rfi, Hands),
    seg(ThreeWayPreflop, Segment::ThreeWaySb, "SB RFI", Flag::Rfi, Hands),
    seg(ThreeWayPreflop, Segment::ThreeWaySb, "SB Complete", Flag::Limp, Hands),
    seg(ThreeWayPreflop, Segment::ThreeWayBb, "BB vs Steal Fold", Flag::ThreeWBbVsStealFold, Over(Flag::ThreeWBbVsStealOpp)),
    seg(ThreeWayPreflop, Segment::ThreeWayBb, "BB vs Steal Call", Flag::ThreeWBbVsStealCall, Over(Flag::ThreeWBbVsStealOpp)),
    seg(ThreeWayPreflop, Segment::ThreeWayBb, "BB vs Steal 3-Bet", Flag::ThreeWBbVsSteal3Bet, Over(Flag::ThreeWBbVsStealOpp)),
    // --- Steals (total, BTN and SB columns are separated by the row's position)
    stat(Steal, "Steal", Flag::Steal, Over(Flag::StealOpp)),
    stat(Steal, "Fold to 3Bet", Flag::StealFold3, Over(Flag::StealFold3Opp)),
    stat(Steal, "4-Bet", Flag::Steal4Bet, Over(Flag::StealFold3Opp)),
    stat(Steal, "4-Bet-Fold", Flag::Steal4BetFold, Over(Flag::Steal4Bet)),
    // --- Small blind and big blind facing a steal (SB and BB columns)
    stat(VsSteal, "Fold", Flag::VsStealFold, Over(Flag::VsStealOpp)),
    stat(VsSteal, "Call", Flag::VsStealCall, Over(Flag::VsStealOpp)),
    stat(VsSteal, "3-Bet", Flag::VsSteal3Bet, Over(Flag::VsStealOpp)),
    // The push/fold table is not listed here: its rows are grouped by stack bucket and position
    // and share a custom denominator (`repos::detailed_stats`).
];

pub fn stats_in(section: Section) -> impl Iterator<Item = &'static StatDef> {
    STATS.iter().filter(move |s| s.section == section)
}

pub fn find(section: Section, label: &str) -> Option<&'static StatDef> {
    stats_in(section).find(|s| s.label == label)
}

/// Name of the stored column holding the flags of `word`.
pub fn column(word: usize) -> String {
    format!("flags_{word}")
}

/// SQL boolean expression, true when `flag` is set on the row aliased `alias`.
pub fn flag_condition(alias: &str, flag: Flag) -> String {
    let (word, mask) = flag.location();
    format!("({alias}.{} & {mask}) != 0", column(word))
}

/// SQL expressions `(numerator, denominator)` counting hands, to be used inside a query that
/// selects `alias` rows. The denominator of a hands-based stat is simply the row count.
pub fn count_expressions(alias: &str, def: &StatDef) -> (String, String) {
    let numerator = format!("COALESCE(SUM(CASE WHEN {} THEN 1 ELSE 0 END), 0)", flag_condition(alias, def.numerator));
    let denominator = match def.denominator {
        Denominator::Hands => "COUNT(*)".to_string(),
        Denominator::Flag(f) => format!("COALESCE(SUM(CASE WHEN {} THEN 1 ELSE 0 END), 0)", flag_condition(alias, f)),
    };
    (numerator, denominator)
}

/// SQL predicate selecting the rows of a stat's numerator (used for sample hands).
pub fn sample_condition(alias: &str, def: &StatDef) -> String {
    flag_condition(alias, def.numerator)
}

/// Evaluates a stat over in-memory flag sets: `(numerator, denominator)`.
pub fn count(def: &StatDef, rows: &[Flags]) -> (u64, u64) {
    let numerator = rows.iter().filter(|r| r.has(def.numerator)).count() as u64;
    let denominator = match def.denominator {
        Denominator::Hands => rows.len() as u64,
        Denominator::Flag(f) => rows.iter().filter(|r| r.has(f)).count() as u64,
    };
    (numerator, denominator)
}

/// Number of storage columns the registry's flags need (for schema checks).
pub const fn word_count() -> usize {
    WORDS
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn labels_are_unique_within_a_section() {
        let mut seen = HashSet::new();
        for s in STATS {
            assert!(seen.insert((s.section as u8, s.label)), "duplicate {:?} {}", s.section, s.label);
        }
    }

    #[test]
    fn preflop_table_keeps_the_former_row_order() {
        let labels: Vec<&str> = stats_in(Preflop).take(8).map(|s| s.label).collect();
        assert_eq!(
            labels,
            ["VPIP", "PFR", "Raise First In", "Open Raise 2x", "Open Raise 2x+", "Open Raise 2x Exact", "Open Raise 2.5x", "Open Raise 3x"]
        );
        assert_eq!(stats_in(Preflop).filter(|s| s.label != "5-Bet" && s.label != "Call 4-Bet" && s.label != "4-Bet-Fold" && s.label != "Squeeze").count(), 41);
    }

    #[test]
    fn a_percentage_is_never_taken_over_its_own_numerator() {
        // Over itself a stat is always 100%: the denominator must be an opportunity flag.
        for s in STATS {
            if s.label.starts_with("Hands vs") {
                continue;
            }
            assert!(s.denominator != Denominator::Flag(s.numerator), "{:?} {} is taken over itself", s.section, s.label);
        }
    }

    #[test]
    fn every_numerator_is_an_action_or_a_reported_count() {
        // An "...Opp" flag may only be a numerator for the "Hands vs ..." counters.
        for s in STATS {
            if s.numerator.name().ends_with("Opp") {
                assert!(s.label.starts_with("Hands vs"), "{} uses opportunity flag {}", s.label, s.numerator.name());
            }
        }
    }

    #[test]
    fn counts_over_flag_sets() {
        let mut a = Flags::default();
        a.set(Flag::RfiOpp);
        a.set(Flag::Rfi);
        let mut b = Flags::default();
        b.set(Flag::RfiOpp);
        let c = Flags::default();
        let rfi = find(Preflop, "Raise First In").unwrap();
        assert_eq!(count(rfi, &[a, b, c]), (1, 2));
        let vpip = find(Preflop, "VPIP").unwrap();
        assert_eq!(count(vpip, &[a, b, c]), (0, 3));
    }

    #[test]
    fn sql_matches_the_in_memory_count_across_all_columns() {
        use rusqlite::Connection;
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE f (flags_0 INTEGER, flags_1 INTEGER, flags_2 INTEGER, flags_3 INTEGER);").unwrap();

        // One row per flag, so every column and every bit position is exercised.
        let mut rows = Vec::new();
        for flag in Flag::ALL {
            let mut r = Flags::default();
            r.set(*flag);
            r.set(Flag::RfiOpp);
            let w = r.words();
            conn.execute("INSERT INTO f VALUES (?1, ?2, ?3, ?4)", rusqlite::params![w[0] as i64, w[1] as i64, w[2] as i64, w[3] as i64]).unwrap();
            rows.push(r);
        }
        for def in STATS {
            let (num, den) = count_expressions("f", def);
            let (n, d): (i64, i64) = conn.query_row(&format!("SELECT {num}, {den} FROM f f"), [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
            assert_eq!((n as u64, d as u64), count(def, &rows), "{:?} {}", def.section, def.label);
        }
    }
}
