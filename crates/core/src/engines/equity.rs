//! Exact equity by full enumeration of the remaining board cards.
//!
//! Heads-up and multiway calculations reproduce the semantics of the former C# backend,
//! including its multiway quirk: `villain_equity` there is the share of boards lost by the
//! hero outright, not the villains' combined equity.

use rayon::prelude::*;

use super::cards::{parse_cards, Card};
use super::evaluator::evaluate;
use crate::{Error, Result};

/// Percentages (0..=100).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct EquityResult {
    pub hero_equity: f64,
    pub villain_equity: f64,
    pub tie_equity: f64,
}

/// Villains supported in one multiway calculation.
const MAX_VILLAINS: usize = 9;

/// Outcome tallies. `ties[n]` counts boards where the hero ties with `n` villains for the pot.
#[derive(Default, Clone, Copy)]
struct Tally {
    hero_wins: u64,
    villain_wins: u64,
    ties: [u64; MAX_VILLAINS + 1],
}

impl Tally {
    fn merge(mut self, other: Tally) -> Tally {
        self.hero_wins += other.hero_wins;
        self.villain_wins += other.villain_wins;
        for (a, b) in self.ties.iter_mut().zip(other.ties) {
            *a += b;
        }
        self
    }

    fn total_ties(&self) -> u64 {
        self.ties.iter().sum()
    }

    fn total(&self) -> u64 {
        self.hero_wins + self.villain_wins + self.total_ties()
    }
}

struct Spot {
    hero: [Card; 2],
    villains: Vec<[Card; 2]>,
    board: Vec<Card>,
    /// Cards that can still come, ascending.
    available: Vec<Card>,
}

impl Spot {
    fn score_board(&self, full_board: &[Card; 5], tally: &mut Tally) {
        let score = |hole: &[Card; 2]| {
            let seven = [hole[0], hole[1], full_board[0], full_board[1], full_board[2], full_board[3], full_board[4]];
            evaluate(&seven)
        };
        let hero = score(&self.hero);
        let mut best = 0;
        let mut winners = 0;
        for v in &self.villains {
            let s = score(v);
            if s > best {
                best = s;
                winners = 1;
            } else if s == best {
                winners += 1;
            }
        }
        if hero > best {
            tally.hero_wins += 1;
        } else if hero == best {
            tally.ties[winners] += 1;
        } else {
            tally.villain_wins += 1;
        }
    }

    fn enumerate(&self) -> Tally {
        let avail = &self.available;
        let n = avail.len();
        let mut base = [0 as Card; 5];
        base[..self.board.len()].copy_from_slice(&self.board);

        match 5 - self.board.len() {
            0 => {
                let mut tally = Tally::default();
                self.score_board(&base, &mut tally);
                tally
            }
            1 => (0..n)
                .into_par_iter()
                .map(|i| {
                    let mut tally = Tally::default();
                    let mut board = base;
                    board[4] = avail[i];
                    self.score_board(&board, &mut tally);
                    tally
                })
                .reduce(Tally::default, Tally::merge),
            2 => (0..n.saturating_sub(1))
                .into_par_iter()
                .map(|i| {
                    let mut tally = Tally::default();
                    let mut board = base;
                    board[3] = avail[i];
                    for j in i + 1..n {
                        board[4] = avail[j];
                        self.score_board(&board, &mut tally);
                    }
                    tally
                })
                .reduce(Tally::default, Tally::merge),
            5 => (0..n.saturating_sub(4))
                .into_par_iter()
                .map(|i1| {
                    let mut tally = Tally::default();
                    let mut board = [avail[i1], 0, 0, 0, 0];
                    for i2 in i1 + 1..n {
                        board[1] = avail[i2];
                        for i3 in i2 + 1..n {
                            board[2] = avail[i3];
                            for i4 in i3 + 1..n {
                                board[3] = avail[i4];
                                for i5 in i4 + 1..n {
                                    board[4] = avail[i5];
                                    self.score_board(&board, &mut tally);
                                }
                            }
                        }
                    }
                    tally
                })
                .reduce(Tally::default, Tally::merge),
            _ => unreachable!("board length is validated"),
        }
    }
}

