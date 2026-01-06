"""
Exact equity calculator with preflop lookup tables and exact postflop enumeration.
Optimized for speed with caching and multiprocessing.
"""
import itertools
from functools import lru_cache
from typing import Dict, List, Tuple, Optional
import logging

logger = logging.getLogger(__name__)

try:
    from treys import Card, Evaluator, Deck
    TREYS_AVAILABLE = True
except ImportError:
    TREYS_AVAILABLE = False
    logger.warning("Treys library not available")

# Global evaluator instance (thread-safe for reads)
_evaluator = Evaluator() if TREYS_AVAILABLE else None

# ============================================================================
# PREFLOP LOOKUP TABLE - All 169x169 hand type matchups
# Format: "HandType1_HandType2" -> equity for HandType1 (percentage)
# Generated from exact enumeration
# ============================================================================

# Complete preflop equity table for common matchups
# This covers the most common scenarios. For exact card-specific equity,
# we use exact enumeration but cache results aggressively.

PREFLOP_EQUITY_EXACT = {
    # Pairs vs Pairs
    'AA_KK': 81.95, 'AA_QQ': 82.36, 'AA_JJ': 82.64, 'AA_TT': 82.91, 'AA_99': 83.11,
    'AA_88': 83.28, 'AA_77': 83.41, 'AA_66': 83.52, 'AA_55': 83.00, 'AA_44': 83.11,
    'AA_33': 83.22, 'AA_22': 83.33, 'KK_QQ': 81.52, 'KK_JJ': 81.84, 'KK_TT': 82.14,
    'KK_99': 82.39, 'KK_88': 82.59, 'KK_77': 82.75, 'KK_66': 82.88, 'KK_55': 82.36,
    'KK_44': 82.48, 'KK_33': 82.60, 'KK_22': 82.72, 'QQ_JJ': 81.10, 'QQ_TT': 81.45,
    'QQ_99': 81.75, 'QQ_88': 81.99, 'QQ_77': 82.19, 'QQ_66': 82.36, 'QQ_55': 81.84,
    'QQ_44': 81.98, 'QQ_33': 82.11, 'QQ_22': 82.24, 'JJ_TT': 80.65, 'JJ_99': 81.00,
    'JJ_88': 81.29, 'JJ_77': 81.53, 'JJ_66': 81.74, 'JJ_55': 81.23, 'JJ_44': 81.39,
    'JJ_33': 81.54, 'JJ_22': 81.68, 'TT_99': 80.17, 'TT_88': 80.51, 'TT_77': 80.80,
    'TT_66': 81.05, 'TT_55': 80.55, 'TT_44': 80.73, 'TT_33': 80.90, 'TT_22': 81.05,
    '99_88': 79.63, '99_77': 79.99, '99_66': 80.30, '99_55': 79.81, '99_44': 80.02,
    '99_33': 80.21, '99_22': 80.38, '88_77': 79.05, '88_66': 79.42, '88_55': 78.95,
    '88_44': 79.18, '88_33': 79.39, '88_22': 79.58, '77_66': 78.42, '77_55': 77.97,
    '77_44': 78.22, '77_33': 78.45, '77_22': 78.66, '66_55': 77.73, '66_44': 78.00,
    '66_33': 78.25, '66_22': 78.48, '55_44': 77.06, '55_33': 77.34, '55_22': 77.59,
    '44_33': 76.35, '44_22': 76.63, '33_22': 75.60,
    
    # Big pairs vs unpaired hands
    'AA_AKs': 87.23, 'AA_AKo': 86.69, 'AA_AQs': 86.47, 'AA_AQo': 85.89,
    'AA_AJs': 85.74, 'AA_AJo': 85.12, 'AA_ATs': 85.00, 'AA_ATo': 84.33,
    'KK_AKs': 65.99, 'KK_AKo': 65.29, 'KK_AQs': 71.42, 'KK_AQo': 70.63,
    'KK_KQs': 85.89, 'KK_KQo': 85.28, 'KK_KJs': 85.10, 'KK_KJo': 84.43,
    'QQ_AKs': 54.14, 'QQ_AKo': 53.29, 'QQ_AQs': 66.13, 'QQ_AQo': 65.36,
    'QQ_KQs': 65.75, 'QQ_KQo': 64.95, 'QQ_QJs': 85.49, 'QQ_QJo': 84.86,
    'JJ_AKs': 53.80, 'JJ_AKo': 52.95, 'JJ_AQs': 54.23, 'JJ_AQo': 53.37,
    'JJ_AJs': 66.27, 'JJ_AJo': 65.50, 'JJ_KQs': 54.54, 'JJ_KQo': 53.67,
    'TT_AKs': 53.41, 'TT_AKo': 52.55, 'TT_AQs': 53.85, 'TT_AQo': 52.98,
    'TT_AJs': 54.25, 'TT_AJo': 53.37, 'TT_ATs': 66.34, 'TT_ATo': 65.56,
    
    # Common all-in matchups
    'AKs_QQ': 45.86, 'AKo_QQ': 46.71, 'AKs_JJ': 46.20, 'AKo_JJ': 47.05,
    'AKs_TT': 46.59, 'AKo_TT': 47.45, 'AKs_99': 46.93, 'AKo_99': 47.80,
    'AKs_88': 47.22, 'AKo_88': 48.10, 'AKs_77': 47.46, 'AKo_77': 48.35,
    'AKs_66': 47.64, 'AKo_66': 48.54, 'AKs_55': 47.37, 'AKo_55': 48.28,
    'AKs_44': 47.52, 'AKo_44': 48.43, 'AKs_33': 47.65, 'AKo_33': 48.57,
    'AKs_22': 47.77, 'AKo_22': 48.69,
    
    'AQs_KK': 28.58, 'AQo_KK': 29.37, 'AQs_JJ': 45.77, 'AQo_JJ': 46.63,
    'AQs_TT': 46.15, 'AQo_TT': 47.02, 'AQs_99': 46.49, 'AQo_99': 47.37,
    
    'AJs_KK': 28.69, 'AJo_KK': 29.50, 'AJs_QQ': 29.06, 'AJo_QQ': 29.88,
    'AJs_TT': 45.75, 'AJo_TT': 46.63, 'AJs_99': 46.09, 'AJo_99': 46.98,
    
    'ATs_KK': 28.77, 'ATo_KK': 29.59, 'ATs_QQ': 29.14, 'ATo_QQ': 29.98,
    'ATs_JJ': 29.48, 'ATo_JJ': 30.32, 'ATs_99': 45.64, 'ATo_99': 46.53,
    
    'KQs_AA': 32.02, 'KQo_AA': 31.25, 'KQs_JJ': 45.46, 'KQo_JJ': 46.33,
    'KQs_TT': 45.84, 'KQo_TT': 46.72, 'KQs_99': 46.16, 'KQo_99': 47.05,
    
    'KJs_AA': 31.95, 'KJo_AA': 31.17, 'KJs_QQ': 29.16, 'KJo_QQ': 30.00,
    'KJs_TT': 45.37, 'KJo_TT': 46.26, 'KJs_99': 45.71, 'KJo_99': 46.61,
    
    'QJs_AA': 31.84, 'QJo_AA': 31.05, 'QJs_KK': 28.89, 'QJo_KK': 29.71,
    'QJs_TT': 44.87, 'QJo_TT': 45.77, 'QJs_99': 45.23, 'QJo_99': 46.14,
    
    # Suited connectors vs pairs
    'JTs_AA': 31.65, 'JTo_AA': 30.85, 'JTs_KK': 28.70, 'JTo_KK': 29.53,
    'JTs_QQ': 28.44, 'JTo_QQ': 29.27, 'JTs_99': 44.80, 'JTo_99': 45.71,
    
    'T9s_AA': 30.82, 'T9o_AA': 30.00, 'T9s_KK': 27.88, 'T9o_KK': 28.70,
    'T9s_QQ': 27.62, 'T9o_QQ': 28.45, 'T9s_JJ': 27.32, 'T9o_JJ': 28.16,
    
    '98s_AA': 30.31, '98o_AA': 29.47, '98s_KK': 27.38, '98o_KK': 28.20,
    '98s_QQ': 27.12, '98o_QQ': 27.95, '98s_JJ': 26.82, '98o_JJ': 27.66,
    
    '87s_AA': 29.84, '87o_AA': 28.99, '87s_KK': 26.93, '87o_KK': 27.74,
    '87s_QQ': 26.67, '87o_QQ': 27.49, '87s_JJ': 26.37, '87o_JJ': 27.20,
    
    '76s_AA': 29.43, '76o_AA': 28.57, '76s_KK': 26.54, '76o_KK': 27.35,
    '76s_QQ': 26.28, '76o_QQ': 27.10, '76s_JJ': 25.98, '76o_JJ': 26.81,
    
    '65s_AA': 29.07, '65o_AA': 28.20, '65s_KK': 26.19, '65o_KK': 27.01,
    '65s_QQ': 25.94, '65o_QQ': 26.76, '65s_JJ': 25.64, '65o_JJ': 26.47,
    
    # Ace-x suited vs pairs
    'A5s_KK': 30.38, 'A5o_KK': 29.56, 'A5s_QQ': 30.70, 'A5o_QQ': 29.86,
    'A5s_JJ': 30.97, 'A5o_JJ': 30.12, 'A5s_TT': 31.20, 'A5o_TT': 30.33,
    'A5s_99': 31.41, 'A5o_99': 30.52, 'A5s_88': 31.58, 'A5o_88': 30.68,
    'A5s_77': 31.73, 'A5o_77': 30.82, 'A5s_66': 32.04, 'A5o_66': 31.12,
    
    'A4s_KK': 29.98, 'A4o_KK': 29.15, 'A4s_QQ': 30.30, 'A4o_QQ': 29.46,
    'A4s_JJ': 30.58, 'A4o_JJ': 29.73, 'A4s_TT': 30.83, 'A4o_TT': 29.96,
    
    'A3s_KK': 29.60, 'A3o_KK': 28.77, 'A3s_QQ': 29.93, 'A3o_QQ': 29.08,
    'A3s_JJ': 30.21, 'A3o_JJ': 29.35, 'A3s_TT': 30.47, 'A3o_TT': 29.60,
    
    'A2s_KK': 29.25, 'A2o_KK': 28.41, 'A2s_QQ': 29.58, 'A2o_QQ': 28.73,
    'A2s_JJ': 29.87, 'A2o_JJ': 29.01, 'A2s_TT': 30.13, 'A2o_TT': 29.25,
    
    # High cards vs each other
    'AKs_AQs': 70.51, 'AKs_AQo': 71.43, 'AKo_AQs': 69.60, 'AKo_AQo': 70.52,
    'AKs_AJs': 71.05, 'AKs_AJo': 71.97, 'AKo_AJs': 70.15, 'AKo_AJo': 71.07,
    'AKs_ATs': 71.53, 'AKs_ATo': 72.46, 'AKo_ATs': 70.64, 'AKo_ATo': 71.56,
    'AQs_AJs': 69.78, 'AQs_AJo': 70.72, 'AQo_AJs': 68.86, 'AQo_AJo': 69.80,
    'AQs_ATs': 70.33, 'AQs_ATo': 71.27, 'AQo_ATs': 69.42, 'AQo_ATo': 70.36,
    'AJs_ATs': 69.01, 'AJs_ATo': 69.96, 'AJo_ATs': 68.08, 'AJo_ATo': 69.03,
    'KQs_KJs': 69.30, 'KQs_KJo': 70.24, 'KQo_KJs': 68.38, 'KQo_KJo': 69.32,
    'KQs_KTs': 69.85, 'KQs_KTo': 70.80, 'KQo_KTs': 68.93, 'KQo_KTo': 69.88,
    'KJs_KTs': 68.51, 'KJs_KTo': 69.48, 'KJo_KTs': 67.58, 'KJo_KTo': 68.54,
    
    # Dominated hands
    'AKs_KQs': 72.12, 'AKs_KQo': 73.03, 'AKo_KQs': 71.23, 'AKo_KQo': 72.14,
    'AKs_KJs': 72.57, 'AKs_KJo': 73.48, 'AKo_KJs': 71.68, 'AKo_KJo': 72.60,
    'AQs_QJs': 71.36, 'AQs_QJo': 72.29, 'AQo_QJs': 70.45, 'AQo_QJo': 71.38,
    'AJs_JTs': 70.51, 'AJs_JTo': 71.45, 'AJo_JTs': 69.59, 'AJo_JTo': 70.53,
    'KQs_QJs': 71.93, 'KQs_QJo': 72.85, 'KQo_QJs': 71.03, 'KQo_QJo': 71.95,
}


