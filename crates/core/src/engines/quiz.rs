//! Pure parts of the range quiz: which hands sit on the edge of an action, and the table a
//! question is drawn on.

use std::collections::HashMap;

use crate::engines::range_scenarios::RANKS;

/// Big blind and small blind in big blinds.
const BIG_BLIND_BB: f64 = 1.0;
const SMALL_BLIND_BB: f64 = 0.5;
/// Size of a raise in front of the hero when the scenario gives none.
pub const DEFAULT_RAISE_BB: f64 = 2.0;

fn cell_of(hand: &str) -> Option<(usize, usize)> {
    let mut chars = hand.chars();
    let (a, b) = (chars.next()?, chars.next()?);
    let first = RANKS.iter().position(|r| *r == a)?;
    let second = RANKS.iter().position(|r| *r == b)?;
    Some(if hand.ends_with('o') { (second, first) } else { (first, second) })
}

fn hand_at(row: usize, col: usize) -> String {
    use std::cmp::Ordering::{Equal, Greater, Less};
    match row.cmp(&col) {
        Equal => format!("{}{}", RANKS[row], RANKS[col]),
        Less => format!("{}{}s", RANKS[row], RANKS[col]),
        Greater => format!("{}{}o", RANKS[col], RANKS[row]),
    }
}

/// The hands next to `hand` in the grid (up, down, left, right).
pub fn neighbors(hand: &str) -> Vec<String> {
    let Some((row, col)) = cell_of(hand) else { return Vec::new() };
    let last = RANKS.len() - 1;
    let mut out = Vec::new();
    if row > 0 {
        out.push(hand_at(row - 1, col));
    }
    if row < last {
        out.push(hand_at(row + 1, col));
    }
    if col > 0 {
        out.push(hand_at(row, col - 1));
    }
    if col < last {
        out.push(hand_at(row, col + 1));
    }
    out
}

/// The first neighbour of `hand` that has another action: the hand is on the edge of its action.
pub fn borderline_neighbor(hands: &HashMap<String, i64>, hand: &str) -> Option<String> {
    let own = hands.get(hand)?;
    neighbors(hand).into_iter().find(|n| hands.get(n).is_some_and(|action| action != own))
}

