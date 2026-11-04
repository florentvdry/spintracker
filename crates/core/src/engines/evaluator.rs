//! Texas Hold'em hand evaluator for 5 to 7 cards.
//!
//! The score is the strength class of the best 5-card hand, from 1 (7-5-4-3-2 offsuit) to
//! 7462 (royal flush). Equal scores are ties. This is the same scale as the former backend
//! (`7463 - ranking` of the Cactus Kev style evaluator), so a higher score always wins.

use std::sync::OnceLock;

use super::cards::{rank, suit, Card};

pub const MAX_SCORE: u16 = 7462;

// Number of strength classes in each category, weakest to strongest:
// high card 1277, pair 2860, two pair 858, trips 858, straight 10, flush 1277,
// full house 156, quads 156, straight flush 10.
const PAIR_BASE: u16 = 1277;
const TWO_PAIR_BASE: u16 = PAIR_BASE + 2860;
const TRIPS_BASE: u16 = TWO_PAIR_BASE + 858;
const STRAIGHT_BASE: u16 = TRIPS_BASE + 858;
const FLUSH_BASE: u16 = STRAIGHT_BASE + 10;
const FULL_HOUSE_BASE: u16 = FLUSH_BASE + 1277;
const QUADS_BASE: u16 = FULL_HOUSE_BASE + 156;
const STRAIGHT_FLUSH_BASE: u16 = QUADS_BASE + 156;

const WHEEL: u16 = 0b1_0000_0000_1111; // A, 5, 4, 3, 2

struct Tables {
    /// 13-bit rank mask of 5 distinct non-straight ranks -> 1..=1277.
    five_distinct: Vec<u16>,
    /// Packed base-13 keys -> 1-based index inside the category.
    pair: Vec<u16>,      // pair, k1, k2, k3
    two_pair: Vec<u16>,  // high pair, low pair, kicker
    trips: Vec<u16>,     // trips, k1, k2
    full_house: Vec<u16>, // trips, pair
    quads: Vec<u16>,     // quads, kicker
}

fn tables() -> &'static Tables {
    static TABLES: OnceLock<Tables> = OnceLock::new();
    TABLES.get_or_init(build_tables)
}

fn build_tables() -> Tables {
    // Masks are enumerated in ascending numeric order, which is also ascending strength
    // for distinct-rank hands (the highest card dominates).
    let mut five_distinct = vec![0u16; 1 << 13];
    let mut next = 0u16;
    for mask in 0u16..(1 << 13) {
        if mask.count_ones() == 5 && straight_top(mask).is_none() {
            next += 1;
            five_distinct[mask as usize] = next;
        }
    }
    debug_assert_eq!(next, 1277);

    let mut pair = vec![0u16; 13 * 13 * 13 * 13];
    let mut n = 0;
    for p in 0..13usize {
        for k1 in (0..13).filter(|&k| k != p) {
            for k2 in (0..k1).filter(|&k| k != p) {
                for k3 in (0..k2).filter(|&k| k != p) {
                    n += 1;
                    pair[((p * 13 + k1) * 13 + k2) * 13 + k3] = n;
                }
            }
        }
    }
    debug_assert_eq!(n, 2860);

    let mut two_pair = vec![0u16; 13 * 13 * 13];
    n = 0;
    for hi in 0..13usize {
        for lo in 0..hi {
            for k in (0..13).filter(|&k| k != hi && k != lo) {
                n += 1;
                two_pair[(hi * 13 + lo) * 13 + k] = n;
            }
        }
    }
    debug_assert_eq!(n, 858);

    let mut trips = vec![0u16; 13 * 13 * 13];
    n = 0;
    for t in 0..13usize {
        for k1 in (0..13).filter(|&k| k != t) {
            for k2 in (0..k1).filter(|&k| k != t) {
                n += 1;
                trips[(t * 13 + k1) * 13 + k2] = n;
            }
        }
    }
    debug_assert_eq!(n, 858);

    let mut full_house = vec![0u16; 13 * 13];
    let mut quads = vec![0u16; 13 * 13];
    let (mut fh, mut q) = (0, 0);
    for a in 0..13usize {
        for b in (0..13).filter(|&b| b != a) {
            fh += 1;
            full_house[a * 13 + b] = fh;
            q += 1;
            quads[a * 13 + b] = q;
        }
    }
    debug_assert_eq!((fh, q), (156, 156));

    Tables { five_distinct, pair, two_pair, trips, full_house, quads }
}

