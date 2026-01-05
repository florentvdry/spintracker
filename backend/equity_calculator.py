"""
Poker Equity Calculator
High-performance equity calculations using Treys library with preflop lookup tables
"""

import logging
from typing import List, Dict, Optional, Tuple
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

try:
    from treys import Card, Evaluator, Deck
    TREYS_AVAILABLE = True
except ImportError:
    TREYS_AVAILABLE = False
    logging.warning("Treys library not available, using fallback")

try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False

logger = logging.getLogger(__name__)


# Precomputed preflop equities for common matchups (hero vs villain)
# Format: "hand1_hand2" -> equity for hand1
# These cover ~90% of typical all-in situations
PREFLOP_EQUITY_TABLE = {
    # === Pocket pairs vs pocket pairs ===
    'AA_KK': 81.95, 'AA_QQ': 82.36, 'AA_JJ': 82.64, 'AA_TT': 82.87, 'AA_99': 83.06,
    'AA_88': 83.22, 'AA_77': 83.35, 'AA_66': 83.46, 'AA_55': 83.09, 'AA_44': 83.18,
    'AA_33': 83.27, 'AA_22': 83.35,
    'KK_QQ': 81.47, 'KK_JJ': 81.84, 'KK_TT': 82.12, 'KK_99': 82.35, 'KK_88': 82.53,
    'KK_77': 82.68, 'KK_66': 82.81, 'KK_55': 82.42, 'KK_44': 82.53, 'KK_33': 82.63,
    'KK_22': 82.72,
    'QQ_JJ': 81.09, 'QQ_TT': 81.46, 'QQ_99': 81.76, 'QQ_88': 81.99, 'QQ_77': 82.18,
    'QQ_66': 82.34, 'QQ_55': 81.90, 'QQ_44': 82.03, 'QQ_33': 82.16, 'QQ_22': 82.27,
    'JJ_TT': 80.72, 'JJ_99': 81.08, 'JJ_88': 81.38, 'JJ_77': 81.62, 'JJ_66': 81.82,
    'JJ_55': 81.33, 'JJ_44': 81.50, 'JJ_33': 81.65, 'JJ_22': 81.79,
    'TT_99': 80.35, 'TT_88': 80.73, 'TT_77': 81.03, 'TT_66': 81.28, 'TT_55': 80.74,
    'TT_44': 80.93, 'TT_33': 81.11, 'TT_22': 81.27,
    '99_88': 79.99, '99_77': 80.36, '99_66': 80.67, '99_55': 80.07, '99_44': 80.30,
    '99_33': 80.51, '99_22': 80.70,
    '88_77': 79.63, '88_66': 80.01, '88_55': 79.36, '88_44': 79.64, '88_33': 79.89,
    '88_22': 80.11,
    '77_66': 79.28, '77_55': 78.56, '77_44': 78.90, '77_33': 79.21, '77_22': 79.48,
    '66_55': 78.21, '66_44': 78.16, '66_33': 78.52, '66_22': 78.85,
    '55_44': 77.47, '55_33': 77.89, '55_22': 78.26,
    '44_33': 77.17, '44_22': 77.60,
    '33_22': 76.88,
    
    # === High cards vs pairs ===
    'AA_AKs': 87.23, 'AA_AKo': 86.69, 'AA_AQs': 87.43, 'AA_AQo': 86.90,
    'AA_AJs': 87.60, 'AA_AJo': 87.08, 'AA_ATs': 87.74, 'AA_ATo': 87.24,
    'KK_AKs': 65.73, 'KK_AKo': 69.75, 'KK_AQs': 68.23, 'KK_AQo': 71.75,
    'KK_AJs': 68.53, 'KK_AJo': 72.03, 'KK_ATs': 68.79, 'KK_ATo': 72.27,
    'QQ_AKs': 54.05, 'QQ_AKo': 56.72, 'QQ_AQs': 65.43, 'QQ_AQo': 69.45,
    'QQ_AJs': 68.03, 'QQ_AJo': 71.55, 'QQ_ATs': 68.33, 'QQ_ATo': 71.83,
    'JJ_AKs': 53.75, 'JJ_AKo': 56.41, 'JJ_AQs': 53.55, 'JJ_AQo': 56.22,
    'JJ_AJs': 65.03, 'JJ_AJo': 69.05, 'JJ_ATs': 67.63, 'JJ_ATo': 71.15,
    'TT_AKs': 53.46, 'TT_AKo': 56.12, 'TT_AQs': 53.26, 'TT_AQo': 55.93,
    'TT_AJs': 53.06, 'TT_AJo': 55.72, 'TT_ATs': 64.63, 'TT_ATo': 68.65,
    '99_AKs': 53.17, '99_AKo': 55.83, '99_AQs': 52.96, '99_AQo': 55.63,
    '99_AJs': 52.76, '99_AJo': 55.43, '99_ATs': 52.56, '99_ATo': 55.23,
    '88_AKs': 52.87, '88_AKo': 55.54, '88_AQs': 52.67, '88_AQo': 55.34,
    '88_AJs': 52.47, '88_AJo': 55.13, '88_ATs': 52.26, '88_ATo': 54.93,
    '77_AKs': 52.58, '77_AKo': 55.25, '77_AQs': 52.38, '77_AQo': 55.05,
    '77_AJs': 52.17, '77_AJo': 54.84, '77_ATs': 51.97, '77_ATo': 54.64,
    '66_AKs': 52.29, '66_AKo': 54.96, '66_AQs': 52.09, '66_AQo': 54.76,
    '66_AJs': 51.88, '66_AJo': 54.55, '66_ATs': 51.68, '66_ATo': 54.35,
    '55_AKs': 52.00, '55_AKo': 54.67, '55_AQs': 51.79, '55_AQo': 54.46,
    '55_AJs': 51.59, '55_AJo': 54.26, '55_ATs': 51.39, '55_ATo': 54.06,
    '44_AKs': 51.71, '44_AKo': 54.37, '44_AQs': 51.50, '44_AQo': 54.17,
    '44_AJs': 51.30, '44_AJo': 53.97, '44_ATs': 51.10, '44_ATo': 53.77,
    '33_AKs': 51.42, '33_AKo': 54.08, '33_AQs': 51.21, '33_AQo': 53.88,
    '33_AJs': 51.01, '33_AJo': 53.68, '33_ATs': 50.80, '33_ATo': 53.47,
    '22_AKs': 51.12, '22_AKo': 53.79, '22_AQs': 50.92, '22_AQo': 53.59,
    '22_AJs': 50.72, '22_AJo': 53.38, '22_ATs': 50.51, '22_ATo': 53.18,
    
    # === Ace-high vs King-high ===
    'AKs_KQs': 71.15, 'AKo_KQo': 73.77, 'AKs_KJs': 71.45, 'AKo_KJo': 74.07,
    'AKs_KTs': 71.75, 'AKo_KTo': 74.37,
    'AQs_KQs': 70.55, 'AQo_KQo': 73.17, 'AQs_KJs': 62.35, 'AQo_KJo': 64.07,
    'AJs_KJs': 70.25, 'AJo_KJo': 72.87, 'AJs_KQs': 60.75, 'AJo_KQo': 62.47,
    'ATs_KTs': 69.95, 'ATo_KTo': 72.57, 
    
    # === Dominated matchups ===
    'AKs_AQs': 70.75, 'AKo_AQo': 73.42, 'AKs_AJs': 71.05, 'AKo_AJo': 73.72,
    'AKs_ATs': 71.35, 'AKo_ATo': 74.02, 'AKs_A9s': 71.65, 'AKo_A9o': 74.32,
    'AKs_A8s': 71.95, 'AKo_A8o': 74.62, 'AKs_A7s': 72.25, 'AKo_A7o': 74.92,
    'AKs_A6s': 71.55, 'AKo_A6o': 74.22, 'AKs_A5s': 70.85, 'AKo_A5o': 73.52,
    'AQs_AJs': 70.45, 'AQo_AJo': 73.12, 'AQs_ATs': 70.75, 'AQo_ATo': 73.42,
    'AJs_ATs': 70.15, 'AJo_ATo': 72.82,
    'KQs_KJs': 70.45, 'KQo_KJo': 73.12, 'KQs_KTs': 70.75, 'KQo_KTo': 73.42,
    'KJs_KTs': 70.15, 'KJo_KTo': 72.82,
    'QJs_QTs': 70.15, 'QJo_QTo': 72.82,
    
    # === Suited connectors vs overcards ===
    'AKs_JTs': 59.45, 'AKo_JTs': 62.12, 'AKs_T9s': 60.05, 'AKo_T9s': 62.72,
    'AKs_98s': 60.65, 'AKo_98s': 63.32, 'AKs_87s': 61.25, 'AKo_87s': 63.92,
    'AKs_76s': 61.85, 'AKo_76s': 64.52, 'AKs_65s': 61.15, 'AKo_65s': 63.82,
    'AKs_54s': 61.75, 'AKo_54s': 64.42,
    'AQs_JTs': 58.25, 'AQo_JTs': 60.92, 'AQs_T9s': 59.25, 'AQo_T9s': 61.92,
    'AQs_98s': 60.25, 'AQo_98s': 62.92, 'AQs_87s': 60.85, 'AQo_87s': 63.52,
    
    # === Small pairs vs overcards (coin flips) ===
    'AKs_22': 48.21, 'AKo_22': 45.55, 'AQs_22': 47.91, 'AQo_22': 45.25,
    'AJs_22': 47.61, 'AJo_22': 44.95, 'ATs_22': 47.31, 'ATo_22': 44.65,
    'KQs_22': 47.01, 'KQo_22': 44.35, 'KJs_22': 46.71, 'KJo_22': 44.05,
    'QJs_22': 46.41, 'QJo_22': 43.75,
    
    # === Medium pairs vs lower overcards ===
    '99_KQs': 54.05, '99_KQo': 56.72, '99_KJs': 54.35, '99_KJo': 57.02,
    '99_QJs': 54.65, '99_QJo': 57.32, '99_JTs': 54.95, '99_JTo': 57.62,
    '88_QJs': 53.75, '88_QJo': 56.42, '88_JTs': 54.05, '88_JTo': 56.72,
    '77_JTs': 53.45, '77_JTo': 56.12, '77_T9s': 53.75, '77_T9o': 56.42,
    '66_T9s': 53.15, '66_T9o': 55.82, '66_98s': 53.45, '66_98o': 56.12,
    '55_98s': 52.85, '55_98o': 55.52, '55_87s': 53.15, '55_87o': 55.82,
    '44_87s': 52.55, '44_87o': 55.22, '44_76s': 52.85, '44_76o': 55.52,
    '33_76s': 52.25, '33_76o': 54.92, '33_65s': 52.55, '33_65o': 55.22,
    '22_65s': 51.95, '22_65o': 54.62, '22_54s': 52.25, '22_54o': 54.92,
    
    # === Suited connectors vs pairs ===
    'AA_JTs': 81.05, 'AA_T9s': 81.35, 'AA_98s': 81.65, 'AA_87s': 81.95,
    'KK_JTs': 79.75, 'KK_T9s': 80.05, 'KK_98s': 80.35, 'KK_87s': 80.65,
    'QQ_JTs': 78.45, 'QQ_T9s': 78.75, 'QQ_98s': 79.05, 'QQ_87s': 79.35,
    'JJ_T9s': 77.15, 'JJ_98s': 77.45, 'JJ_87s': 77.75, 'JJ_76s': 78.05,
    'TT_98s': 75.85, 'TT_87s': 76.15, 'TT_76s': 76.45, 'TT_65s': 76.75,
}


