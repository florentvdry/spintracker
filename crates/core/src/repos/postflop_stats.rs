//! Postflop sections of the detailed statistics: continuation bets, donk bets, river play,
//! aggression frequency and showdown figures.
//!
//! Each figure is `numerator / denominator` over the hands where its flags are set, optionally
//! restricted to a table position; the first hands counted are kept as examples.

use std::collections::HashMap;
use std::rc::Rc;

use serde_json::{json, Value};

use super::detailed_stats::{Row, Sample};
use crate::stats::flags::{Flag, Flags};
use crate::stats::postflop::Street;

const MAX_SAMPLE_HANDS: usize = 20;

/// A condition on a row: a flag, possibly only for some seats.
#[derive(Clone, Copy)]
enum Cond {
    Flag(Flag),
    /// In position: the button, or the small blind heads-up.
    InPosition(Flag),
    OutOfPosition(Flag),
    HuSb(Flag),
    HuBb(Flag),
    /// Never true (figures whose denominator is a sum of other figures).
    Never,
}

struct Seat {
    in_position: bool,
    hu_sb: bool,
    hu_bb: bool,
}

impl Cond {
    fn holds(self, flags: &Flags, seat: &Seat) -> bool {
        match self {
            Cond::Flag(f) => flags.has(f),
            Cond::InPosition(f) => flags.has(f) && seat.in_position,
            Cond::OutOfPosition(f) => flags.has(f) && !seat.in_position,
            Cond::HuSb(f) => flags.has(f) && seat.hu_sb,
            Cond::HuBb(f) => flags.has(f) && seat.hu_bb,
            Cond::Never => false,
        }
    }
}

struct Figure {
    name: &'static str,
    /// Where the example hands are kept; several figures can share one list.
    sample_key: &'static str,
    /// Whether this figure feeds the example list (only one figure per list should).
    records: bool,
    num: Cond,
    den: Cond,
}

const fn fig(name: &'static str, sample_key: &'static str, num: Cond, den: Cond) -> Figure {
    Figure { name, sample_key, records: true, num, den }
}

const fn shared(name: &'static str, sample_key: &'static str, num: Cond, den: Cond) -> Figure {
    Figure { name, sample_key, records: false, num, den }
}

use Cond::Flag as F;

