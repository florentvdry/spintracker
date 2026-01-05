"""
Poker Analysis Engine
Leak detection and range analysis
"""

import logging
from typing import List, Dict, Optional
import json
import os

logger = logging.getLogger(__name__)


class AnalysisEngine:
    """Engine for detecting leaks and analyzing ranges"""
    
    def __init__(self):
        self.gto_ranges = self._load_gto_ranges()
        
    def _load_gto_ranges(self) -> Dict:
        """Load GTO ranges from JSON file"""
        try:
            # Try to load from strategies folder
            ranges_path = os.path.join(
                os.path.dirname(__file__), 
                '..', 'src', 'strategies', 'gto_ranges_hu.json'
            )
            if os.path.exists(ranges_path):
                with open(ranges_path, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.warning(f"Could not load GTO ranges: {e}")
        
        return self._get_default_ranges()
    
    def _get_default_ranges(self) -> Dict:
        """Get default HU ranges"""
        return {
            'BTN': {
                'open': [
                    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
                    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
                    'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o', 'A2o',
                    'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s', 'K2s',
                    'KQo', 'KJo', 'KTo', 'K9o', 'K8o', 'K7o', 'K6o', 'K5o', 'K4o', 'K3o', 'K2o',
                    'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'Q5s', 'Q4s', 'Q3s', 'Q2s',
                    'QJo', 'QTo', 'Q9o', 'Q8o', 'Q7o', 'Q6o', 'Q5o', 'Q4o', 'Q3o', 'Q2o',
                    'JTs', 'J9s', 'J8s', 'J7s', 'J6s', 'J5s', 'J4s', 'J3s', 'J2s',
                    'JTo', 'J9o', 'J8o', 'J7o', 'J6o', 'J5o', 'J4o',
                    'T9s', 'T8s', 'T7s', 'T6s', 'T5s', 'T4s', 'T3s', 'T2s',
                    'T9o', 'T8o', 'T7o', 'T6o', 'T5o',
                    '98s', '97s', '96s', '95s', '94s', '93s', '92s',
                    '98o', '97o', '96o', '95o',
                    '87s', '86s', '85s', '84s', '83s', '82s',
                    '87o', '86o', '85o',
                    '76s', '75s', '74s', '73s', '72s',
                    '76o', '75o',
                    '65s', '64s', '63s', '62s',
                    '65o', '64o',
                    '54s', '53s', '52s',
                    '54o',
                    '43s', '42s',
                    '32s'
                ],
                'limp': []
            },
            'SB': {
                'open': [
                    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
                    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
                    'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o', 'A2o',
                    'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s', 'K2s',
                    'KQo', 'KJo', 'KTo', 'K9o', 'K8o', 'K7o', 'K6o', 'K5o',
                    'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'Q5s', 'Q4s', 'Q3s', 'Q2s',
                    'QJo', 'QTo', 'Q9o', 'Q8o', 'Q7o', 'Q6o',
                    'JTs', 'J9s', 'J8s', 'J7s', 'J6s', 'J5s', 'J4s',
                    'JTo', 'J9o', 'J8o', 'J7o',
                    'T9s', 'T8s', 'T7s', 'T6s', 'T5s', 'T4s',
                    'T9o', 'T8o', 'T7o',
                    '98s', '97s', '96s', '95s', '94s',
                    '98o', '97o',
                    '87s', '86s', '85s', '84s',
                    '87o', '86o',
                    '76s', '75s', '74s',
                    '76o',
                    '65s', '64s', '63s',
                    '65o',
                    '54s', '53s',
                    '43s'
                ],
                'limp': []
            },
            'BB': {
                'defend': [
                    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
                    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
                    'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o', 'A2o',
                    'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s', 'K2s',
                    'KQo', 'KJo', 'KTo', 'K9o', 'K8o', 'K7o', 'K6o', 'K5o', 'K4o', 'K3o',
                    'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'Q5s', 'Q4s', 'Q3s', 'Q2s',
                    'QJo', 'QTo', 'Q9o', 'Q8o', 'Q7o', 'Q6o', 'Q5o',
                    'JTs', 'J9s', 'J8s', 'J7s', 'J6s', 'J5s', 'J4s', 'J3s',
                    'JTo', 'J9o', 'J8o', 'J7o', 'J6o',
                    'T9s', 'T8s', 'T7s', 'T6s', 'T5s', 'T4s',
                    'T9o', 'T8o', 'T7o', 'T6o',
                    '98s', '97s', '96s', '95s', '94s',
                    '98o', '97o', '96o',
                    '87s', '86s', '85s', '84s',
                    '87o', '86o',
                    '76s', '75s', '74s',
                    '76o', '75o',
                    '65s', '64s', '63s',
                    '65o',
                    '54s', '53s', '52s',
                    '54o',
                    '43s', '42s',
                    '32s'
                ]
            }
        }
    
    def detect_leaks(self, hands: List[Dict], options: Dict = None) -> List[Dict]:
        """
        Detect leaks in hand history
        
        Args:
            hands: List of hand dictionaries
            options: Analysis options
            
        Returns:
            List of detected leaks
        """
        options = options or {}
        leaks = []
        
        for hand in hands:
            # Check preflop leaks
            preflop_leaks = self._check_preflop_leaks(hand)
            leaks.extend(preflop_leaks)
            
            # Check postflop leaks
            postflop_leaks = self._check_postflop_leaks(hand)
            leaks.extend(postflop_leaks)
            
            # Check sizing leaks
            sizing_leaks = self._check_sizing_leaks(hand)
            leaks.extend(sizing_leaks)
        
        # Sort by severity
        severity_order = {'critical': 0, 'major': 1, 'minor': 2}
        leaks.sort(key=lambda x: severity_order.get(x.get('severity', 'minor'), 3))
        
        return leaks
    
    def _check_preflop_leaks(self, hand: Dict) -> List[Dict]:
        """Check for preflop mistakes"""
        leaks = []
        
        hero_cards = hand.get('hero_cards', '')
        position = hand.get('hero_position', '')
        action = hand.get('preflop_action', '')
        
        if not hero_cards or not position:
            return leaks
        
        # Convert hero cards to hand notation
        hand_notation = self._cards_to_notation(hero_cards)
        
        # Get expected range for position
        expected_range = self.gto_ranges.get(position, {}).get('open', [])
        
        # Check if action matches expected
        hero_raised = 'raises' in action.lower() and 'Hero' in action
        hero_folded = 'folds' in action.lower() and 'Hero' in action
        
        should_play = hand_notation in expected_range
        
        if hero_folded and should_play:
            leaks.append({
                'id': f"preflop_{hand.get('id', '')}",
                'hand_id': hand.get('id'),
                'leak_type': 'Fold trop tight',
                'severity': 'major',
                'description': f'Fold {hand_notation} en position {position} - cette main devrait être jouée',
                'expected_action': 'Raise',
                'actual_action': 'Fold',
                'ev_loss': 0.5  # Estimation
            })
        elif hero_raised and not should_play:
            leaks.append({
                'id': f"preflop_{hand.get('id', '')}",
                'hand_id': hand.get('id'),
                'leak_type': 'Open trop large',
                'severity': 'minor',
                'description': f'Open {hand_notation} en position {position} - main marginale',
                'expected_action': 'Fold',
                'actual_action': 'Raise',
                'ev_loss': 0.2
            })
        
        return leaks
    
    def _check_postflop_leaks(self, hand: Dict) -> List[Dict]:
        """Check for postflop mistakes"""
        leaks = []
        
        # Check for missed c-bets
        if hand.get('flop') and not hand.get('flop_action'):
            return leaks
        
        flop_action = hand.get('flop_action', '')
        hero_position = hand.get('hero_position', '')
        
        # Was hero the preflop aggressor?
        preflop = hand.get('preflop_action', '')
        was_aggressor = 'Hero raises' in preflop or 'Hero bets' in preflop
        
        if was_aggressor:
            # Check for c-bet
            hero_cbet = 'Hero bets' in flop_action or 'Hero raises' in flop_action
            hero_check = 'Hero checks' in flop_action
            
            if hero_check and hero_position == 'BTN':
                # Missed c-bet opportunity
                leaks.append({
                    'id': f"cbet_{hand.get('id', '')}",
                    'hand_id': hand.get('id'),
                    'leak_type': 'C-bet manqué',
                    'severity': 'minor',
                    'description': 'C-bet manqué en position avec initiative',
                    'expected_action': 'C-bet',
                    'actual_action': 'Check',
                    'ev_loss': 0.3
                })
        
        return leaks
    
    def _check_sizing_leaks(self, hand: Dict) -> List[Dict]:
        """Check for bet sizing mistakes"""
        leaks = []
        
        # This would require parsing bet sizes from actions
        # Simplified implementation
        
        return leaks
    
    def _cards_to_notation(self, cards_str: str) -> str:
        """Convert card string to hand notation (e.g., 'As Kh' -> 'AKs')"""
        if not cards_str:
            return ''
        
        parts = cards_str.strip().split()
        if len(parts) != 2:
            return ''
        
        rank1 = parts[0][0].upper()
        suit1 = parts[0][-1].lower()
        rank2 = parts[1][0].upper()
        suit2 = parts[1][-1].lower()
        
        # Sort ranks
        rank_order = 'AKQJT98765432'
        if rank_order.index(rank1) > rank_order.index(rank2):
            rank1, rank2 = rank2, rank1
            suit1, suit2 = suit2, suit1
        
        # Determine suited/offsuit
        if rank1 == rank2:
            return f'{rank1}{rank2}'
        elif suit1 == suit2:
            return f'{rank1}{rank2}s'
        else:
            return f'{rank1}{rank2}o'
    
    def analyze_range(self, position: str, action: str, stack: int = 20) -> Dict:
        """Analyze GTO range for given situation"""
        range_data = self.gto_ranges.get(position, {}).get(action.lower(), [])
        
        return {
            'position': position,
            'action': action,
            'stack': stack,
            'hands': range_data,
            'count': len(range_data),
            'percentage': self._calculate_range_percentage(range_data)
        }
    
    def _calculate_range_percentage(self, hands: List[str]) -> float:
        """Calculate percentage of starting hands"""
        # Total possible starting hands = 1326
        # Simplified calculation
        total_combos = 0
        
        for hand in hands:
            if len(hand) == 2:  # Pair
                total_combos += 6
            elif hand.endswith('s'):  # Suited
                total_combos += 4
            elif hand.endswith('o'):  # Offsuit
                total_combos += 12
        
        return round((total_combos / 1326) * 100, 1)
