//! Detailed player statistics, read from the stored stat flags.
//!
//! One pass over the players' hands counts every registered stat per table segment (total,
//! heads-up, three-handed and each seat) and keeps the first 20 hands of each as examples. The
//! same pass is repeated per stack-depth bucket.
//!
//! The preflop sections come from the registry; the postflop ones from `postflop_stats`.

use std::collections::{HashMap, HashSet};
use std::rc::Rc;

use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, ToSql};
use serde::Serialize;
use serde_json::{json, Value};

use crate::engines::actions::stack_bucket;
use super::postflop_stats::PostflopTally;
use crate::stats::flags::{Flag, Flags};
use crate::stats::postflop::StreetCounts;
use crate::stats::registry::{Denominator, Section, Segment, StatDef, STATS};
use crate::Result;

/// Hands kept as examples for each figure.
const MAX_SAMPLE_HANDS: usize = 20;

/// Rows of the main preflop table that are computed but not reported (same as before).
const UNREPORTED_PREFLOP: [&str; 4] = ["5-Bet", "Call 4-Bet", "4-Bet-Fold", "Squeeze"];

#[derive(Debug, Clone, Default, PartialEq)]
pub struct DetailedQuery {
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub buy_in: Option<f64>,
    /// "population" (default), "reg", "fish" or "player".
    pub stats_scope: Option<String>,
    /// Required by the "player" scope.
    pub opponent_name: Option<String>,
}

/// A hand shown as an example of a figure.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Sample {
    pub(super) id: String,
    pub(super) hand_id: String,
    pub(super) player_name: String,
    pub(super) position: String,
    pub(super) cards: String,
    pub(super) flop_cards: String,
    pub(super) turn_card: String,
    pub(super) river_card: String,
    pub(super) preflop: String,
    pub(super) flop: String,
    pub(super) turn: String,
    pub(super) river: String,
    pub(super) date_time: String,
    pub(super) room: String,
    pub(super) buy_in: f64,
    pub(super) net_profit: f64,
    pub(super) blinds: String,
}

pub(crate) struct Row {
    pub(super) sample: Sample,
    pub(super) player_count: i32,
    pub(super) stack: i64,
    pub(super) flags: Flags,
    pub(super) street_counts: StreetCounts,
}

impl Row {
    /// A row carrying only what the preflop counters read (the HUD needs no example hands).
    pub(crate) fn lean(player_count: i32, position: &str, flags: Flags) -> Row {
        let sample = Sample { position: position.trim().to_uppercase(), ..Sample::default() };
        Row { sample, player_count, stack: 0, flags, street_counts: StreetCounts(0) }
    }
}

/// Table segment of a row: seat plus table size.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Seat {
    Btn,
    SbHu,
    Sb3w,
    BbHu,
    Bb3w,
}

const SEATS: [Seat; 5] = [Seat::Btn, Seat::SbHu, Seat::Sb3w, Seat::BbHu, Seat::Bb3w];

impl Seat {
    fn of(position: &str, player_count: i32) -> Option<Seat> {
        match (position, player_count) {
            ("BTN", _) => Some(Seat::Btn),
            ("SB", 2) => Some(Seat::SbHu),
            ("SB", _) => Some(Seat::Sb3w),
            ("BB", 2) => Some(Seat::BbHu),
            ("BB", _) => Some(Seat::Bb3w),
            _ => None,
        }
    }

    fn index(self) -> usize {
        SEATS.iter().position(|s| *s == self).expect("listed seat")
    }
}

/// Counts of every registered stat over a set of rows.
#[derive(Clone)]
struct Tally {
    hands: u64,
    num: Vec<u64>,
    den: Vec<u64>,
    samples: Vec<Vec<Rc<Sample>>>,
}

impl Tally {
    fn new() -> Self {
        Tally { hands: 0, num: vec![0; STATS.len()], den: vec![0; STATS.len()], samples: vec![Vec::new(); STATS.len()] }
    }