const FIGURES: &[Figure] = &[
    fig("cbet_flop", "C-Bet:flop", F(Flag::CbetFlop), F(Flag::CbetOppFlop)),
    fig("cbet_turn", "C-Bet:turn", F(Flag::CbetTurn), F(Flag::CbetOppTurn)),
    fig("cbet_river", "C-Bet:river", F(Flag::CbetRiver), F(Flag::CbetOppRiver)),
    fig("cbet_fold_flop", "CBet-Fold:flop", F(Flag::CbetFoldFlop), F(Flag::CbetFoldOppFlop)),
    fig("cbet_fold_turn", "CBet-Fold:turn", F(Flag::CbetFoldTurn), F(Flag::CbetFoldOppTurn)),
    fig("cbet_fold_river", "CBet-Fold:river", F(Flag::CbetFoldRiver), F(Flag::CbetFoldOppRiver)),
    fig("fold_to_cbet_flop", "Fold to CBet:flop", F(Flag::FoldToCbetFlop), F(Flag::FoldToCbetOppFlop)),
    fig("fold_to_cbet_turn", "Fold to CBet:turn", F(Flag::FoldToCbetTurn), F(Flag::FoldToCbetOppTurn)),
    fig("fold_to_cbet_river", "Fold to CBet:river", F(Flag::FoldToCbetRiver), F(Flag::FoldToCbetOppRiver)),
    fig("donk_flop", "Donk Bet:flop", F(Flag::DonkFlop), F(Flag::DonkOppFlop)),
    fig("donk_turn", "Donk Bet:turn", F(Flag::DonkTurn), F(Flag::DonkOppTurn)),
    fig("donk_river", "Donk Bet:river", F(Flag::DonkRiver), F(Flag::DonkOppRiver)),
    fig("donk_fold_flop", "Donk/Fold:flop", F(Flag::DonkFoldFlop), F(Flag::DonkFoldOppFlop)),
    fig("donk_fold_turn", "Donk/Fold:turn", F(Flag::DonkFoldTurn), F(Flag::DonkFoldOppTurn)),
    fig("donk_fold_river", "Donk/Fold:river", F(Flag::DonkFoldRiver), F(Flag::DonkFoldOppRiver)),
    fig("xr_flop", "Check-Raise:flop", F(Flag::XrFlop), F(Flag::XrOppFlop)),
    fig("xr_turn", "Check-Raise:turn", F(Flag::XrTurn), F(Flag::XrOppTurn)),
    fig("xr_river", "Check-Raise:river", F(Flag::XrRiver), F(Flag::XrOppRiver)),
    fig("fold_vs_donk_flop", "Fold vs Donk:flop", F(Flag::FoldVsDonkFlop), F(Flag::VsDonkOppFlop)),
    fig("fold_vs_donk_turn", "Fold vs Donk:turn", F(Flag::FoldVsDonkTurn), F(Flag::VsDonkOppTurn)),
    fig("raise_vs_donk_flop", "Raise vs Donk:flop", F(Flag::RaiseVsDonkFlop), F(Flag::VsDonkOppFlop)),
    fig("raise_vs_donk_turn", "Raise vs Donk:turn", F(Flag::RaiseVsDonkTurn), F(Flag::VsDonkOppTurn)),
    fig("vs_cbet_raised_fold", "vsCbetFlop:Raised Pot:fold", F(Flag::VsCbetRaisedFold), Cond::Never),
    fig("vs_cbet_raised_call", "vsCbetFlop:Raised Pot:call", F(Flag::VsCbetRaisedCall), Cond::Never),
    fig("vs_cbet_raised_raise", "vsCbetFlop:Raised Pot:raise", F(Flag::VsCbetRaisedRaise), Cond::Never),
    fig("vs_cbet_3bet_fold", "vsCbetFlop:3-Bet Pot:fold", F(Flag::VsCbet3BetFold), Cond::Never),
    fig("vs_cbet_3bet_call", "vsCbetFlop:3-Bet Pot:call", F(Flag::VsCbet3BetCall), Cond::Never),
    fig("vs_cbet_3bet_raise", "vsCbetFlop:3-Bet Pot:raise", F(Flag::VsCbet3BetRaise), Cond::Never),
    fig("missed_cbet", "missedCbet:missed_cbet", F(Flag::MissedCbet), F(Flag::MissedCbet)),
    fig("missed_cbet_ip", "missedCbet:ip", F(Flag::MissedCbetIp), F(Flag::MissedCbetIp)),
    fig("missed_cbet_ip_fold", "missedCbet:ip_fold", F(Flag::MissedCbetIpFold), F(Flag::MissedCbetIp)),
    fig("missed_cbet_oop", "missedCbet:oop", F(Flag::MissedCbetOop), F(Flag::MissedCbetOop)),
    fig("missed_cbet_oop_fold", "missedCbet:oop_fold", F(Flag::MissedCbetOopFold), F(Flag::MissedCbetOop)),
    fig("vs_missed_total", "vsMissedCbet:total", F(Flag::VsMissedCbet), F(Flag::VsMissedCbetOpp)),
    fig("vs_missed_bet_ip", "vsMissedCbet:bet_ip", F(Flag::VsMissedCbetBetIp), F(Flag::VsMissedCbetIp)),
    fig("vs_missed_check_fold_ip", "vsMissedCbet:check_fold_ip", F(Flag::VsMissedCbetCheckFoldIp), F(Flag::VsMissedCbetIp)),
    fig("vs_missed_bet_oop_turn", "vsMissedCbet:bet_oop_turn", F(Flag::VsMissedCbetBetOopTurn), F(Flag::VsMissedCbetOop)),
    fig("vs_missed_check_fold_oop", "vsMissedCbet:check_fold_oop", F(Flag::VsMissedCbetCheckFoldOop), F(Flag::VsMissedCbetOop)),
    fig("river_bet_total", "Bet River:total", F(Flag::RiverBet), F(Flag::RiverBetOpp)),
    fig("river_bet_ip", "Bet River:ip", Cond::InPosition(Flag::RiverBet), Cond::InPosition(Flag::RiverBetOpp)),
    fig("river_bet_oop", "Bet River:oop", Cond::OutOfPosition(Flag::RiverBet), Cond::OutOfPosition(Flag::RiverBetOpp)),
    fig("river_bet_hu_sb", "Bet River:hu_sb", Cond::HuSb(Flag::RiverBet), Cond::HuSb(Flag::RiverBetOpp)),
    fig("river_bet_hu_bb", "Bet River:hu_bb", Cond::HuBb(Flag::RiverBet), Cond::HuBb(Flag::RiverBetOpp)),
    shared("river_wsd_total", "Bet River:total", F(Flag::RiverBetWonShowdown), F(Flag::RiverBetShowdown)),
    shared("river_wsd_ip", "Bet River:ip", Cond::InPosition(Flag::RiverBetWonShowdown), Cond::InPosition(Flag::RiverBetShowdown)),
    shared("river_wsd_oop", "Bet River:oop", Cond::OutOfPosition(Flag::RiverBetWonShowdown), Cond::OutOfPosition(Flag::RiverBetShowdown)),
    shared("river_wsd_hu_sb", "Bet River:hu_sb", Cond::HuSb(Flag::RiverBetWonShowdown), Cond::HuSb(Flag::RiverBetShowdown)),
    shared("river_wsd_hu_bb", "Bet River:hu_bb", Cond::HuBb(Flag::RiverBetWonShowdown), Cond::HuBb(Flag::RiverBetShowdown)),
    fig("vs_river_call_total", "vs Bet River:call", F(Flag::VsRiverBetCall), F(Flag::VsRiverBetOpp)),
    fig("vs_river_fold_total", "vs Bet River:fold", F(Flag::VsRiverBetFold), F(Flag::VsRiverBetOpp)),
    fig("vs_river_call_ip", "vs Bet River:ip_call", Cond::InPosition(Flag::VsRiverBetCall), Cond::InPosition(Flag::VsRiverBetOpp)),
    fig("vs_river_fold_ip", "vs Bet River:ip_fold", Cond::InPosition(Flag::VsRiverBetFold), Cond::InPosition(Flag::VsRiverBetOpp)),
    fig("vs_river_call_oop", "vs Bet River:oop_call", Cond::OutOfPosition(Flag::VsRiverBetCall), Cond::OutOfPosition(Flag::VsRiverBetOpp)),
    fig("vs_river_fold_oop", "vs Bet River:oop_fold", Cond::OutOfPosition(Flag::VsRiverBetFold), Cond::OutOfPosition(Flag::VsRiverBetOpp)),
    fig("vs_river_call_hu_sb", "vs Bet River:hu_sb_call", Cond::HuSb(Flag::VsRiverBetCall), Cond::HuSb(Flag::VsRiverBetOpp)),
    fig("vs_river_fold_hu_sb", "vs Bet River:hu_sb_fold", Cond::HuSb(Flag::VsRiverBetFold), Cond::HuSb(Flag::VsRiverBetOpp)),
    fig("vs_river_call_hu_bb", "vs Bet River:hu_bb_call", Cond::HuBb(Flag::VsRiverBetCall), Cond::HuBb(Flag::VsRiverBetOpp)),
    fig("vs_river_fold_hu_bb", "vs Bet River:hu_bb_fold", Cond::HuBb(Flag::VsRiverBetFold), Cond::HuBb(Flag::VsRiverBetOpp)),
    fig("wtsd", "showdown:wtsd", F(Flag::Wtsd), F(Flag::SawFlop)),
    fig("wsd", "showdown:wsd", F(Flag::Wsd), F(Flag::Wtsd)),
    fig("wwsf", "showdown:wwsf", F(Flag::Wwsf), F(Flag::SawFlop)),
];