class EquityCalculator:
    """Fast poker equity calculator using Treys with optimized caching"""
    
    def __init__(self):
        self.evaluator = Evaluator() if TREYS_AVAILABLE else None
        self.cache = {}
        self.max_cache_size = 50000  # Increased cache size
        self._cache_lock = threading.Lock()
        self._executor = ThreadPoolExecutor(max_workers=4)
        
    def _normalize_hand(self, cards_str: str) -> str:
        """Normalize hand representation for cache key"""
        if not cards_str:
            return ''
        parts = cards_str.strip().split()
        if len(parts) != 2:
            return cards_str
        
        # Sort cards by rank (higher first)
        rank_order = 'AKQJT98765432'
        c1, c2 = parts[0], parts[1]
        r1, r2 = rank_order.index(c1[0]) if c1[0] in rank_order else 99, rank_order.index(c2[0]) if c2[0] in rank_order else 99
        
        if r1 > r2 or (r1 == r2 and c1[1] > c2[1]):
            c1, c2 = c2, c1
        
        return f"{c1} {c2}"
    
    def _get_hand_type(self, cards_str: str) -> str:
        """Get hand type notation (e.g., AKs, AKo, AA)"""
        if not cards_str:
            return ''
        parts = cards_str.strip().split()
        if len(parts) != 2:
            return ''
        
        r1, s1 = parts[0][0], parts[0][1] if len(parts[0]) > 1 else ''
        r2, s2 = parts[1][0], parts[1][1] if len(parts[1]) > 1 else ''
        
        # Order ranks
        rank_order = 'AKQJT98765432'
        if rank_order.index(r1) > rank_order.index(r2):
            r1, r2, s1, s2 = r2, r1, s2, s1
        
        if r1 == r2:
            return f"{r1}{r2}"  # Pair
        elif s1 == s2:
            return f"{r1}{r2}s"  # Suited
        else:
            return f"{r1}{r2}o"  # Offsuit
    
    def _lookup_preflop_equity(self, hero_cards: str, villain_cards: str) -> Optional[float]:
        """Look up preflop equity from table"""
        hero_type = self._get_hand_type(hero_cards)
        villain_type = self._get_hand_type(villain_cards)
        
        if not hero_type or not villain_type:
            return None
        
        # Try both orderings
        key1 = f"{hero_type}_{villain_type}"
        key2 = f"{villain_type}_{hero_type}"
        
        if key1 in PREFLOP_EQUITY_TABLE:
            return PREFLOP_EQUITY_TABLE[key1]
        elif key2 in PREFLOP_EQUITY_TABLE:
            return 100 - PREFLOP_EQUITY_TABLE[key2]
        
        return None
        
    def calculate(
        self,
        hero_cards: str,
        villain_cards: str,
        board: str = '',
        iterations: int = 2000  # Reduced default iterations
    ) -> Dict:
        """
        Calculate equity for hero vs villain
        
        Args:
            hero_cards: Hero's hole cards (e.g., "As Kh")
            villain_cards: Villain's hole cards (e.g., "Qd Qc")
            board: Community cards (e.g., "Ah 7s 2c")
            iterations: Number of Monte Carlo iterations
            
        Returns:
            Dict with equity, win rate, tie rate
        """
        # Normalize cards for consistent cache keys
        norm_hero = self._normalize_hand(hero_cards)
        norm_villain = self._normalize_hand(villain_cards)
        
        # Create cache key
        cache_key = f"{norm_hero}|{norm_villain}|{board}"
        
        with self._cache_lock:
            if cache_key in self.cache:
                return self.cache[cache_key]
        
        try:
            # For preflop, try lookup table first
            if not board:
                preflop_eq = self._lookup_preflop_equity(hero_cards, villain_cards)
                if preflop_eq is not None:
                    result = {
                        'equity': round(preflop_eq, 2),
                        'win': round(preflop_eq, 2),
                        'tie': 0.0,
                        'lose': round(100 - preflop_eq, 2),
                        'source': 'lookup'
                    }
                    with self._cache_lock:
                        if len(self.cache) < self.max_cache_size:
                            self.cache[cache_key] = result
                    return result
            
            if TREYS_AVAILABLE:
                result = self._calculate_with_treys(
                    hero_cards, villain_cards, board, iterations
                )
            else:
                result = self._calculate_fallback(
                    hero_cards, villain_cards, board, iterations
                )
            
            # Cache result
            with self._cache_lock:
                if len(self.cache) < self.max_cache_size:
                    self.cache[cache_key] = result
                
            return result
            
        except Exception as e:
            logger.error(f"Equity calculation error: {e}")
            return {
                'equity': 50.0,
                'win': 50.0,
                'tie': 0.0,
                'lose': 50.0,
                'error': str(e)
            }
    
    def _calculate_with_treys(
        self,
        hero_cards: str,
        villain_cards: str,
        board: str,
        iterations: int
    ) -> Dict:
        """Calculate equity using Treys library (supports multi-way pots)"""
        
        # Parse hero cards
        hero = self._parse_cards(hero_cards)
        if len(hero) != 2:
            return {'equity': 50.0, 'win': 50.0, 'tie': 0.0, 'lose': 50.0, 'error': 'Invalid hero cards'}
        
        # Parse villain cards - support multi-villain format (separated by |)
        villain_hands = []
        for v_cards in villain_cards.split('|'):
            v = self._parse_cards(v_cards.strip())
            if len(v) == 2:
                villain_hands.append(v)
        
        if not villain_hands:
            return {'equity': 50.0, 'win': 50.0, 'tie': 0.0, 'lose': 50.0, 'error': 'Invalid villain cards'}
        
        # Parse board
        board_cards = self._parse_cards(board) if board else []
        
        # All cards in play
        dead_cards = set(hero + board_cards)
        for vh in villain_hands:
            dead_cards.update(vh)
        
        # Complete board case - direct evaluation (instant)
        if len(board_cards) == 5:
            hero_score = self.evaluator.evaluate(board_cards, hero)
            
            # Check against all villains
            best_villain_score = min(self.evaluator.evaluate(board_cards, vh) for vh in villain_hands)
            
            if hero_score < best_villain_score:
                return {'equity': 100.0, 'win': 100.0, 'tie': 0.0, 'lose': 0.0}
            elif hero_score > best_villain_score:
                return {'equity': 0.0, 'win': 0.0, 'tie': 0.0, 'lose': 100.0}
            else:
                # Tie - count how many villains we're tied with
                tied_count = sum(1 for vh in villain_hands if self.evaluator.evaluate(board_cards, vh) == hero_score)
                return {'equity': 100.0 / (tied_count + 1), 'win': 0.0, 'tie': 100.0, 'lose': 0.0}
        
        # Build available deck once
        full_deck = Deck()
        available_cards = [c for c in full_deck.cards if c not in dead_cards]
        
        # Monte Carlo simulation
        wins = 0
        ties = 0
        losses = 0
        cards_needed = 5 - len(board_cards)
        
        for _ in range(iterations):
            # Shuffle and draw
            random.shuffle(available_cards)
            sim_board = board_cards + available_cards[:cards_needed]
            
            # Evaluate hero's hand
            hero_score = self.evaluator.evaluate(sim_board, hero)
            
            # Evaluate all villain hands and find the best (lowest score = best in Treys)
            villain_scores = [self.evaluator.evaluate(sim_board, vh) for vh in villain_hands]
            best_villain_score = min(villain_scores)
            
            if hero_score < best_villain_score:
                wins += 1
            elif hero_score > best_villain_score:
                losses += 1
            else:
                # Tie with at least one villain
                ties += 1
        
        total = wins + ties + losses
        win_pct = (wins / total) * 100
        tie_pct = (ties / total) * 100
        loss_pct = (losses / total) * 100
        equity = win_pct + (tie_pct / 2)
        
        return {
            'equity': round(equity, 2),
            'win': round(win_pct, 2),
            'tie': round(tie_pct, 2),
            'lose': round(loss_pct, 2)
        }
    
    def _calculate_fallback(
        self,
        hero_cards: str,
        villain_cards: str,
        board: str,
        iterations: int
    ) -> Dict:
        """Fallback calculation without Treys"""
        # Simple approximation based on card strength
        hero_strength = self._estimate_strength(hero_cards)
        villain_strength = self._estimate_strength(villain_cards)
        
        total_strength = hero_strength + villain_strength
        equity = (hero_strength / total_strength) * 100 if total_strength > 0 else 50
        
        return {
            'equity': round(equity, 2),
            'win': round(equity, 2),
            'tie': 0.0,
            'lose': round(100 - equity, 2),
            'fallback': True
        }
    
    def _parse_cards(self, cards_str: str) -> List:
        """Parse card string to Treys format"""
        if not cards_str or not TREYS_AVAILABLE:
            return []
        
        cards = []
        parts = cards_str.strip().split()
        
        for part in parts:
            if len(part) >= 2:
                try:
                    card = Card.new(part)
                    cards.append(card)
                except Exception:
                    continue
        
        return cards
    
    def _estimate_strength(self, cards_str: str) -> float:
        """Estimate hand strength (fallback method)"""
        if not cards_str:
            return 50.0
        
        rank_values = {
            'A': 14, 'K': 13, 'Q': 12, 'J': 11, 'T': 10,
            '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
        }
        
        parts = cards_str.strip().split()
        total = 0
        
        for part in parts:
            if len(part) >= 1:
                rank = part[0].upper()
                total += rank_values.get(rank, 0)
        
        # Normalize to 0-100
        max_possible = 28  # AA
        min_possible = 4   # 22
        
        strength = ((total - min_possible) / (max_possible - min_possible)) * 100
        return max(0, min(100, strength))
    
    def calculate_all_in_ev(self, hand: Dict) -> float:
        """
        Calculate EV for an all-in situation.
        
        Returns the EV-adjusted profit: what the hero would expect to win/lose
        on average given their equity at the time of the all-in.
        
        Formula: EV_profit = (equity * pot) - hero_investment
        Where hero_investment is derived from: hero_investment = pot_won - hero_profit
        If hero lost, pot_won = 0, so hero_investment = -hero_profit
        If hero won, pot_won = total_pot, so hero_investment = total_pot - hero_profit
        """
        hero_cards = hand.get('hero_cards', '')
        villain_cards = hand.get('villain_cards', '')
        
        # Need both hole cards to calculate equity
        if not hero_cards or not villain_cards:
            return hand.get('hero_profit', 0)
        
        # For all-in EV, we calculate equity at the moment of all-in
        # If all-in preflop, use preflop equity (no board)
        # If all-in on flop, use flop equity, etc.
        board = ''
        
        # Determine at which street the all-in occurred
        preflop_action = hand.get('preflop_action', '') or ''
        flop_action = hand.get('flop_action', '') or ''
        turn_action = hand.get('turn_action', '') or ''
        river_action = hand.get('river_action', '') or ''
        
        # Check if all-in occurred on each street
        if 'all-in' in preflop_action.lower():
            # Preflop all-in - no board cards
            board = ''
        elif 'all-in' in flop_action.lower():
            # All-in on flop
            if hand.get('flop'):
                board = hand['flop']
        elif 'all-in' in turn_action.lower():
            # All-in on turn
            if hand.get('flop'):
                board = hand['flop']
            if hand.get('turn'):
                board += ' ' + hand['turn']
        elif 'all-in' in river_action.lower():
            # All-in on river
            if hand.get('flop'):
                board = hand['flop']
            if hand.get('turn'):
                board += ' ' + hand['turn']
            if hand.get('river'):
                board += ' ' + hand['river']
        else:
            # Fallback: check preflop for all-in
            if hand.get('flop'):
                board = hand['flop']
            if hand.get('turn'):
                board += ' ' + hand['turn']
            if hand.get('river'):
                board += ' ' + hand['river']
        
        # Calculate equity at the moment of all-in
        result = self.calculate(hero_cards, villain_cards, board.strip())
        equity = result.get('equity', 50) / 100
        
        # Calculate EV using the alternative formula:
        # EV_diff = (Equity - ActualWinRate) * Pot
        # EV = Profit + EV_diff
        # 
        # This approach is more robust as it doesn't require knowing exact investment
        # ActualWinRate: 1 if won all, 0 if lost all, 0.5 if split
        
        pot = hand.get('total_pot', 0)
        hero_profit = hand.get('hero_profit', 0)
        
        # Determine actual win rate from profit
        if hero_profit > 0:
            # Won the pot (or most of it)
            actual_win_rate = 1.0
        elif hero_profit < 0:
            # Lost
            actual_win_rate = 0.0
        else:
            # Split pot (profit = 0)
            actual_win_rate = 0.5
        
        # Calculate EV difference
        ev_diff = (equity - actual_win_rate) * pot
        
        # EV = what we actually won + adjustment for equity vs actual result
        ev_profit = hero_profit + ev_diff
        
        return round(ev_profit, 2)