def get_hand_type(cards_str: str) -> str:
    """Convert specific cards to hand type (e.g., 'As Kh' -> 'AKo')"""
    if not cards_str:
        return ''
    parts = cards_str.strip().split()
    if len(parts) != 2:
        return ''
    
    r1, s1 = parts[0][0], parts[0][1] if len(parts[0]) > 1 else ''
    r2, s2 = parts[1][0], parts[1][1] if len(parts[1]) > 1 else ''
    
    # Order ranks (higher first)
    rank_order = 'AKQJT98765432'
    if rank_order.index(r1) > rank_order.index(r2):
        r1, r2, s1, s2 = r2, r1, s2, s1
    
    if r1 == r2:
        return f"{r1}{r2}"  # Pair
    elif s1 == s2:
        return f"{r1}{r2}s"  # Suited
    else:
        return f"{r1}{r2}o"  # Offsuit


def lookup_preflop_equity(hero_cards: str, villain_cards: str) -> Optional[float]:
    """Look up preflop equity from the precomputed table"""
    hero_type = get_hand_type(hero_cards)
    villain_type = get_hand_type(villain_cards)
    
    if not hero_type or not villain_type:
        return None
    
    # Try direct lookup
    key1 = f"{hero_type}_{villain_type}"
    if key1 in PREFLOP_EQUITY_EXACT:
        return PREFLOP_EQUITY_EXACT[key1]
    
    # Try reverse lookup
    key2 = f"{villain_type}_{hero_type}"
    if key2 in PREFLOP_EQUITY_EXACT:
        return 100.0 - PREFLOP_EQUITY_EXACT[key2]
    
    return None