    fn add(&mut self, flags: &Flags, sample: &mut Option<Rc<Sample>>, row: &Row) {
        self.hands += 1;
        for (i, def) in STATS.iter().enumerate() {
            if def.segment.is_some() {
                continue;
            }
            self.count(i, def, flags, sample, row);
        }
    }

    /// Counts one stat; the first rows where its numerator holds become its examples.
    fn count(&mut self, i: usize, def: &StatDef, flags: &Flags, sample: &mut Option<Rc<Sample>>, row: &Row) {
        match def.denominator {
            Denominator::Hands => self.den[i] += 1,
            Denominator::Flag(f) if flags.has(f) => self.den[i] += 1,
            Denominator::Flag(_) => {}
        }
        if flags.has(def.numerator) {
            self.num[i] += 1;
            if self.samples[i].len() < MAX_SAMPLE_HANDS {
                let shared = sample.get_or_insert_with(|| Rc::new(row.sample.clone()));
                self.samples[i].push(shared.clone());
            }
        }
    }

    /// Sum of several tallies; examples are taken from the first tallies first.
    fn merge(parts: &[&Tally]) -> Tally {
        let mut out = Tally::new();
        for part in parts {
            out.hands += part.hands;
            for i in 0..STATS.len() {
                out.num[i] += part.num[i];
                out.den[i] += part.den[i];
                for s in &part.samples[i] {
                    if out.samples[i].len() >= MAX_SAMPLE_HANDS {
                        break;
                    }
                    out.samples[i].push(s.clone());
                }
            }
        }
        out
    }
}

/// Push/fold figures of one stack bucket and position.
struct PushFoldTally {
    stack: &'static str,
    pub(super) position: String,
    spots: u64,
    counts: HashMap<Flag, u64>,
    facing_shove: u64,
    samples: HashMap<Flag, Vec<Rc<Sample>>>,
}

const PUSH_FOLD_FLAGS: [Flag; 8] =
    [Flag::OpenShoveOpp, Flag::IsoShoveOpp, Flag::RejamOpp, Flag::OpenShove, Flag::IsoShove, Flag::Rejam, Flag::CallShove, Flag::FoldVsShove];

fn push_fold_position(position: &str, player_count: i32) -> String {
    match (player_count, position) {
        (2, "SB") => "HU SB".into(),
        (2, "BB") => "HU BB".into(),
        (3, "BTN") => "3W BTN".into(),
        (3, "SB") => "3W SB".into(),
        (3, "BB") => "3W BB".into(),
        (_, p) if p.trim().is_empty() => "Unknown".into(),
        (_, p) => p.to_string(),
    }
}

fn stack_order(bucket: &str) -> usize {
    ["0-8bb", "8-12bb", "12-18bb", "18bb+"].iter().position(|b| *b == bucket).unwrap_or(4)
}

fn position_order(position: &str) -> usize {
    ["HU SB", "HU BB", "3W BTN", "3W SB", "3W BB"].iter().position(|p| *p == position).unwrap_or(5)
}

/// Everything counted over one set of rows.
pub(crate) struct Accumulator {
    players: HashSet<String>,
    all: Tally,
    seats: Vec<Tally>,
    push_fold: Vec<PushFoldTally>,
    postflop: PostflopTally,
}

impl Accumulator {
    pub(crate) fn new() -> Self {
        Accumulator {
            players: HashSet::new(),
            all: Tally::new(),
            seats: vec![Tally::new(); SEATS.len()],
            push_fold: Vec::new(),
            postflop: PostflopTally::new(),
        }
    }

    fn consume(&mut self, row: &Row) {
        self.players.insert(row.sample.player_name.to_lowercase());
        let mut shared: Option<Rc<Sample>> = None;
        self.count_preflop(row, &mut shared);
        self.consume_push_fold(row, &mut shared);
        self.postflop.consume(row, &mut shared);
    }

    /// Counts the preflop figures only (the HUD shows nothing else).
    pub(crate) fn consume_preflop(&mut self, row: &Row) {
        self.count_preflop(row, &mut None);
    }