fn two_cards(cards: &[Card], what: &str) -> Result<[Card; 2]> {
    match cards {
        [a, b] => Ok([*a, *b]),
        _ => Err(Error::Message(format!("{what} must have exactly 2 cards"))),
    }
}

/// Calculates the equity of `hero_cards` against one villain hand, or against several hands
/// separated by `|` (for example `"AhKh|QsQd"`). `dead_cards` are removed from the deck.
pub fn calculate(hero_cards: &str, villain_cards: &str, board: &str, dead_cards: Option<&str>) -> Result<EquityResult> {
    let hero = two_cards(&parse_cards(hero_cards)?, "Hero")?;
    let board = parse_cards(board)?;
    let dead = parse_cards(dead_cards.unwrap_or(""))?;

    let multiway = villain_cards.contains('|');
    let villains: Vec<[Card; 2]> = if multiway {
        let mut hands = Vec::new();
        for part in villain_cards.split('|') {
            // Parts that are not exactly two cards are skipped, like the former backend did.
            if let [a, b] = parse_cards(part)?[..] {
                hands.push([a, b]);
            }
        }
        if hands.is_empty() {
            return Err(Error::Message("Invalid villain hands provided for multiway calculation".into()));
        }
        hands
    } else {
        vec![two_cards(&parse_cards(villain_cards)?, "Hero and villain")?]
    };
    if villains.len() > MAX_VILLAINS {
        return Err(Error::Message(format!("At most {MAX_VILLAINS} villain hands are supported")));
    }
    if !matches!(board.len(), 0 | 3 | 4 | 5) {
        return Err(Error::Message(format!("Board must have 0, 3, 4 or 5 cards, got {}", board.len())));
    }

    let mut used = 0u64;
    for &c in hero.iter().chain(villains.iter().flatten()).chain(board.iter()) {
        if used & (1 << c) != 0 {
            return Err(Error::Message("Duplicate card in hero, villain or board cards".into()));
        }
        used |= 1 << c;
    }
    // Dead cards may overlap known cards; they only remove cards from the deck.
    for &c in &dead {
        used |= 1 << c;
    }
    let available: Vec<Card> = (0..52).filter(|&c| used & (1 << c) == 0).collect();
    if available.len() < 5 - board.len() {
        return Err(Error::Message("Not enough cards left in the deck".into()));
    }

    let spot = Spot { hero, villains, board, available };
    let tally = spot.enumerate();
    let total = tally.total() as f64;
    let ties = tally.total_ties() as f64;

    if multiway {
        // Hero takes an equal share of every tied pot: 1 / (villains tied with him + 1).
        let hero_share: f64 = tally.hero_wins as f64
            + tally.ties.iter().enumerate().map(|(n, &c)| c as f64 / (n as f64 + 1.0)).sum::<f64>();
        Ok(EquityResult {
            hero_equity: hero_share / total * 100.0,
            villain_equity: tally.villain_wins as f64 / total * 100.0,
            tie_equity: ties / total * 100.0,
        })
    } else {
        Ok(EquityResult {
            hero_equity: (tally.hero_wins as f64 + ties * 0.5) / total * 100.0,
            villain_equity: (tally.villain_wins as f64 + ties * 0.5) / total * 100.0,
            tie_equity: ties / total * 100.0,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approx(a: f64, b: f64) {
        assert!((a - b).abs() < 1e-9, "{a} != {b}");
    }

    #[test]
    fn turn_flush_draw_against_overpair() {
        // 44 unseen cards: 9 hearts + 3 aces + 3 kings give the hero the win.
        let r = calculate("Ah Kh", "Qs Qd", "2h 7h 9c Js", None).unwrap();
        approx(r.hero_equity, 15.0 / 44.0 * 100.0);
        approx(r.villain_equity, 29.0 / 44.0 * 100.0);
        approx(r.tie_equity, 0.0);
    }

    #[test]
    fn dead_cards_leave_the_deck() {
        // Removing the three non-heart aces leaves 41 cards and 12 outs.
        let r = calculate("Ah Kh", "Qs Qd", "2h 7h 9c Js", Some("Ac As Ad")).unwrap();
        approx(r.hero_equity, 12.0 / 41.0 * 100.0);
    }

    #[test]
    fn complete_board_is_decided_without_enumeration() {
        let win = calculate("Ah Ad", "Kc Ks", "2c 7d 9h Js 3d", None).unwrap();
        assert_eq!((win.hero_equity, win.villain_equity, win.tie_equity), (100.0, 0.0, 0.0));
        let tie = calculate("Ah Kd", "As Kc", "2c 3c 4d 9s Jh", None).unwrap();
        assert_eq!((tie.hero_equity, tie.villain_equity, tie.tie_equity), (50.0, 50.0, 100.0));
    }

    #[test]
    fn flop_equities_sum_to_one_hundred_and_mirror() {
        let a = calculate("Ah Kh", "Qs Qd", "2h 7h 9c", None).unwrap();
        let b = calculate("Qs Qd", "Ah Kh", "2h 7h 9c", None).unwrap();
        approx(a.hero_equity + a.villain_equity, 100.0);
        approx(a.hero_equity, b.villain_equity);
        approx(a.tie_equity, b.tie_equity);
    }

    #[test]
    fn preflop_mirrored_hands_are_a_coin_flip() {
        // Swapping h<->s and d<->c maps one hand onto the other, so equity is exactly 50%.
        let r = calculate("Ah Ad", "As Ac", "", None).unwrap();
        approx(r.hero_equity, 50.0);
        approx(r.villain_equity, 50.0);
    }

    #[test]
    fn preflop_aces_against_kings() {
        let r = calculate("Ah Ad", "Kh Kd", "", None).unwrap();
        assert!((80.0..84.0).contains(&r.hero_equity), "{}", r.hero_equity);
    }

    #[test]
    fn multiway_river_follows_the_reference_semantics() {
        // Hero ties villain 1, villain 2 has nothing: hero wins half a pot, 100% tie.
        let r = calculate("Ah Kd", "As Kc|7d 8d", "2c 3c 4d 9s Jh", None).unwrap();
        approx(r.hero_equity, 50.0);
        approx(r.villain_equity, 0.0);
        approx(r.tie_equity, 100.0);

        // Hero is beaten outright.
        let r = calculate("Ah Kh", "Qs Qd|Ac As", "2h 7h 9c Js Kd", None).unwrap();
        approx(r.hero_equity, 0.0);
        approx(r.villain_equity, 100.0);
    }

    #[test]
    fn multiway_turn_never_exceeds_hundred_percent() {
        let r = calculate("Ah Kh", "Qs Qd|Jc Jd", "2h 7h 9c 3s", None).unwrap();
        assert!(r.hero_equity > 0.0 && r.hero_equity + r.villain_equity <= 100.0 + 1e-9);
    }

    #[test]
    fn invalid_input_is_rejected() {
        assert!(calculate("Ah", "Kc Ks", "", None).is_err(), "hero needs two cards");
        assert!(calculate("Ah Ad", "Kc", "", None).is_err(), "villain needs two cards");
        assert!(calculate("Ah Ad", "Ah Ks", "", None).is_err(), "duplicate card");
        assert!(calculate("Ah Ad", "Kc Ks", "2c 3c", None).is_err(), "board of two cards");
        assert!(calculate("Ah Ad", "Kc", "", None).is_err());
        assert!(calculate("Ah Ad", "Kc|Qs", "2c 3c 4c", None).is_err(), "no valid multiway hand");
        assert!(calculate("Xh Ad", "Kc Ks", "", None).is_err(), "unknown rank");
    }
}
