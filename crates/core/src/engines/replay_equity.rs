//! Equity of every player still in a hand, for the replayer: recomputed each time cards come out.

use super::equity::calculate;

/// A player whose hole cards are known.
#[derive(Debug, Clone, PartialEq)]
pub struct KnownHand {
    pub name: String,
    pub cards: String,
}

/// Equity (0..=100, ties shared) of each of `hands` against the others on `board`.
///
/// `None` when fewer than two hands are known (nothing to compare with), or when the cards cannot
/// be evaluated (a duplicate card in a damaged history).
pub fn street_equities(hands: &[KnownHand], board: &str) -> Option<Vec<(String, f64)>> {
    if hands.len() < 2 {
        return None;
    }
    hands
        .iter()
        .enumerate()
        .map(|(i, hand)| {
            let others: Vec<&str> = hands.iter().enumerate().filter(|(j, _)| *j != i).map(|(_, h)| h.cards.as_str()).collect();
            let result = calculate(&hand.cards, &others.join("|"), board, None).ok()?;
            Some((hand.name.clone(), result.hero_equity))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hand(name: &str, cards: &str) -> KnownHand {
        KnownHand { name: name.into(), cards: cards.into() }
    }

    #[test]
    fn two_players_have_equities_adding_up_to_one_hundred() {
        let equities = street_equities(&[hand("a", "AhAd"), hand("b", "KhKd")], "").unwrap();
        let total: f64 = equities.iter().map(|(_, e)| e).sum();
        assert!((total - 100.0).abs() < 1e-9);
        assert!((80.0..84.0).contains(&equities[0].1), "{equities:?}");
    }

    #[test]
    fn equity_follows_the_board() {
        let flop = street_equities(&[hand("a", "AhKh"), hand("b", "QsQd")], "2h7h9c").unwrap();
        let turn = street_equities(&[hand("a", "AhKh"), hand("b", "QsQd")], "2h7h9cJs").unwrap();
        assert!((turn[0].1 - 15.0 / 44.0 * 100.0).abs() < 1e-9);
        assert!(flop[0].1 > turn[0].1, "the draw loses value when it misses on the turn");
        let river = street_equities(&[hand("a", "AhKh"), hand("b", "QsQd")], "2h7h9cJs3d").unwrap();
        assert_eq!(river[0].1, 0.0);
        assert_eq!(river[1].1, 100.0);
    }

    #[test]
    fn three_players_share_the_pot() {
        let equities = street_equities(&[hand("a", "AhAd"), hand("b", "KhKd"), hand("c", "QhQd")], "2c7s9d").unwrap();
        let total: f64 = equities.iter().map(|(_, e)| e).sum();
        assert!((total - 100.0).abs() < 1e-6, "{equities:?}");
    }

    #[test]
    fn a_lone_known_hand_or_a_duplicate_card_gives_nothing() {
        assert!(street_equities(&[hand("a", "AhAd")], "").is_none());
        assert!(street_equities(&[hand("a", "AhAd"), hand("b", "AhKd")], "").is_none());
    }
}