    fn count_preflop(&mut self, row: &Row, shared: &mut Option<Rc<Sample>>) {
        self.all.add(&row.flags, shared, row);

        if let Some(seat) = Seat::of(&row.sample.position, row.player_count) {
            self.seats[seat.index()].add(&row.flags, shared, row);
        }
        // Statistics tied to one seat are counted on that seat's rows only.
        for (i, def) in STATS.iter().enumerate() {
            let Some(segment) = def.segment else { continue };
            let seat = match segment {
                Segment::HuSb => Seat::SbHu,
                Segment::HuBb => Seat::BbHu,
                Segment::ThreeWayBtn => Seat::Btn,
                Segment::ThreeWaySb => Seat::Sb3w,
                Segment::ThreeWayBb => Seat::Bb3w,
            };
            if Seat::of(&row.sample.position, row.player_count) == Some(seat) {
                self.seats[seat.index()].count(i, def, &row.flags, shared, row);
            }
        }
    }

    fn consume_push_fold(&mut self, row: &Row, shared: &mut Option<Rc<Sample>>) {
        let bucket = stack_bucket(row.stack as f64, &row.sample.blinds);
        let position = push_fold_position(&row.sample.position, row.player_count);
        let index = match self.push_fold.iter().position(|t| t.stack == bucket && t.position == position) {
            Some(i) => i,
            None => {
                self.push_fold.push(PushFoldTally { stack: bucket, position, spots: 0, counts: HashMap::new(), facing_shove: 0, samples: HashMap::new() });
                self.push_fold.len() - 1
            }
        };
        let tally = &mut self.push_fold[index];
        tally.spots += 1;
        for flag in PUSH_FOLD_FLAGS {
            if row.flags.has(flag) {
                *tally.counts.entry(flag).or_default() += 1;
                // The first examples of each action; opportunities and "call shove" have none.
                if matches!(flag, Flag::OpenShove | Flag::IsoShove | Flag::Rejam | Flag::CallShove | Flag::FoldVsShove) {
                    let list = tally.samples.entry(flag).or_default();
                    if list.len() < MAX_SAMPLE_HANDS {
                        list.push(shared.get_or_insert_with(|| Rc::new(row.sample.clone())).clone());
                    }
                }
            }
        }
        if row.flags.has(Flag::CallShove) || row.flags.has(Flag::FoldVsShove) {
            tally.facing_shove += 1;
        }
    }
}

/// Percentage rounded to one decimal; 0 without opportunities.
pub(crate) fn pct(num: u64, den: u64) -> f64 {
    if den == 0 {
        0.0
    } else {
        (100.0 * num as f64 / den as f64 * 10.0).round_ties_even() / 10.0
    }
}

fn sample_json(num: u64, den: u64, hands: &[Rc<Sample>]) -> Value {
    json!({ "num": num, "den": den, "hands": hands.iter().map(|h| serde_json::to_value(&**h).expect("serialisable")).collect::<Vec<_>>() })
}

fn empty_sample(num: u64, den: u64) -> Value {
    json!({ "num": num, "den": den, "hands": [] })
}

impl Accumulator {
    /// Hands counted so far (rows of the 2- and 3-handed hands consumed).
    pub(crate) fn hand_count(&self) -> u64 {
        self.all.hands
    }

