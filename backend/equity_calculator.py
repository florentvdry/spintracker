"""
Poker Equity Calculator
High-performance equity calculations using Treys library
"""

import logging
from typing import List, Dict, Optional, Tuple
import random

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


class EquityCalculator:
    """Fast poker equity calculator using Treys"""
    
    def __init__(self):
        self.evaluator = Evaluator() if TREYS_AVAILABLE else None
        self.cache = {}
        self.max_cache_size = 10000
        
    def calculate(
        self,
        hero_cards: str,
        villain_cards: str,
        board: str = '',
        iterations: int = 10000
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
        # Create cache key
        cache_key = f"{hero_cards}_{villain_cards}_{board}"
        if cache_key in self.cache:
            return self.cache[cache_key]
        
        try:
            if TREYS_AVAILABLE:
                result = self._calculate_with_treys(
                    hero_cards, villain_cards, board, iterations
                )
            else:
                result = self._calculate_fallback(
                    hero_cards, villain_cards, board, iterations
                )
            
            # Cache result
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
        """Calculate equity using Treys library"""
        
        # Parse cards
        hero = self._parse_cards(hero_cards)
        villain = self._parse_cards(villain_cards)
        board_cards = self._parse_cards(board) if board else []
        
        # All cards in play
        dead_cards = hero + villain + board_cards
        
        # Complete board case - direct evaluation
        if len(board_cards) == 5:
            hero_score = self.evaluator.evaluate(board_cards, hero)
            villain_score = self.evaluator.evaluate(board_cards, villain)
            
            if hero_score < villain_score:
                return {'equity': 100.0, 'win': 100.0, 'tie': 0.0, 'lose': 0.0}
            elif hero_score > villain_score:
                return {'equity': 0.0, 'win': 0.0, 'tie': 0.0, 'lose': 100.0}
            else:
                return {'equity': 50.0, 'win': 0.0, 'tie': 100.0, 'lose': 0.0}
        
        # Monte Carlo simulation
        wins = 0
        ties = 0
        losses = 0
        
        for _ in range(iterations):
            # Create deck without dead cards
            deck = Deck()
            for card in dead_cards:
                deck.cards.remove(card)
            
            # Draw remaining board cards
            cards_needed = 5 - len(board_cards)
            random.shuffle(deck.cards)
            sim_board = board_cards + deck.cards[:cards_needed]
            
            # Evaluate hands
            hero_score = self.evaluator.evaluate(sim_board, hero)
            villain_score = self.evaluator.evaluate(sim_board, villain)
            
            if hero_score < villain_score:
                wins += 1
            elif hero_score > villain_score:
                losses += 1
            else:
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
        """Calculate EV for an all-in situation"""
        hero_cards = hand.get('hero_cards', '')
        villain_cards = hand.get('villain_cards', '')
        board = ''
        
        # Construct board from hand data
        if hand.get('flop'):
            board = hand['flop']
        if hand.get('turn'):
            board += ' ' + hand['turn']
        if hand.get('river'):
            board += ' ' + hand['river']
        
        # Calculate equity
        result = self.calculate(hero_cards, villain_cards, board.strip())
        equity = result.get('equity', 50) / 100
        
        # Calculate EV
        pot = hand.get('total_pot', 0)
        hero_invested = hand.get('hero_stack', 0) - hand.get('remaining_stack', 0)
        
        ev = (equity * pot) - hero_invested
        
        return round(ev, 2)