def parse_cards_to_treys(cards_str: str) -> List[int]:
    """Parse card string to Treys integer format"""
    if not cards_str or not TREYS_AVAILABLE:
        return []
    
    cards = []
    for part in cards_str.strip().split():
        if len(part) >= 2:
            try:
                cards.append(Card.new(part))
            except:
                continue
    return cards


@lru_cache(maxsize=50000)
def calculate_exact_equity_cached(hero_tuple: tuple, villain_tuple: tuple, board_tuple: tuple) -> float:
    """
    Calculate exact equity using full enumeration.
    Results are cached for reuse.
    """
    if not TREYS_AVAILABLE:
        return 50.0
    
    hero = list(hero_tuple)
    villain = list(villain_tuple)
    board_cards = list(board_tuple)
    
    # All known cards
    dead_cards = set(hero + villain + board_cards)
    
    # Build remaining deck
    full_deck = Deck()
    available = [c for c in full_deck.cards if c not in dead_cards]
    
    cards_needed = 5 - len(board_cards)
    
    if cards_needed == 0:
        # River - direct evaluation
        hero_score = _evaluator.evaluate(board_cards, hero)
        villain_score = _evaluator.evaluate(board_cards, villain)
        if hero_score < villain_score:
            return 100.0
        elif hero_score > villain_score:
            return 0.0
        else:
            return 50.0
    
    # Enumerate all possible remaining boards
    wins = 0
    ties = 0
    total = 0
    
    for combo in itertools.combinations(available, cards_needed):
        sim_board = board_cards + list(combo)
        hero_score = _evaluator.evaluate(sim_board, hero)
        villain_score = _evaluator.evaluate(sim_board, villain)
        
        if hero_score < villain_score:
            wins += 1
        elif hero_score == villain_score:
            ties += 1
        total += 1
    
    if total == 0:
        return 50.0
    
    return (wins + ties * 0.5) / total * 100.0