    /// `(numerator, denominator)` of one registered stat in one table column, using the same
    /// tallies as the detailed-stats response so both always agree. `None` for an unknown
    /// stat or column, and for the postflop stats (not counted here).
    pub(crate) fn counts(&self, section: Section, label: &str, column: Option<&str>) -> Option<(u64, u64)> {
        let (i, def) = STATS.iter().enumerate().find(|(_, d)| d.section == section && d.label == label)?;
        let seat = |s: Seat| &self.seats[s.index()];
        let tally = match (section, def.segment) {
            (_, Some(segment)) => seat(match segment {
                Segment::HuSb => Seat::SbHu,
                Segment::HuBb => Seat::BbHu,
                Segment::ThreeWayBtn => Seat::Btn,
                Segment::ThreeWaySb => Seat::Sb3w,
                Segment::ThreeWayBb => Seat::Bb3w,
            })
            .clone(),
            (Section::Preflop, None) => match column.unwrap_or("tot") {
                "tot" => self.all.clone(),
                "hu" => Tally::merge(&[seat(Seat::SbHu), seat(Seat::BbHu)]),
                "three_way" => Tally::merge(&[seat(Seat::Btn), seat(Seat::Sb3w), seat(Seat::Bb3w)]),
                "btn" => seat(Seat::Btn).clone(),
                "sb_hu" => seat(Seat::SbHu).clone(),
                "sb_3w" => seat(Seat::Sb3w).clone(),
                "bb_hu" => seat(Seat::BbHu).clone(),
                "bb_3w" => seat(Seat::Bb3w).clone(),
                _ => return None,
            },
            (Section::Steal, None) => match column.unwrap_or("tot") {
                "tot" => Tally::merge(&[seat(Seat::Btn), seat(Seat::SbHu), seat(Seat::Sb3w)]),
                "btn" => seat(Seat::Btn).clone(),
                "sb" => Tally::merge(&[seat(Seat::SbHu), seat(Seat::Sb3w)]),
                _ => return None,
            },
            (Section::VsSteal, None) => match column.unwrap_or("tot") {
                "tot" => Tally::merge(&[seat(Seat::SbHu), seat(Seat::Sb3w), seat(Seat::BbHu), seat(Seat::Bb3w)]),
                "sb" => Tally::merge(&[seat(Seat::SbHu), seat(Seat::Sb3w)]),
                "bb" => Tally::merge(&[seat(Seat::BbHu), seat(Seat::Bb3w)]),
                _ => return None,
            },
            _ => return None,
        };
        Some((tally.num[i], tally.den[i]))
    }

    /// Rows of one section, in registry order.
    fn defs(section: Section) -> impl Iterator<Item = (usize, &'static StatDef)> {
        STATS.iter().enumerate().filter(move |(_, d)| d.section == section)
    }