/// Index 1..=10 of the highest straight in a rank mask (1 = wheel, 10 = ace high).
fn straight_top(mask: u16) -> Option<u16> {
    for top in (4..=12u16).rev() {
        let run = 0b11111u16 << (top - 4);
        if mask & run == run {
            return Some(top - 2);
        }
    }
    (mask & WHEEL == WHEEL).then_some(1)
}

/// Highest `n` set bits of `mask`, as ranks in descending order.
fn top_ranks(mut mask: u16, out: &mut [usize]) {
    for slot in out.iter_mut() {
        let r = 15 - mask.leading_zeros() as usize;
        *slot = r;
        mask &= !(1 << r);
    }
}

/// Keeps only the 5 highest ranks of a mask.
fn top_five_mask(mut mask: u16) -> u16 {
    while mask.count_ones() > 5 {
        mask &= mask - 1; // clear the lowest set bit
    }
    mask
}

/// Evaluates the best 5-card hand among 5 to 7 distinct cards.
pub fn evaluate(cards: &[Card]) -> u16 {
    debug_assert!((5..=7).contains(&cards.len()));
    let t = tables();

    let mut counts = [0u8; 13];
    let mut suit_masks = [0u16; 4];
    let mut suit_counts = [0u8; 4];
    let mut rank_mask = 0u16;
    for &c in cards {
        let (r, s) = (rank(c), suit(c));
        counts[r] += 1;
        suit_masks[s] |= 1 << r;
        suit_counts[s] += 1;
        rank_mask |= 1 << r;
    }

    // With 7 cards a flush can never coexist with quads or a full house, so it only has to be
    // compared with straight flushes.
    if let Some(s) = (0..4).find(|&s| suit_counts[s] >= 5) {
        let mask = suit_masks[s];
        if let Some(top) = straight_top(mask) {
            return STRAIGHT_FLUSH_BASE + top;
        }
        return FLUSH_BASE + t.five_distinct[top_five_mask(mask) as usize];
    }

    let mut quads = None;
    let mut trips = [0usize; 2];
    let mut n_trips = 0;
    let mut pairs = [0usize; 3];
    let mut n_pairs = 0;
    for r in (0..13).rev() {
        match counts[r] {
            4 => quads = Some(r),
            3 if n_trips < 2 => {
                trips[n_trips] = r;
                n_trips += 1;
            }
            2 if n_pairs < 3 => {
                pairs[n_pairs] = r;
                n_pairs += 1;
            }
            _ => {}
        }
    }

    if let Some(q) = quads {
        let kicker_mask = rank_mask & !(1 << q);
        let mut k = [0usize; 1];
        top_ranks(kicker_mask, &mut k);
        return QUADS_BASE + t.quads[q * 13 + k[0]];
    }

    if n_trips > 0 && (n_trips > 1 || n_pairs > 0) {
        // The pair of the full house is the better of the second trips and the best pair.
        let pair_rank = match (n_trips > 1, n_pairs > 0) {
            (true, true) => trips[1].max(pairs[0]),
            (true, false) => trips[1],
            _ => pairs[0],
        };
        return FULL_HOUSE_BASE + t.full_house[trips[0] * 13 + pair_rank];
    }

    if let Some(top) = straight_top(rank_mask) {
        return STRAIGHT_BASE + top;
    }

    if n_trips == 1 {
        let mut k = [0usize; 2];
        top_ranks(rank_mask & !(1 << trips[0]), &mut k);
        return TRIPS_BASE + t.trips[(trips[0] * 13 + k[0]) * 13 + k[1]];
    }

    if n_pairs >= 2 {
        let (hi, lo) = (pairs[0], pairs[1]);
        let mut k = [0usize; 1];
        top_ranks(rank_mask & !(1 << hi) & !(1 << lo), &mut k);
        return TWO_PAIR_BASE + t.two_pair[(hi * 13 + lo) * 13 + k[0]];
    }

    if n_pairs == 1 {
        let mut k = [0usize; 3];
        top_ranks(rank_mask & !(1 << pairs[0]), &mut k);
        return PAIR_BASE + t.pair[((pairs[0] * 13 + k[0]) * 13 + k[1]) * 13 + k[2]];
    }

    t.five_distinct[top_five_mask(rank_mask) as usize]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engines::cards::parse_cards;

    fn score(hand: &str) -> u16 {
        evaluate(&parse_cards(hand).unwrap())
    }

    #[test]
    fn category_boundaries() {
        assert_eq!(score("7c 5d 4h 3s 2c"), 1, "worst hand");
        assert_eq!(score("Ah Kh Qh Jh Th"), MAX_SCORE, "royal flush");
        assert_eq!(score("Ah 2h 3h 4h 5h"), STRAIGHT_FLUSH_BASE + 1, "steel wheel");
        assert_eq!(score("Ah Ad Ac As Kh"), MAX_SCORE - 10, "best quads");
        assert_eq!(score("2h 2d 2c 2s 3h"), QUADS_BASE + 1, "worst quads");
        assert_eq!(score("Ah Ad Ac Ks Kh"), QUADS_BASE, "best full house");
        assert_eq!(score("Ah 2d 3c 4s 5h"), STRAIGHT_BASE + 1, "wheel");
        assert_eq!(score("Ah Kd Qc Js Th"), STRAIGHT_BASE + 10, "broadway");
    }

    #[test]
    fn ordering_between_categories_and_kickers() {
        assert!(score("Ah Ad Kc Qs Jh") > score("Kh Kd Ac Qs Jh"), "pair of aces beats pair of kings");
        assert!(score("Ah Ad Kc Qs Jh") > score("Ah Ad Kc Qs Th"), "kicker decides");
        assert!(score("Ah Ad Kc Ks 2h") > score("Ah Ad Qc Qs Kh"), "second pair decides");
        assert!(score("2h 2d 2c Ks Kh") > score("Ah Ad Ac Qs Jh"), "full house beats trips");
        assert!(score("Ah 3h 7h 9h Jh") > score("Ah Kd Qc Js Th"), "flush beats straight");
        assert!(score("Ah 2d 3c 4s 5h") < score("2h 3d 4c 5s 6h"), "wheel is the lowest straight");
    }

    #[test]
    fn seven_card_hands_pick_the_best_five() {
        // Two trips -> full house with the lower trips as pair.
        assert_eq!(score("Ah Ad Ac Kh Kd Ks 2c"), score("Ah Ad Ac Kh Kd"));
        // Three pairs -> best two pairs plus the best remaining kicker (from the third pair).
        assert_eq!(score("Ah Ad Kc Ks Qh Qd 2c"), score("Ah Ad Kc Ks Qh"));
        // Flush with a 6th card of the suit uses the best five.
        assert_eq!(score("Ah Kh Qh Jh 9h 2h 3c"), score("Ah Kh Qh Jh 9h"));
        // Straight beats trips.
        assert_eq!(score("9h Td Jc Qs Kh Kd Kc"), STRAIGHT_BASE + 9);
        // Wheel with a six-high straight available uses the higher one.
        assert_eq!(score("Ah 2d 3c 4s 5h 6d 9c"), STRAIGHT_BASE + 2);
    }

    #[test]
    fn exhaustive_five_card_distribution() {
        // Number of 5-card hands per category and number of distinct strength classes.
        let mut seen = vec![false; MAX_SCORE as usize + 1];
        let mut per_category = [0u32; 9];
        let bounds = [
            PAIR_BASE, TWO_PAIR_BASE, TRIPS_BASE, STRAIGHT_BASE, FLUSH_BASE,
            FULL_HOUSE_BASE, QUADS_BASE, STRAIGHT_FLUSH_BASE, MAX_SCORE,
        ];
        for a in 0..48u8 {
            for b in a + 1..49 {
                for c in b + 1..50 {
                    for d in c + 1..51 {
                        for e in d + 1..52 {
                            let s = evaluate(&[a, b, c, d, e]);
                            assert!((1..=MAX_SCORE).contains(&s));
                            seen[s as usize] = true;
                            per_category[bounds.iter().position(|&b| s <= b).unwrap()] += 1;
                        }
                    }
                }
            }
        }
        assert_eq!(seen[1..].iter().filter(|&&x| x).count(), 7462);
        // high card, pair, two pair, trips, straight, flush, full house, quads, straight flush
        assert_eq!(
            per_category,
            [1_302_540, 1_098_240, 123_552, 54_912, 10_200, 5_108, 3_744, 624, 40]
        );
    }

    #[test]
    fn seven_cards_equal_best_of_the_21_five_card_subsets() {
        let mut state = 0x9E37_79B9_7F4A_7C15u64;
        let mut next = || {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            state
        };
        for _ in 0..20_000 {
            let mut deck: Vec<u8> = (0..52).collect();
            for i in 0..7 {
                let j = i + (next() % (52 - i as u64)) as usize;
                deck.swap(i, j);
            }
            let seven = &deck[..7];
            let mut best = 0;
            for skip_a in 0..7 {
                for skip_b in skip_a + 1..7 {
                    let five: Vec<u8> = (0..7).filter(|&i| i != skip_a && i != skip_b).map(|i| seven[i]).collect();
                    best = best.max(evaluate(&five));
                }
            }
            assert_eq!(evaluate(seven), best, "hand {seven:?}");
        }
    }
}