const STREETS: [(Street, &str); 3] = [(Street::Flop, "flop"), (Street::Turn, "turn"), (Street::River, "river")];

/// Aggression frequency: actions, not hands, are counted.
#[derive(Default, Clone, Copy)]
struct Aggression {
    aggressive: u64,
    total: u64,
}

#[derive(Clone, Copy)]
enum Where {
    All,
    InPosition,
    OutOfPosition,
}

pub(super) struct PostflopTally {
    num: Vec<u64>,
    den: Vec<u64>,
    samples: HashMap<&'static str, Vec<Rc<Sample>>>,
    aggression: [[Aggression; 3]; 3],
    aggression_samples: HashMap<(usize, usize), Vec<Rc<Sample>>>,
}

fn pct(num: u64, den: u64) -> f64 {
    if den == 0 {
        0.0
    } else {
        (100.0 * num as f64 / den as f64 * 10.0).round_ties_even() / 10.0
    }
}

impl PostflopTally {
    pub(super) fn new() -> Self {
        PostflopTally {
            num: vec![0; FIGURES.len()],
            den: vec![0; FIGURES.len()],
            samples: HashMap::new(),
            aggression: [[Aggression::default(); 3]; 3],
            aggression_samples: HashMap::new(),
        }
    }

    pub(super) fn consume(&mut self, row: &Row, shared_sample: &mut Option<Rc<Sample>>) {
        let position = row.sample.position.as_str();
        let seat = Seat {
            in_position: position == "BTN" || (row.player_count == 2 && position == "SB"),
            hu_sb: row.player_count == 2 && position == "SB",
            hu_bb: row.player_count == 2 && position == "BB",
        };

        for (i, figure) in FIGURES.iter().enumerate() {
            if figure.den.holds(&row.flags, &seat) {
                self.den[i] += 1;
            }
            if figure.num.holds(&row.flags, &seat) {
                self.num[i] += 1;
                if figure.records {
                    let list = self.samples.entry(figure.sample_key).or_default();
                    if list.len() < MAX_SAMPLE_HANDS {
                        list.push(shared_sample.get_or_insert_with(|| Rc::new(row.sample.clone())).clone());
                    }
                }
            }
        }

        // Aggression frequency, for everybody then split by position.
        let place = if seat.in_position { Where::InPosition } else { Where::OutOfPosition };
        for (s, (street, _)) in STREETS.iter().enumerate() {
            let counts = row.street_counts;
            let (aggressive, total) = (counts.aggressive(*street), counts.total(*street));
            for w in [Where::All, place] {
                let slot = &mut self.aggression[w as usize][s];
                slot.aggressive += aggressive;
                slot.total += total;
                // One example per bet or raise (a hand can appear several times, as before).
                let list = self.aggression_samples.entry((w as usize, s)).or_default();
                for _ in 0..aggressive {
                    if list.len() >= MAX_SAMPLE_HANDS {
                        break;
                    }
                    list.push(shared_sample.get_or_insert_with(|| Rc::new(row.sample.clone())).clone());
                }
            }
        }
    }