    fn to_response(&self, stack_depths: Value) -> Value {
        let seat = |s: Seat| &self.seats[s.index()];
        let hu = Tally::merge(&[seat(Seat::SbHu), seat(Seat::BbHu)]);
        let three_way = Tally::merge(&[seat(Seat::Btn), seat(Seat::Sb3w), seat(Seat::Bb3w)]);
        let columns: [(&str, &Tally); 8] = [
            ("tot", &self.all),
            ("hu", &hu),
            ("three_way", &three_way),
            ("btn", seat(Seat::Btn)),
            ("sb_hu", seat(Seat::SbHu)),
            ("sb_3w", seat(Seat::Sb3w)),
            ("bb_hu", seat(Seat::BbHu)),
            ("bb_3w", seat(Seat::Bb3w)),
        ];

        let preflop: Vec<Value> = Self::defs(Section::Preflop)
            .filter(|(_, d)| !UNREPORTED_PREFLOP.contains(&d.label))
            .map(|(i, def)| {
                let count_only = def.denominator == Denominator::Flag(def.numerator);
                let mut row = serde_json::Map::new();
                row.insert("stat".into(), json!(def.label));
                let mut samples = serde_json::Map::new();
                for (name, tally) in columns {
                    let value = if count_only { json!(tally.num[i]) } else { json!(pct(tally.num[i], tally.den[i])) };
                    row.insert(name.into(), value);
                    samples.insert(name.into(), sample_json(tally.num[i], tally.den[i], &tally.samples[i]));
                }
                row.insert("samples".into(), Value::Object(samples));
                Value::Object(row)
            })
            .collect();

        let fixed_segment = |section: Section| -> Vec<Value> {
            Self::defs(section)
                .map(|(i, def)| {
                    let tally = seat(match def.segment {
                        Some(Segment::HuSb) => Seat::SbHu,
                        Some(Segment::HuBb) => Seat::BbHu,
                        Some(Segment::ThreeWayBtn) => Seat::Btn,
                        Some(Segment::ThreeWaySb) => Seat::Sb3w,
                        _ => Seat::Bb3w,
                    });
                    json!({
                        "stat": def.label,
                        "value": pct(tally.num[i], tally.den[i]),
                        "sample": sample_json(tally.num[i], tally.den[i], &tally.samples[i]),
                    })
                })
                .collect()
        };

        // Steals: total, button and small blind columns. The counters live on the seat tallies.
        let steal_total = Tally::merge(&[seat(Seat::Btn), seat(Seat::SbHu), seat(Seat::Sb3w)]);
        let steal_sb = Tally::merge(&[seat(Seat::SbHu), seat(Seat::Sb3w)]);
        let steal: Vec<Value> = Self::defs(Section::Steal)
            .map(|(i, def)| {
                let (t, b, s) = (&steal_total, seat(Seat::Btn), &steal_sb);
                let four_bet_fold = def.label == "4-Bet-Fold";
                json!({
                    "stat": def.label,
                    "tot": pct(t.num[i], t.den[i]),
                    "btn": if four_bet_fold { json!("--") } else { json!(pct(b.num[i], b.den[i])) },
                    "sb": if four_bet_fold { json!("--") } else { json!(pct(s.num[i], s.den[i])) },
                    "samples": {
                        "tot": empty_sample(t.num[i], t.den[i]),
                        "btn": if four_bet_fold { empty_sample(0, 0) } else { empty_sample(b.num[i], b.den[i]) },
                        "sb": if four_bet_fold { empty_sample(0, 0) } else { empty_sample(s.num[i], s.den[i]) },
                    },
                })
            })
            .collect();

        let big_blinds = Tally::merge(&[seat(Seat::BbHu), seat(Seat::Bb3w)]);
        let vs_steal: Vec<Value> = Self::defs(Section::VsSteal)
            .map(|(i, def)| {
                let (sb, bb) = (&steal_sb, &big_blinds);
                json!({
                    "stat": def.label,
                    "sb": pct(sb.num[i], sb.den[i]),
                    "bb": pct(bb.num[i], bb.den[i]),
                    "samples": { "sb": empty_sample(sb.num[i], sb.den[i]), "bb": empty_sample(bb.num[i], bb.den[i]) },
                })
            })
            .collect();

        let mut push_fold: Vec<&PushFoldTally> = self.push_fold.iter().collect();
        push_fold.sort_by_key(|t| (stack_order(t.stack), position_order(&t.position)));
        let push_fold: Vec<Value> = push_fold
            .into_iter()
            .map(|t| {
                let count = |f: Flag| t.counts.get(&f).copied().unwrap_or(0);
                let hands = |f: Flag| t.samples.get(&f).map(Vec::as_slice).unwrap_or(&[]);
                json!({
                    "stack": t.stack,
                    "position": t.position,
                    "spots": t.spots,
                    "facing_shove": t.facing_shove,
                    "open_shove": pct(count(Flag::OpenShove), count(Flag::OpenShoveOpp)),
                    "open_shove_sample": sample_json(count(Flag::OpenShove), count(Flag::OpenShoveOpp), hands(Flag::OpenShove)),
                    "iso_shove": pct(count(Flag::IsoShove), count(Flag::IsoShoveOpp)),
                    "iso_shove_sample": sample_json(count(Flag::IsoShove), count(Flag::IsoShoveOpp), hands(Flag::IsoShove)),
                    "rejam": pct(count(Flag::Rejam), count(Flag::RejamOpp)),
                    "rejam_sample": sample_json(count(Flag::Rejam), count(Flag::RejamOpp), hands(Flag::Rejam)),
                    "call_shove": pct(count(Flag::CallShove), t.facing_shove),
                    "call_shove_sample": sample_json(count(Flag::CallShove), t.facing_shove, hands(Flag::CallShove)),
                    "fold_vs_shove": pct(count(Flag::FoldVsShove), t.facing_shove),
                    "fold_vs_shove_sample": sample_json(count(Flag::FoldVsShove), t.facing_shove, hands(Flag::FoldVsShove)),
                })
            })
            .collect();

        let mut response = json!({
            "meta": {
                "player_hands": self.all.hands,
                "players": self.players.len(),
                "hands_3max": seat(Seat::Btn).hands + seat(Seat::Sb3w).hands + seat(Seat::Bb3w).hands,
                "hands_hu": seat(Seat::SbHu).hands + seat(Seat::BbHu).hands,
            },
            "stackDepths": stack_depths,
            "preflop": preflop,
            "huSb": fixed_segment(Section::HuSb),
            "huBb": fixed_segment(Section::HuBb),
            "threeWayPreflop": fixed_segment(Section::ThreeWayPreflop),
            "pushFold": push_fold,
            "performance": { "showdown_chips": 0, "non_showdown_chips": 0 },
            "steal": steal,
            "vsSteal": vs_steal,
        });
        let object = response.as_object_mut().expect("an object");
        for (name, section) in self.postflop.sections() {
            object.insert(name.into(), section);
        }
        response
    }
}

