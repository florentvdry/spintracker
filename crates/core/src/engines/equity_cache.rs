//! Bounded cache of equity results.
//!
//! Hands with the same cards come back often (the same all-in spots across a session), and an
//! exact preflop enumeration is expensive, so results are memoised. Keys are canonical: card
//! order inside a hand, the order of the villains, and board order do not change the result.

use std::num::NonZeroUsize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use lru::LruCache;

use super::cards::{card_to_string, parse_cards};
use super::equity::{calculate, EquityResult};
use crate::Result;

pub const DEFAULT_CAPACITY: usize = 50_000;

pub struct EquityCache {
    entries: Mutex<LruCache<String, EquityResult>>,
    hits: AtomicU64,
    misses: AtomicU64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CacheStats {
    pub hits: u64,
    pub misses: u64,
    pub size: usize,
}

impl Default for EquityCache {
    fn default() -> Self {
        Self::new(DEFAULT_CAPACITY)
    }
}

impl EquityCache {
    pub fn new(capacity: usize) -> Self {
        let capacity = NonZeroUsize::new(capacity.max(1)).expect("capacity is at least 1");
        Self { entries: Mutex::new(LruCache::new(capacity)), hits: AtomicU64::new(0), misses: AtomicU64::new(0) }
    }

    /// Cached `engines::equity::calculate`. The lock is not held while computing.
    pub fn calculate(&self, hero: &str, villains: &str, board: &str, dead: Option<&str>) -> Result<EquityResult> {
        let key = canonical_key(hero, villains, board, dead)?;
        if let Some(found) = self.entries.lock().unwrap().get(&key).copied() {
            self.hits.fetch_add(1, Ordering::Relaxed);
            return Ok(found);
        }
        self.misses.fetch_add(1, Ordering::Relaxed);
        let result = calculate(hero, villains, board, dead)?;
        self.entries.lock().unwrap().put(key, result);
        Ok(result)
    }

    pub fn clear(&self) {
        self.entries.lock().unwrap().clear();
        self.hits.store(0, Ordering::Relaxed);
        self.misses.store(0, Ordering::Relaxed);
    }

    pub fn stats(&self) -> CacheStats {
        CacheStats {
            hits: self.hits.load(Ordering::Relaxed),
            misses: self.misses.load(Ordering::Relaxed),
            size: self.entries.lock().unwrap().len(),
        }
    }
}

fn sorted_cards(text: &str) -> Result<Vec<String>> {
    let mut cards = parse_cards(text)?;
    cards.sort_unstable();
    cards.dedup();
    Ok(cards.into_iter().map(card_to_string).collect())
}

fn canonical_key(hero: &str, villains: &str, board: &str, dead: Option<&str>) -> Result<String> {
    let multiway = villains.contains('|');
    let mut villain_hands = villains.split('|').map(sorted_cards).collect::<Result<Vec<_>>>()?;
    villain_hands.sort();
    let villains_key = villain_hands.iter().map(|h| h.join("")).collect::<Vec<_>>().join("|");
    Ok(format!(
        "{}/{}{}/{}/{}",
        sorted_cards(hero)?.join(""),
        if multiway { "m:" } else { "" },
        villains_key,
        sorted_cards(board)?.join(""),
        sorted_cards(dead.unwrap_or(""))?.join("")
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equivalent_inputs_share_one_entry() {
        let cache = EquityCache::new(10);
        let a = cache.calculate("Ah Kh", "Qs Qd", "2h 7h 9c Js", None).unwrap();
        let b = cache.calculate("Kh Ah", "Qd Qs", "Js 9c 7h 2h", None).unwrap();
        assert_eq!(a, b);
        assert_eq!(cache.stats(), CacheStats { hits: 1, misses: 1, size: 1 });
    }

    #[test]
    fn villain_order_and_multiway_flag_are_part_of_the_key() {
        let cache = EquityCache::new(10);
        let ab = cache.calculate("Ah Kh", "Qs Qd|Jc Jd", "2h 7h 9c Js", None).unwrap();
        let ba = cache.calculate("Ah Kh", "Jc Jd|Qs Qd", "2h 7h 9c Js", None).unwrap();
        assert_eq!(ab, ba);
        assert_eq!(cache.stats().misses, 1);

        // A single hand written with the multiway separator is a different calculation.
        cache.calculate("Ah Kh", "Qs Qd", "2h 7h 9c Js", None).unwrap();
        cache.calculate("Ah Kh", "Qs Qd|", "2h 7h 9c Js", None).unwrap();
        assert_eq!(cache.stats().misses, 3);
    }

    #[test]
    fn least_recently_used_entry_is_evicted() {
        let cache = EquityCache::new(2);
        let board = "2h 7h 9c Js 3d";
        cache.calculate("Ah Kh", "Qs Qd", board, None).unwrap(); // A
        cache.calculate("Ac Kc", "Qh Qc", "2d 7d 9s Jh 3s", None).unwrap(); // B
        cache.calculate("Ah Kh", "Qs Qd", board, None).unwrap(); // touch A
        cache.calculate("As Ks", "Qh Qd", "2c 7c 9d Jc 3h", None).unwrap(); // C evicts B
        assert_eq!(cache.stats().size, 2);
        let before = cache.stats().misses;
        cache.calculate("Ah Kh", "Qs Qd", board, None).unwrap();
        assert_eq!(cache.stats().misses, before, "A is still cached");
        cache.calculate("Ac Kc", "Qh Qc", "2d 7d 9s Jh 3s", None).unwrap();
        assert_eq!(cache.stats().misses, before + 1, "B was evicted");
    }

    #[test]
    fn invalid_cards_are_errors_and_are_not_cached() {
        let cache = EquityCache::new(10);
        assert!(cache.calculate("Zz Kh", "Qs Qd", "", None).is_err());
        assert_eq!(cache.stats().size, 0);
    }
}