    fn find(&self, name: &str) -> usize {
        FIGURES.iter().position(|f| f.name == name).unwrap_or_else(|| panic!("unknown postflop figure {name}"))
    }

    /// `(numerator, denominator)` of a figure, `None` when no figure has this name.
    pub(super) fn try_counts(&self, name: &str) -> Option<(u64, u64)> {
        let i = FIGURES.iter().position(|f| f.name == name)?;
        Some((self.num[i], self.den[i]))
    }

    /// `(numerator, denominator)` of a figure.
    fn counts(&self, name: &str) -> (u64, u64) {
        let i = self.find(name);
        (self.num[i], self.den[i])
    }

    fn hands(&self, name: &str) -> &[Rc<Sample>] {
        let key = FIGURES[self.find(name)].sample_key;
        self.samples.get(key).map(Vec::as_slice).unwrap_or(&[])
    }

    fn sample(&self, name: &str) -> Value {
        let (num, den) = self.counts(name);
        sample_json(num, den, self.hands(name))
    }

    fn value(&self, name: &str) -> f64 {
        let (n, d) = self.counts(name);
        pct(n, d)
    }

    /// The three street columns of a figure family named `<prefix>_flop|turn|river`.
    fn by_street(&self, stat: &str, prefix: &str) -> Value {
        let col = |street: &str| format!("{prefix}_{street}");
        json!({
            "stat": stat,
            "flop": self.value(&col("flop")), "turn": self.value(&col("turn")), "river": self.value(&col("river")),
            "samples": { "flop": self.sample(&col("flop")), "turn": self.sample(&col("turn")), "river": self.sample(&col("river")) },
        })
    }

