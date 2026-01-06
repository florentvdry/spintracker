"""
Analytics Calculator - Compute statistics for hands
Separate from parsing logic to allow recalculation

EV Calculation Logic (matching PT4/Hand2Note standards):
1. EV is calculated for all-in situations at showdown
2. For heads-up (2 players): use standard equity calculation
3. For multiway (3+ players): calculate combined equity vs all opponents
4. For river all-in: use actual result (equity is 0% or 100%)
5. Formula: EV = (equity * pot) - hero_investment
"""

import logging
import random
from typing import Dict, Any, Optional, List
from equity_calculator import EquityCalculator

logger = logging.getLogger(__name__)


class AnalyticsCalculator:
    """Calculate analytics for parsed hands"""
    
    def __init__(self):
        self.equity_calc = EquityCalculator()
    
    def calculate_hand_analytics(self, hand: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculate all analytics for a single hand
        
        Returns analytics dict with:
        - hand_id: Hand identifier
        - ev_chips: Expected value in chips for all-in situations
        - net_won_adjusted: EV-adjusted profit
        - equity_preflop/flop/turn/river: Equity at each street
        - chips_won_showdown: Chips won at showdown
        - chips_won_no_showdown: Chips won without showdown
        - cev_contribution: Contribution to CEV (Chip EV)
        """
        analytics = {
            'hand_id': hand.get('id'),
            'ev_chips': None,
            'net_won_adjusted': None,
            'equity_preflop': None,
            'equity_flop': None,
            'equity_turn': None,
            'equity_river': None,
            'chips_won_showdown': None,
            'chips_won_no_showdown': None,
            'cev_contribution': None
        }
        
        hero_profit = hand.get('hero_profit', 0) or 0
        
        # Determine if went to showdown (PT4/Hand2Note standard)
        is_showdown = bool(hand.get('went_to_showdown'))
        
        # Split chips won by showdown vs no showdown
        if is_showdown:
            analytics['chips_won_showdown'] = hero_profit
            analytics['chips_won_no_showdown'] = 0
        else:
            analytics['chips_won_showdown'] = 0
            analytics['chips_won_no_showdown'] = hero_profit
        
        # Determine if we should calculate EV
        hero_all_in = hand.get('hero_all_in')
        villain_all_in = hand.get('villain_all_in')
        hero_cards = hand.get('hero_cards')
        villain_cards = hand.get('villain_cards')
        
        # Check for multiway pot (villain_cards contains "|" separator)
        is_multiway = villain_cards and '|' in villain_cards if villain_cards else False
        has_both_cards = (hero_cards and villain_cards and 
                        villain_cards.strip().lower() not in ['none', ''])
        any_all_in = hero_all_in or villain_all_in
        
        # Check if all-in was on the river (no more cards to come = no EV adjustment)
        is_river_all_in = self._is_river_all_in(hand)
        
        # Calculate EV when:
        # 1. Showdown occurred (cards revealed)
        # 2. At least one player was all-in
        # 3. Cards are known
        # 4. NOT a river all-in (equity is deterministic at river)
        should_calculate_ev = (
            is_showdown and 
            any_all_in and 
            has_both_cards and
            not is_river_all_in
        )
        
        if should_calculate_ev:
            if is_multiway:
                # Multiway: calculate equity against all opponents
                ev_chips = self._calculate_multiway_ev(hand)
            else:
                # Heads-up: standard equity calculation
                ev_chips = self._calculate_all_in_ev(hand)
            
            if ev_chips is not None:
                analytics['ev_chips'] = ev_chips
                analytics['net_won_adjusted'] = ev_chips
                analytics['cev_contribution'] = ev_chips - hero_profit
                
                # Calculate equity at different streets
                if not is_multiway:
                    self._calculate_street_equities(hand, analytics)
            else:
                # Calculation failed, use actual profit
                analytics['net_won_adjusted'] = hero_profit
                analytics['cev_contribution'] = 0
        else:
            # No EV adjustment: use actual profit
            analytics['net_won_adjusted'] = hero_profit
            analytics['cev_contribution'] = 0
        
        return analytics
    
    def _is_river_all_in(self, hand: Dict[str, Any]) -> bool:
        """
        Check if the relevant all-in occurred on the river (no EV adjustment needed)
        
        PT4 logic: The all-in street is determined by when the significant all-in happens.
        - If HERO goes all-in on river -> river all-in (no EV calc)
        - If HERO goes all-in earlier -> calculate EV
        - If only villain(s) all-in -> check when their all-in happened
        """
        hero_name = 'jmenfouu'
        
        # Get all actions
        preflop = hand.get('preflop_action', '') or ''
        flop = hand.get('flop_action', '') or ''
        turn = hand.get('turn_action', '') or ''
        river = hand.get('river_action', '') or ''
        
        # Check when HERO went all-in (if at all)
        hero_all_in_street = self._find_player_allin_street(hero_name, preflop, flop, turn, river)
        
        hero_all_in = hand.get('hero_all_in', 0)
        
        if hero_all_in and hero_all_in_street:
            # Hero is all-in - use hero's all-in street
            return hero_all_in_street == 'river'
        
        # Hero is not all-in - check if villain's all-in is on river
        # This handles cases like villain shoving river
        villain_all_in = hand.get('villain_all_in', 0)
        if villain_all_in:
            # Check if any all-in happened before river
            earlier_all_in = (
                'all-in' in preflop.lower() or
                'all-in' in flop.lower() or
                'all-in' in turn.lower()
            )
            if not earlier_all_in and 'all-in' in river.lower():
                return True
        
        return False
    
    def _find_player_allin_street(self, player_name: str, preflop: str, flop: str, turn: str, river: str) -> Optional[str]:
        """Find which street a player went all-in on"""
        for street_name, action_text in [('preflop', preflop), ('flop', flop), ('turn', turn), ('river', river)]:
            if not action_text:
                continue
            for line in action_text.split('\n'):
                if player_name.lower() in line.lower() and 'all-in' in line.lower():
                    return street_name
        return None
    
    def _calculate_multiway_ev(self, hand: Dict[str, Any]) -> Optional[float]:
        """
        Calculate EV for a multiway all-in situation
        
        PT4 formula: EV = equity × pot - effective_investment
        
        Where effective_investment = min(hero_investment, min_active_opponent_investment)
        This accounts for side pots where hero can only win what opponents can cover.
        """
        hero_cards = hand.get('hero_cards', '')
        villain_cards_str = hand.get('villain_cards', '')
        
        if not hero_cards or not villain_cards_str:
            return None
        
        # Parse multiple villain hands (separated by |)
        villain_hands = [v.strip() for v in villain_cards_str.split('|') if v.strip()]
        
        if not villain_hands:
            return None
        
        # Get board at all-in
        board = self._get_board_at_all_in(hand)
        
        # Calculate equity against all opponents
        total_equity = self._calculate_multiway_equity(hero_cards, villain_hands, board)
        
        if total_equity is None:
            return None
        
        total_pot = hand.get('total_pot', 0) or 0
        hero_profit = hand.get('hero_profit', 0) or 0
        
        if total_pot == 0:
            return hero_profit
        
        # Parse all player investments from actions to get effective investment
        effective_investment = self._parse_effective_investment(hand)
        
        if effective_investment is None or effective_investment == 0:
            # Fallback: use pot / num_players
            effective_investment = total_pot / (len(villain_hands) + 1)
        
        # EV = (equity * pot) - effective_investment
        ev = (total_equity * total_pot) - effective_investment
        
        return round(ev, 2)
    
    def _parse_effective_investment(self, hand: Dict[str, Any]) -> Optional[float]:
        """
        Parse hero's effective investment from actions.
        
        In multiway pots, this is capped by the smallest active opponent's investment,
        to account for side pots.
        """
        import re
        
        hero_name = 'jmenfouu'
        total_per_player = {}
        folded_players = set()
        
        for street in ['preflop_action', 'flop_action', 'turn_action', 'river_action']:
            street_actions = hand.get(street, '') or ''
            if not street_actions:
                continue
            
            street_investments = {}
            
            for line in street_actions.split('\n'):
                if not line.strip():
                    continue
                
                # Extract player name
                match = re.match(r'[0-9:]+ - ([^:]+):', line)
                if not match:
                    continue
                player = match.group(1).strip()
                
                if player not in street_investments:
                    street_investments[player] = 0
                
                line_lower = line.lower()
                
                # Track folds
                if 'folds' in line_lower:
                    folded_players.add(player)
                    continue
                
                # Posts blind/ante
                m = re.search(r'posts\s+\w+\s+(\d+)', line_lower)
                if m:
                    street_investments[player] = int(m.group(1))
                    continue
                
                # Raises to X (total on this street)
                m = re.search(r'raises\s+to\s+(\d+)', line_lower)
                if m:
                    street_investments[player] = int(m.group(1))
                    continue
                
                # Calls X
                m = re.search(r'calls\s+(\d+)', line_lower)
                if m:
                    street_investments[player] += int(m.group(1))
                    continue
                
                # Bets X
                m = re.search(r'bets\s+(\d+)', line_lower)
                if m:
                    street_investments[player] = int(m.group(1))
                    continue
            
            # Add street totals to player totals
            for player, amount in street_investments.items():
                if player not in total_per_player:
                    total_per_player[player] = 0
                total_per_player[player] += amount
        
        hero_inv = total_per_player.get(hero_name, 0)
        
        # Get active opponent investments (excluding folded players)
        opponent_invs = [v for k, v in total_per_player.items() 
                        if k != hero_name and k not in folded_players and v > 0]
        
        if not opponent_invs:
            return hero_inv
        
        # Effective investment = min of hero and smallest active opponent
        min_opponent = min(opponent_invs)
        return min(hero_inv, min_opponent)
    
    def _calculate_multiway_equity(self, hero_cards: str, villain_hands: List[str], board: str) -> Optional[float]:
        """
        Calculate hero's equity against multiple opponents
        
        Uses Monte Carlo simulation to determine win probability
        """
        try:
            from treys import Card, Evaluator, Deck
            
            evaluator = Evaluator()
            
            # Parse hero's cards
            hero_hand = self._parse_cards_to_treys(hero_cards)
            if not hero_hand or len(hero_hand) != 2:
                return None
            
            # Parse villain hands
            all_villain_hands = []
            for vh in villain_hands:
                parsed = self._parse_cards_to_treys(vh)
                if parsed and len(parsed) == 2:
                    all_villain_hands.append(parsed)
            
            if not all_villain_hands:
                return None
            
            # Parse board if present
            board_cards = []
            if board and board.strip():
                board_cards = self._parse_cards_to_treys(board)
                if board_cards is None:
                    board_cards = []
            
            # All cards that are already dealt
            dead_cards = set(hero_hand)
            for vh in all_villain_hands:
                dead_cards.update(vh)
            dead_cards.update(board_cards)
            
            # Monte Carlo simulation
            wins = 0
            ties = 0
            iterations = 5000
            
            # Create a deck without dealt cards
            full_deck = Deck.GetFullDeck()
            available_cards = [c for c in full_deck if c not in dead_cards]
            
            cards_needed = 5 - len(board_cards)
            
            for _ in range(iterations):
                # Draw remaining board cards
                sim_board = list(board_cards) + random.sample(available_cards, cards_needed)
                
                # Evaluate all hands
                hero_score = evaluator.evaluate(sim_board, hero_hand)
                villain_scores = [evaluator.evaluate(sim_board, vh) for vh in all_villain_hands]
                
                # Lower score is better in Treys
                best_villain = min(villain_scores)
                
                if hero_score < best_villain:
                    wins += 1
                elif hero_score == best_villain:
                    ties += 0.5  # Split ties
            
            equity = (wins + ties) / iterations
            return equity
            
        except Exception as e:
            logger.warning(f"Multiway equity calculation error: {e}")
            return None
    
    def _parse_cards_to_treys(self, cards_str: str) -> Optional[List[int]]:
        """Parse card string to Treys format"""
        try:
            from treys import Card
            
            cards_str = cards_str.strip()
            if not cards_str:
                return None
            
            result = []
            parts = cards_str.split()
            
            for part in parts:
                part = part.strip()
                if len(part) == 2:
                    result.append(Card.new(part))
            
            return result if result else None
        except Exception:
            return None
    
    def _calculate_all_in_ev(self, hand: Dict[str, Any]) -> Optional[float]:
        """
        Calculate EV for a heads-up all-in situation
        
        PT4 formula: EV = equity × pot - pot/2
        
        In heads-up, each player's effective investment is pot/2.
        This is because each player has the same amount at risk.
        """
        hero_cards = hand.get('hero_cards', '')
        villain_cards = hand.get('villain_cards', '')
        
        if not hero_cards or not villain_cards:
            return None
        
        # Determine at which street the all-in occurred and the board at that moment
        board = self._get_board_at_all_in(hand)
        
        # Calculate equity at the moment of all-in
        result = self.equity_calc.calculate(hero_cards, villain_cards, board.strip(), iterations=10000)
        equity = result.get('equity', 50) / 100
        
        pot = hand.get('total_pot', 0) or 0
        hero_profit = hand.get('hero_profit', 0) or 0
        
        if pot == 0:
            return hero_profit
        
        # PT4 formula for heads-up: EV = equity * pot - pot/2
        # This works because in HU, both players have pot/2 at risk
        hero_investment = pot / 2
        
        # EV = (equity * pot) - investment
        ev = (equity * pot) - hero_investment
        
        return round(ev, 2)
    
    def _calculate_hero_investment(self, hand: Dict[str, Any]) -> Optional[float]:
        """
        Calculate total chips hero invested in the hand by parsing actions.
        This is equivalent to PT4's amt_bet_ttl.
        """
        import re
        
        hero_name = 'jmenfouu'  # TODO: Make this dynamic
        total_investment = 0.0
        
        # Parse all streets
        for street in ['preflop_action', 'flop_action', 'turn_action', 'river_action']:
            action_text = hand.get(street, '') or ''
            
            # Find all actions by hero with amounts
            # Patterns: "Posts SB 30", "Posts BB 60", "Raises to 429", "Calls 369", "Bets 100"
            
            # Posts (blinds/antes)
            for match in re.finditer(rf'{hero_name}:\s*Posts\s+\w+\s+(\d+)', action_text, re.IGNORECASE):
                total_investment += float(match.group(1))
            
            # Raises to X (total amount, replaces previous bet)
            raises = list(re.finditer(rf'{hero_name}:\s*Raises\s+to\s+(\d+)', action_text, re.IGNORECASE))
            if raises:
                # Take the last raise as it represents total committed on this street
                # But we need to track per-street
                pass
            
            # Calls X (amount called)
            for match in re.finditer(rf'{hero_name}:\s*Calls\s+(\d+)', action_text, re.IGNORECASE):
                total_investment += float(match.group(1))
            
            # Bets X
            for match in re.finditer(rf'{hero_name}:\s*Bets\s+(\d+)', action_text, re.IGNORECASE):
                total_investment += float(match.group(1))
        
        # For raises, we need special handling - "Raises to X" means total on that street
        # Let's reparse with better logic
        total_investment = self._parse_hero_bets_detailed(hand, hero_name)
        
        return total_investment if total_investment > 0 else None
    
    def _parse_hero_bets_detailed(self, hand: Dict[str, Any], hero_name: str) -> float:
        """Parse hero's total bet amount across all streets"""
        import re
        
        total = 0.0
        
        for street in ['preflop_action', 'flop_action', 'turn_action', 'river_action']:
            action_text = hand.get(street, '') or ''
            street_total = 0.0
            
            # Split into individual actions
            lines = action_text.split('\n')
            
            for line in lines:
                if hero_name.lower() not in line.lower():
                    continue
                
                line_lower = line.lower()
                
                # Posts blind/ante
                match = re.search(r'posts\s+\w+\s+(\d+)', line_lower)
                if match:
                    street_total = float(match.group(1))
                    continue
                
                # Raises to X (replaces previous amount on this street)
                match = re.search(r'raises\s+to\s+(\d+)', line_lower)
                if match:
                    street_total = float(match.group(1))
                    continue
                
                # Calls X (adds to total)
                match = re.search(r'calls\s+(\d+)', line_lower)
                if match:
                    street_total += float(match.group(1))
                    continue
                
                # Bets X
                match = re.search(r'bets\s+(\d+)', line_lower)
                if match:
                    street_total = float(match.group(1))
                    continue
                
                # All-in with amount (could be raise or call)
                match = re.search(r'(\d+)\s+and\s+is\s+all-in', line_lower)
                if match:
                    # This is usually in "Raises to X and is all-in" or "Calls X and is all-in"
                    if 'raises to' in line_lower:
                        street_total = float(match.group(1))
                    elif 'calls' in line_lower:
                        street_total += float(match.group(1))
            
            total += street_total
        
        return total
    
    def _parse_villain_investment(self, hand: Dict[str, Any], hero_name: str) -> Optional[float]:
        """Parse villain's total bet amount to handle side pots"""
        import re
        
        action_text = (hand.get('preflop_action', '') or '') + '\n' + \
                      (hand.get('flop_action', '') or '') + '\n' + \
                      (hand.get('turn_action', '') or '') + '\n' + \
                      (hand.get('river_action', '') or '')
        
        # Find all players and their investments
        players = {}
        
        for line in action_text.split('\n'):
            # Extract player name
            match = re.match(r'[\d:]+\s*-\s*([^:]+):', line)
            if not match:
                continue
            player = match.group(1).strip()
            
            if player.lower() == hero_name.lower():
                continue
            
            line_lower = line.lower()
            amount = 0
            
            # Posts
            m = re.search(r'posts\s+\w+\s+(\d+)', line_lower)
            if m:
                amount = float(m.group(1))
            
            # Raises to
            m = re.search(r'raises\s+to\s+(\d+)', line_lower)
            if m:
                amount = float(m.group(1))
            
            # Calls
            m = re.search(r'calls\s+(\d+)', line_lower)
            if m:
                amount = float(m.group(1))
            
            # Bets
            m = re.search(r'bets\s+(\d+)', line_lower)
            if m:
                amount = float(m.group(1))
            
            # All-in
            m = re.search(r'(\d+)\s+and\s+is\s+all-in', line_lower)
            if m:
                if 'raises to' in line_lower:
                    amount = float(m.group(1))
                elif 'calls' in line_lower:
                    amount = float(m.group(1))
            
            if amount > 0:
                if player not in players:
                    players[player] = 0
                # For raises, replace; for calls, add
                if 'raises to' in line_lower:
                    players[player] = amount
                else:
                    players[player] += amount
        
        # Return the max investment of any villain
        # For multiway pots, this represents the maximum Hero can effectively lose to any opponent
        return max(players.values()) if players else None
    
    def _get_board_at_all_in(self, hand: Dict[str, Any]) -> str:
        """Determine the board cards at the moment of all-in"""
        preflop_action = hand.get('preflop_action', '') or ''
        flop_action = hand.get('flop_action', '') or ''
        turn_action = hand.get('turn_action', '') or ''
        river_action = hand.get('river_action', '') or ''
        
        board = ''
        
        # Check if all-in occurred on each street (work backwards)
        if 'all-in' in river_action.lower():
            # All-in on river - use full board
            if hand.get('flop'):
                board = hand['flop']
            if hand.get('turn'):
                board += ' ' + hand['turn']
            if hand.get('river'):
                board += ' ' + hand['river']
        elif 'all-in' in turn_action.lower():
            # All-in on turn - use flop + turn
            if hand.get('flop'):
                board = hand['flop']
            if hand.get('turn'):
                board += ' ' + hand['turn']
        elif 'all-in' in flop_action.lower():
            # All-in on flop - use flop only
            if hand.get('flop'):
                board = hand['flop']
        else:
            # Preflop all-in or not detected - no board
            board = ''
        
        return board.strip()
    
    def _calculate_street_equities(self, hand: Dict[str, Any], analytics: Dict[str, Any]):
        """Calculate equity at each street for analysis"""
        hero_cards = hand.get('hero_cards', '')
        villain_cards = hand.get('villain_cards', '')
        
        if not hero_cards or not villain_cards:
            return
        
        # Preflop equity
        result = self.equity_calc.calculate(hero_cards, villain_cards, '', iterations=1000)
        analytics['equity_preflop'] = round(result.get('equity', 50), 2)
        
        # Flop equity
        if hand.get('flop'):
            result = self.equity_calc.calculate(hero_cards, villain_cards, hand['flop'], iterations=1000)
            analytics['equity_flop'] = round(result.get('equity', 50), 2)
        
        # Turn equity
        if hand.get('flop') and hand.get('turn'):
            board = f"{hand['flop']} {hand['turn']}"
            result = self.equity_calc.calculate(hero_cards, villain_cards, board, iterations=1000)
            analytics['equity_turn'] = round(result.get('equity', 50), 2)
        
        # River equity (actual result = 0 or 100%)
        if hand.get('flop') and hand.get('turn') and hand.get('river'):
            board = f"{hand['flop']} {hand['turn']} {hand['river']}"
            result = self.equity_calc.calculate(hero_cards, villain_cards, board, iterations=500)
            analytics['equity_river'] = round(result.get('equity', 50), 2)
    
    def calculate_batch_analytics(self, hands: list) -> list:
        """Calculate analytics for multiple hands"""
        analytics_list = []
        
        for hand in hands:
            try:
                analytics = self.calculate_hand_analytics(hand)
                analytics_list.append(analytics)
            except Exception as e:
                logger.error(f"Error calculating analytics for hand {hand.get('id')}: {e}")
                # Still add placeholder analytics
                analytics_list.append({
                    'hand_id': hand.get('id'),
                    'ev_chips': None,
                    'net_won_adjusted': hand.get('hero_profit', 0),
                    'equity_preflop': None,
                    'equity_flop': None,
                    'equity_turn': None,
                    'equity_river': None,
                    'chips_won_showdown': hand.get('hero_profit', 0) if hand.get('showdown') else 0,
                    'chips_won_no_showdown': 0 if hand.get('showdown') else hand.get('hero_profit', 0),
                    'cev_contribution': 0
                })
        
        return analytics_list