/// An action of a seat in front of the hero.
#[derive(Debug, Clone, PartialEq)]
pub struct SeatAction {
    pub position: String,
    /// "fold", "call", "raise" or "allin".
    pub verb: String,
    /// What a raise goes to, in big blinds.
    pub bet_bb: Option<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Seat {
    pub position: String,
    pub is_hero: bool,
    /// What is left behind after the blind and the bet.
    pub stack_bb: f64,
    pub action: Option<String>,
    pub bet_bb: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct QuizTable {
    pub seats: Vec<Seat>,
    pub pot_bb: f64,
}

fn seats_of(format: &str) -> &'static [&'static str] {
    if format == "hu" {
        &["SB", "BB"]
    } else {
        &["BTN", "SB", "BB"]
    }
}

/// The actions a stored line stands for: raises take their size from `sizes`, else the default.
pub fn actions_of_line(line: &str, sizes: &HashMap<String, f64>) -> Vec<SeatAction> {
    line.split(',')
        .filter_map(|entry| entry.split_once(':'))
        .map(|(position, verb)| {
            let position = position.to_uppercase();
            let verb = match verb {
                "call" => "call",
                "raise" | "bet" => "raise",
                "all-in" => "allin",
                _ => "fold",
            };
            let bet_bb = (verb == "raise").then(|| sizes.get(&position).copied().unwrap_or(DEFAULT_RAISE_BB));
            SeatAction { position, verb: verb.into(), bet_bb }
        })
        .collect()
}

/// The table when the hero is about to act: blinds posted, the given actions applied.
/// `stacks` are starting stacks by seat; a missing seat gets `default_stack`.
pub fn build_table(format: &str, hero: &str, actions: &[SeatAction], stacks: &HashMap<String, f64>, default_stack: f64) -> QuizTable {
    let mut seats: Vec<Seat> = seats_of(format)
        .iter()
        .map(|position| {
            let blind = match *position {
                "SB" => SMALL_BLIND_BB,
                "BB" => BIG_BLIND_BB,
                _ => 0.0,
            };
            Seat { position: position.to_string(), is_hero: *position == hero, stack_bb: stacks.get(*position).copied().unwrap_or(default_stack), action: None, bet_bb: blind }
        })
        .collect();
    for seat in &mut seats {
        seat.stack_bb -= seat.bet_bb;
    }
    let mut highest = BIG_BLIND_BB;
    for action in actions {
        let Some(seat) = seats.iter_mut().find(|s| s.position == action.position) else { continue };
        let total = seat.stack_bb + seat.bet_bb;
        let target = match action.verb.as_str() {
            "fold" => seat.bet_bb,
            "call" => highest.min(total),
            "allin" => total,
            _ => action.bet_bb.unwrap_or(DEFAULT_RAISE_BB).min(total),
        };
        seat.stack_bb = total - target;
        seat.bet_bb = target;
        seat.action = Some(action.verb.clone());
        highest = highest.max(target);
    }
    let pot_bb = seats.iter().map(|s| s.bet_bb).sum();
    QuizTable { seats, pot_bb }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn neighbors_stay_inside_the_grid() {
        assert_eq!(neighbors("AA").len(), 2);
        let mut around = neighbors("K9o");
        around.sort();
        assert_eq!(around, ["A9o", "K8o", "KTo", "Q9o"]);
        assert_eq!(neighbors("22").len(), 2);
    }

    #[test]
    fn a_hand_is_borderline_when_a_neighbour_has_another_action() {
        let mut hands: HashMap<String, i64> = crate::engines::range_scenarios::hand_classes().into_iter().map(|h| (h, 1)).collect();
        assert_eq!(borderline_neighbor(&hands, "K9o"), None);
        hands.insert("K8o".into(), 2);
        assert_eq!(borderline_neighbor(&hands, "K9o").as_deref(), Some("K8o"));
        assert!(borderline_neighbor(&hands, "K8o").is_some(), "the other side of the edge is borderline too");
    }

    #[test]
    fn bb_against_a_sb_limp_shows_the_blinds_and_the_limp() {
        let actions = actions_of_line("btn:fold,sb:call", &HashMap::new());
        let table = build_table("3max", "BB", &actions, &HashMap::new(), 22.0);
        assert_eq!(table.pot_bb, 2.0);
        let seat = |p: &str| table.seats.iter().find(|s| s.position == p).unwrap();
        assert_eq!((seat("BTN").action.as_deref(), seat("BTN").stack_bb), (Some("fold"), 22.0));
        assert_eq!((seat("SB").action.as_deref(), seat("SB").bet_bb, seat("SB").stack_bb), (Some("call"), 1.0, 21.0));
        assert_eq!((seat("BB").is_hero, seat("BB").stack_bb), (true, 21.0));
    }

    #[test]
    fn a_raise_takes_its_size_and_a_shove_the_whole_stack() {
        let sizes = HashMap::from([("BTN".to_string(), 3.0)]);
        let raise = build_table("3max", "BB", &actions_of_line("btn:raise,sb:fold", &sizes), &HashMap::new(), 20.0);
        assert_eq!(raise.pot_bb, 3.0 + 0.5 + 1.0);
        let shove = build_table("3max", "BB", &actions_of_line("btn:all-in,sb:fold", &HashMap::new()), &HashMap::new(), 8.0);
        assert_eq!(shove.seats[0].bet_bb, 8.0);
        assert_eq!(shove.seats[0].stack_bb, 0.0);
        let default = build_table("hu", "BB", &actions_of_line("sb:raise", &HashMap::new()), &HashMap::new(), 10.0);
        assert_eq!(default.pot_bb, 2.0 + 1.0);
    }

    #[test]
    fn real_stacks_replace_the_default() {
        let stacks = HashMap::from([("BB".to_string(), 12.5)]);
        let table = build_table("hu", "BB", &actions_of_line("sb:call", &HashMap::new()), &stacks, 10.0);
        assert_eq!(table.seats[1].stack_bb, 11.5);
    }
}