    fn aggression_row(&self, stat: &str, place: Where) -> Value {
        let cell = |s: usize| {
            let a = self.aggression[place as usize][s];
            let hands = self.aggression_samples.get(&(place as usize, s)).map(Vec::as_slice).unwrap_or(&[]);
            (pct(a.aggressive, a.total), sample_json(a.aggressive, a.total, hands))
        };
        let (flop, turn, river) = (cell(0), cell(1), cell(2));
        json!({
            "stat": stat,
            "flop": flop.0, "turn": turn.0, "river": river.0,
            "samples": { "flop": flop.1, "turn": turn.1, "river": river.1 },
        })
    }

    /// Fold / call / raise shares of the flop continuation bet answers.
    fn vs_cbet_row(&self, stat: &str, prefix: &str) -> Value {
        let parts = ["fold", "call", "raise"].map(|k| self.counts(&format!("{prefix}_{k}")).0);
        let total: u64 = parts.iter().sum();
        let hand_list = |k: &str| {
            let name = format!("{prefix}_{k}");
            sample_json(self.counts(&name).0, total, self.hands(&name))
        };
        json!({
            "stat": stat,
            "fold": pct(parts[0], total), "call": pct(parts[1], total), "raise": pct(parts[2], total),
            "samples": { "fold": hand_list("fold"), "call": hand_list("call"), "raise": hand_list("raise") },
        })
    }

    fn named(&self, entries: &[(&str, &str)]) -> (serde_json::Map<String, Value>, serde_json::Map<String, Value>) {
        let mut values = serde_json::Map::new();
        let mut samples = serde_json::Map::new();
        for (key, figure) in entries {
            values.insert((*key).into(), json!(self.value(figure)));
            samples.insert((*key).into(), self.sample(figure));
        }
        (values, samples)
    }