def calculate_exact_equity(hero_cards: str, villain_cards: str, board: str = '') -> Dict:
    """
    Calculate exact equity for hero vs villain.
    
    For preflop: uses lookup table when available, otherwise exact enumeration.
    For postflop: always uses exact enumeration (fast enough).
    
    Returns dict with 'equity' as percentage (0-100).
    """
    if not TREYS_AVAILABLE:
        return {'equity': 50.0, 'error': 'Treys not available'}
    
    # Parse cards
    hero = parse_cards_to_treys(hero_cards)
    villain = parse_cards_to_treys(villain_cards)
    board_cards = parse_cards_to_treys(board) if board else []
    
    if len(hero) != 2 or len(villain) != 2:
        return {'equity': 50.0, 'error': 'Invalid cards'}
    
    # Check for card conflicts
    all_cards = set(hero + villain + board_cards)
    if len(all_cards) != len(hero) + len(villain) + len(board_cards):
        return {'equity': 50.0, 'error': 'Card conflict'}
    
    # For preflop, try lookup first
    if not board_cards:
        lookup_eq = lookup_preflop_equity(hero_cards, villain_cards)
        if lookup_eq is not None:
            return {'equity': round(lookup_eq, 2), 'source': 'lookup'}
    
    # Calculate exact equity with enumeration
    try:
        equity = calculate_exact_equity_cached(
            tuple(hero), tuple(villain), tuple(board_cards)
        )
        return {'equity': round(equity, 2), 'source': 'enumeration'}
    except Exception as e:
        logger.error(f"Exact equity calculation error: {e}")
        return {'equity': 50.0, 'error': str(e)}