/// "UTG" is reported as "EP" and "HJ" as "MP".
fn normalize_position(position: &str) -> String {
    match position.trim().to_uppercase().as_str() {
        "UTG" => "EP".into(),
        "HJ" => "MP".into(),
        other => other.to_string(),
    }
}

pub fn detailed_stats(conn: &Connection, q: &DetailedQuery) -> Result<Value> {
    let mut filters = vec!["h.player_count IN (2, 3)".to_string()];
    let mut binds: Vec<(&str, SqlValue)> = Vec::new();
    if let Some(d) = q.date_from.as_deref().filter(|d| !d.is_empty()) {
        filters.push("h.date_time >= @dateFrom".into());
        binds.push(("@dateFrom", SqlValue::Text(d.into())));
    }
    if let Some(d) = q.date_to.as_deref().filter(|d| !d.is_empty()) {
        filters.push("h.date_time <= @dateTo".into());
        binds.push(("@dateTo", SqlValue::Text(d.into())));
    }
    if let Some(b) = q.buy_in {
        filters.push("h.buy_in = @buyIn".into());
        binds.push(("@buyIn", SqlValue::Real(b)));
    }
    let scope = q.stats_scope.as_deref().unwrap_or("population").trim().to_lowercase();
    let opponent = q.opponent_name.as_deref().map(str::trim).filter(|o| !o.is_empty());
    match (scope.as_str(), opponent) {
        ("player", Some(name)) => {
            filters.push(format!(
                "ph.player_name IN (SELECT name FROM players WHERE name = @opponentName UNION SELECT p.name FROM players p JOIN aliases a ON p.alias_id = a.id WHERE a.name = @opponentName)"
            ));
            binds.push(("@opponentName", SqlValue::Text(name.into())));
        }
        ("reg", _) => filters.push("COALESCE(p.is_reg, 0) = 1".into()),
        ("fish", _) => filters.push("COALESCE(p.is_reg, 0) = 0".into()),
        _ => {}
    }

    let sql = format!(
        "SELECT h.id, h.hand_id, h.room, h.buy_in, h.date_time, h.flop, h.turn, h.river,
                h.player_count, ph.player_name, ph.position, ph.stack, h.blinds,
                h.preflop_action, h.flop_action, h.turn_action, h.river_action,
                ph.net_profit, ph.cards,
                f.flags_0, f.flags_1, f.flags_2, f.flags_3, f.street_counts
         FROM hands h
         JOIN player_hands ph ON ph.hand_id = h.id
         LEFT JOIN players p ON p.name = ph.player_name
         LEFT JOIN hand_player_flags f ON f.hand_id = h.id AND f.player_name = ph.player_name
         WHERE {}
         ORDER BY h.date_time, h.id, ph.player_name",
        filters.join(" AND ")
    );
    let params: Vec<(&str, &dyn ToSql)> = binds.iter().map(|(n, v)| (*n, v as &dyn ToSql)).collect();
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(&params[..])?;

    let mut overall = Accumulator::new();
    let mut by_stack: HashMap<&'static str, Accumulator> = HashMap::new();

    while let Some(r) = rows.next()? {
        let text = |i: usize| -> rusqlite::Result<String> { Ok(r.get::<_, Option<String>>(i)?.unwrap_or_default()) };
        let blinds = text(12)?;
        let stack: i64 = r.get::<_, Option<i64>>(11)?.unwrap_or(0);
        let word = |i: usize| -> rusqlite::Result<u64> { Ok(r.get::<_, Option<i64>>(i)?.unwrap_or(0) as u64) };
        let row = Row {
            sample: Sample {
                id: text(0)?,
                hand_id: text(1)?,
                room: text(2)?,
                buy_in: r.get::<_, Option<f64>>(3)?.unwrap_or(0.0),
                date_time: text(4)?,
                flop_cards: text(5)?,
                turn_card: text(6)?,
                river_card: text(7)?,
                player_name: text(9)?,
                position: normalize_position(&text(10)?),
                blinds: blinds.clone(),
                preflop: text(13)?,
                flop: text(14)?,
                turn: text(15)?,
                river: text(16)?,
                net_profit: r.get::<_, Option<f64>>(17)?.unwrap_or(0.0),
                cards: text(18)?,
            },
            player_count: r.get::<_, Option<i32>>(8)?.unwrap_or(0),
            stack,
            flags: Flags::from_words([word(19)?, word(20)?, word(21)?, word(22)?]),
            street_counts: StreetCounts(word(23)?),
        };
        if row.sample.player_name.trim().is_empty() {
            continue;
        }
        overall.consume(&row);
        by_stack.entry(stack_bucket(stack as f64, &blinds)).or_insert_with(Accumulator::new).consume(&row);
    }

    let mut buckets: Vec<_> = by_stack.into_iter().collect();
    buckets.sort_by_key(|(bucket, _)| stack_order(bucket));
    let stack_depths: Vec<Value> =
        buckets.iter().map(|(bucket, acc)| json!({ "stack": bucket, "data": acc.to_response(Value::Null) })).collect();

    Ok(overall.to_response(Value::Array(stack_depths)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentages_round_to_one_decimal() {
        assert_eq!(pct(0, 0), 0.0);
        assert_eq!(pct(1, 3), 33.3);
        assert_eq!(pct(2, 3), 66.7);
        assert_eq!(pct(1, 8), 12.5);
    }

    #[test]
    fn seats_are_told_apart_by_table_size() {
        assert!(Seat::of("SB", 2) == Some(Seat::SbHu) && Seat::of("SB", 3) == Some(Seat::Sb3w));
        assert!(Seat::of("BB", 2) == Some(Seat::BbHu) && Seat::of("BB", 3) == Some(Seat::Bb3w));
        assert!(Seat::of("BTN", 3) == Some(Seat::Btn));
        assert!(Seat::of("EP", 3).is_none());
    }

    #[test]
    fn push_fold_table_ordering_and_keys() {
        assert_eq!(push_fold_position("SB", 2), "HU SB");
        assert_eq!(push_fold_position("BTN", 3), "3W BTN");
        assert_eq!(push_fold_position("  ", 3), "Unknown");
        assert!(stack_order("0-8bb") < stack_order("18bb+") && stack_order("18bb+") < stack_order("Unknown"));
        assert!(position_order("HU BB") < position_order("3W BTN"));
    }

    #[test]
    fn utg_and_hj_are_renamed() {
        assert_eq!(normalize_position(" utg "), "EP");
        assert_eq!(normalize_position("hj"), "MP");
        assert_eq!(normalize_position("btn"), "BTN");
    }
}