    /// The postflop sections, to be merged into the detailed-stats response.
    pub(super) fn sections(&self) -> Vec<(&'static str, Value)> {
        let fold_vs_donk = json!({
            "stat": "Fold vs Donk",
            "flop": self.value("fold_vs_donk_flop"), "turn": self.value("fold_vs_donk_turn"), "river": 0,
            "samples": { "flop": self.sample("fold_vs_donk_flop"), "turn": self.sample("fold_vs_donk_turn"), "river": sample_json(0, 0, &[]) },
        });
        let raise_vs_donk = json!({
            "stat": "Raise vs Donk",
            "flop": self.value("raise_vs_donk_flop"), "turn": self.value("raise_vs_donk_turn"), "river": 0,
            "samples": { "flop": self.sample("raise_vs_donk_flop"), "turn": self.sample("raise_vs_donk_turn"), "river": sample_json(0, 0, &[]) },
        });
        let postflop = vec![
            self.by_street("C-Bet", "cbet"),
            self.by_street("CBet-Fold", "cbet_fold"),
            self.by_street("Fold to CBet", "fold_to_cbet"),
            self.aggression_row("Agg Freq", Where::All),
            self.aggression_row("Agg Freq IP", Where::InPosition),
            self.aggression_row("Agg Freq OOP", Where::OutOfPosition),
            self.by_street("Donk Bet", "donk"),
            self.by_street("Donk/Fold", "donk_fold"),
            fold_vs_donk,
            raise_vs_donk,
        ];

        let (missed, missed_samples) = self.named(&[
            ("missed_cbet", "missed_cbet"),
            ("ip", "missed_cbet_ip"),
            ("ip_fold", "missed_cbet_ip_fold"),
            ("oop", "missed_cbet_oop"),
            ("oop_fold", "missed_cbet_oop_fold"),
        ]);
        let (vs_missed, vs_missed_samples) = self.named(&[
            ("total", "vs_missed_total"),
            ("bet_ip", "vs_missed_bet_ip"),
            ("check_fold_ip", "vs_missed_check_fold_ip"),
            ("bet_oop_turn", "vs_missed_bet_oop_turn"),
            ("check_fold_oop", "vs_missed_check_fold_oop"),
        ]);
        let (river, river_samples) = self.named(&[
            ("bet_total", "river_bet_total"),
            ("bet_ip", "river_bet_ip"),
            ("bet_oop", "river_bet_oop"),
            ("bet_hu_sb", "river_bet_hu_sb"),
            ("bet_hu_bb", "river_bet_hu_bb"),
            ("bet_wsd_total", "river_wsd_total"),
            ("bet_wsd_ip", "river_wsd_ip"),
            ("bet_wsd_oop", "river_wsd_oop"),
            ("bet_wsd_hu_sb", "river_wsd_hu_sb"),
            ("bet_wsd_hu_bb", "river_wsd_hu_bb"),
            ("vs_bet_call_total", "vs_river_call_total"),
            ("vs_bet_fold_total", "vs_river_fold_total"),
            ("vs_bet_call_ip", "vs_river_call_ip"),
            ("vs_bet_fold_ip", "vs_river_fold_ip"),
            ("vs_bet_call_oop", "vs_river_call_oop"),
            ("vs_bet_fold_oop", "vs_river_fold_oop"),
            ("vs_bet_call_hu_sb", "vs_river_call_hu_sb"),
            ("vs_bet_fold_hu_sb", "vs_river_fold_hu_sb"),
            ("vs_bet_call_hu_bb", "vs_river_call_hu_bb"),
            ("vs_bet_fold_hu_bb", "vs_river_fold_hu_bb"),
        ]);
        // The fold share against a river bet uses the same denominator as the call share.
        let with_samples = |mut values: serde_json::Map<String, Value>, samples: serde_json::Map<String, Value>| {
            values.insert("samples".into(), Value::Object(samples));
            Value::Object(values)
        };
        let (showdown, showdown_samples) = self.named(&[("wtsd", "wtsd"), ("wsd", "wsd"), ("wwsf", "wwsf")]);

        vec![
            ("postflop", Value::Array(postflop)),
            ("vsCbetFlop", Value::Array(vec![self.vs_cbet_row("Raised Pot", "vs_cbet_raised"), self.vs_cbet_row("3-Bet Pot", "vs_cbet_3bet")])),
            ("missedCbet", with_samples(missed, missed_samples)),
            ("vsMissedCbet", with_samples(vs_missed, vs_missed_samples)),
            ("river", with_samples(river, river_samples)),
            ("showdown", with_samples(showdown, showdown_samples)),
        ]
    }
}

/// Names of the figures that can be asked for one by one.
pub(super) fn figure_names() -> Vec<&'static str> {
    FIGURES.iter().map(|f| f.name).collect()
}

fn sample_json(num: u64, den: u64, hands: &[Rc<Sample>]) -> Value {
    json!({ "num": num, "den": den, "hands": hands.iter().map(|h| serde_json::to_value(&**h).expect("serialisable")).collect::<Vec<_>>() })
}