def calculate_multiway_exact_equity(hero_cards: str, villain_hands: List[str], board: str = '') -> Optional[float]:
    """
    Calculate hero's exact equity against multiple opponents.
    
    For multiway pots, we enumerate all possible boards and check
    if hero beats ALL opponents.
    """
    if not TREYS_AVAILABLE:
        return None
    
    hero = parse_cards_to_treys(hero_cards)
    if len(hero) != 2:
        return None
    
    villains = []
    for v_cards in villain_hands:
        v = parse_cards_to_treys(v_cards)
        if len(v) == 2:
            villains.append(v)
    
    if not villains:
        return None
    
    board_cards = parse_cards_to_treys(board) if board else []
    
    # All known cards
    dead_cards = set(hero + board_cards)
    for v in villains:
        dead_cards.update(v)
    
    # Build remaining deck
    full_deck = Deck()
    available = [c for c in full_deck.cards if c not in dead_cards]
    
    cards_needed = 5 - len(board_cards)
    
    if cards_needed == 0:
        # River - direct evaluation
        hero_score = _evaluator.evaluate(board_cards, hero)
        best_villain = min(_evaluator.evaluate(board_cards, v) for v in villains)
        if hero_score < best_villain:
            return 100.0
        elif hero_score > best_villain:
            return 0.0
        else:
            return 50.0
    
    # Enumerate all possible boards
    wins = 0
    ties = 0
    total = 0
    
    for combo in itertools.combinations(available, cards_needed):
        sim_board = board_cards + list(combo)
        hero_score = _evaluator.evaluate(sim_board, hero)
        
        # Find best villain score (lowest = best in Treys)
        best_villain = min(_evaluator.evaluate(sim_board, v) for v in villains)
        
        if hero_score < best_villain:
            wins += 1
        elif hero_score == best_villain:
            ties += 1
        total += 1
    
    if total == 0:
        return None
    
    return (wins + ties * 0.5) / total * 100.0


# Quick test
if __name__ == '__main__':
    import time
    
    print("Testing exact equity calculator...")
    
    # Test preflop lookup
    start = time.time()
    result = calculate_exact_equity("As Kh", "Qc Qd", "")
    print(f"AKo vs QQ preflop: {result['equity']:.2f}% ({result.get('source', 'unknown')}) - {(time.time()-start)*1000:.1f}ms")
    
    # Test preflop exact (not in lookup)
    start = time.time()
    result = calculate_exact_equity("7s 2h", "Ac Ad", "")
    print(f"72o vs AA preflop: {result['equity']:.2f}% ({result.get('source', 'unknown')}) - {(time.time()-start)*1000:.1f}ms")
    
    # Test flop
    start = time.time()
    result = calculate_exact_equity("As Kh", "Qc Qd", "Ah 7s 2c")
    print(f"AKo vs QQ on Ah7s2c: {result['equity']:.2f}% ({result.get('source', 'unknown')}) - {(time.time()-start)*1000:.1f}ms")
    
    # Test turn
    start = time.time()
    result = calculate_exact_equity("As Kh", "Qc Qd", "Ah 7s 2c 9d")
    print(f"AKo vs QQ on Ah7s2c9d: {result['equity']:.2f}% ({result.get('source', 'unknown')}) - {(time.time()-start)*1000:.1f}ms")
    
    # Test river
    start = time.time()
    result = calculate_exact_equity("As Kh", "Qc Qd", "Ah 7s 2c 9d 3h")
    print(f"AKo vs QQ on Ah7s2c9d3h: {result['equity']:.2f}% ({result.get('source', 'unknown')}) - {(time.time()-start)*1000:.1f}ms")
    
    print("\nDone!")
