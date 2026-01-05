"""
Poker Tracker Pro - Betclic Parser
Parser for Betclic/Expekt hand history format
"""

import re
from typing import Dict, List, Any, Optional
from .base_parser import BaseParser, ParsedHand, ParserFactory


class BetclicParser(BaseParser):
    """Parser for Betclic hand history format"""
    
    PARSER_VERSION = 3
    ROOM_NAME = "Betclic"
    HAND_SEPARATOR = '------------'
    
    def detect_format(self, content: str) -> bool:
        """Check if content is Betclic format"""
        return 'Site: Betclic' in content or '*** HEADER ***' in content
    
    def parse_file(self, file_content: str) -> Dict[str, Any]:
        """Parse a file containing multiple Betclic hands"""
        try:
            hand_texts = [h.strip() for h in file_content.split(self.HAND_SEPARATOR) if h.strip()]
            hands = []
            
            for hand_text in hand_texts:
                hand = self.parse_hand(hand_text)
                if hand:
                    hands.append(hand.to_dict())
            
            return {
                'success': True,
                'hands': hands,
                'count': len(hands)
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'hands': [],
                'count': 0
            }
    
    def parse_hand(self, hand_text: str) -> Optional[ParsedHand]:
        """Parse a single Betclic hand"""
        try:
            lines = [l.strip() for l in hand_text.split('\n') if l.strip()]
            
            hand = ParsedHand()
            hand.room = 'Betclic.fr'
            
            current_section = 'HEADER'
            hero_name = None
            players = []
            hero_won = False
            total_pot_won = 0
            actions = {
                'preflop': [],
                'flop': [],
                'turn': [],
                'river': []
            }
            
            for line in lines:
                # Detect sections
                if '*** HEADER ***' in line:
                    current_section = 'HEADER'
                elif '*** PLAYERS ***' in line:
                    current_section = 'PLAYERS'
                elif '*** HOLE CARDS ***' in line:
                    current_section = 'HOLE_CARDS'
                elif '*** PRE-FLOP ***' in line:
                    current_section = 'PREFLOP'
                elif '*** FLOP ***' in line:
                    current_section = 'FLOP'
                    match = re.search(r'\[(.*?)\]', line)
                    if match:
                        hand.flop = match.group(1)
                elif '*** TURN ***' in line:
                    current_section = 'TURN'
                    match = re.search(r'\[(.*?)\]', line)
                    if match:
                        cards = match.group(1).split()
                        hand.turn = cards[-1] if cards else None
                elif '*** RIVER ***' in line:
                    current_section = 'RIVER'
                    match = re.search(r'\[(.*?)\]', line)
                    if match:
                        cards = match.group(1).split()
                        hand.river = cards[-1] if cards else None
                elif '*** SHOWDOWN ***' in line:
                    current_section = 'SHOWDOWN'
                elif '*** SUMMARY ***' in line:
                    current_section = 'SUMMARY'
                
                # Parse HEADER
                if current_section == 'HEADER':
                    if line.startswith('Site:'):
                        hand.room = line.split(':', 1)[1].strip()
                    elif line.startswith('Game Mode:'):
                        hand.game_mode = line.split(':', 1)[1].strip()
                    elif line.startswith('Game Type:'):
                        hand.game_type = line.split(':', 1)[1].strip()
                    elif line.startswith('Game Name:'):
                        hand.game_name = line.split(':', 1)[1].strip()
                    elif line.startswith('Game ID:'):
                        hand.game_id = line.split(':', 1)[1].strip()
                    elif line.startswith('Hand ID:'):
                        hand.hand_id = line.split(':', 1)[1].strip()
                        hand.id = hand.hand_id
                    elif line.startswith('Prize pool:'):
                        match = re.search(r'[\d.]+', line)
                        if match:
                            hand.prize_pool = float(match.group())
                    elif line.startswith('Multiplier:'):
                        match = re.search(r'x(\d+)', line)
                        if match:
                            hand.multiplier = int(match.group(1))
                    elif line.startswith('Buy In:'):
                        match = re.search(r'[\d.]+', line)
                        if match:
                            hand.buy_in = float(match.group())
                    elif line.startswith('Date & Time:'):
                        hand.date_time = line.split(':', 1)[1].strip()
                    elif line.startswith('Table ID:'):
                        hand.table_id = line.split(':', 1)[1].strip()
                    elif line.startswith('Blinds:'):
                        hand.blinds = line.split(':', 1)[1].strip()
                    elif line.startswith('Total Pot:'):
                        match = re.search(r'[\d.]+', line)
                        if match:
                            hand.total_pot = float(match.group())
                    elif line.startswith('Rake:'):
                        match = re.search(r'[\d.]+', line)
                        if match:
                            hand.rake = float(match.group())
                
                # Parse PLAYERS
                if current_section == 'PLAYERS':
                    seat_match = re.match(r'Seat (\d+): (.+?) \((\d+)\)(.*)', line)
                    if seat_match:
                        seat, name, stack, positions = seat_match.groups()
                        is_hero = 'Hero' in positions
                        
                        player = {
                            'seat': int(seat),
                            'name': name,
                            'stack': int(stack),
                            'position': self.extract_position(positions),
                            'isHero': is_hero
                        }
                        players.append(player)
                        
                        if is_hero:
                            hero_name = name
                            hand.hero_stack = int(stack)
                            hand.hero_position = player['position']
                
                # Parse HOLE CARDS
                if current_section == 'HOLE_CARDS':
                    card_match = re.match(r'(.+?): \[(.*?)\]', line)
                    if card_match:
                        player_name, cards = card_match.groups()
                        if player_name == hero_name:
                            hand.hero_cards = cards
                        else:
                            if hand.villain_cards:
                                hand.villain_cards += '|' + cards
                            else:
                                hand.villain_cards = cards
                
                # Parse actions
                action_match = re.match(r'^\d{2}:\d{2}:\d{2}', line)
                if action_match:
                    if current_section == 'PREFLOP':
                        actions['preflop'].append(line)
                    elif current_section == 'FLOP':
                        actions['flop'].append(line)
                    elif current_section == 'TURN':
                        actions['turn'].append(line)
                    elif current_section == 'RIVER':
                        actions['river'].append(line)
                    
                    # Detect all-in
                    if 'and is all-in' in line:
                        if hero_name and hero_name in line:
                            hand.hero_all_in = True
                        else:
                            hand.villain_all_in = True
                
                # Parse SHOWDOWN
                if current_section == 'SHOWDOWN':
                    hand.showdown += line + '\n'
                    
                    # Extract cards from showdown and detect if hero showed
                    shows_match = re.match(r'^(.+?) shows \[(.+?)\]', line)
                    if shows_match:
                        player_name, cards = shows_match.groups()
                        if player_name == hero_name:
                            hand.went_to_showdown = True  # Hero showed cards
                        elif cards:
                            if not hand.villain_cards:
                                hand.villain_cards = cards
                            elif cards not in hand.villain_cards:
                                hand.villain_cards += '|' + cards
                
                # Parse SUMMARY
                if current_section == 'SUMMARY':
                    if 'wins' in line and hero_name and hero_name in line and 'pot' in line:
                        win_match = re.search(r'wins .*?pot of (\d+)', line)
                        if win_match:
                            total_pot_won += int(win_match.group(1))
                            hero_won = True
                    
                    if hero_name:
                        hand.result += line.replace(hero_name, 'Hero') + '\n'
                    else:
                        hand.result += line + '\n'
            
            # Calculate profit
            player_investments = {}
            total_investment = 0
            max_investment = 0
            max_investor = None
            
            for player in players:
                inv = self._calculate_player_investment(actions, player['name'])
                player_investments[player['name']] = inv
                total_investment += inv
                
                if inv > max_investment:
                    max_investment = inv
                    max_investor = player['name']
            
            # Adjust for uncalled bets
            if total_investment > hand.total_pot and max_investor:
                excess = total_investment - hand.total_pot
                player_investments[max_investor] -= excess
            
            hero_investment = player_investments.get(hero_name, 0)
            
            if hero_investment > hand.total_pot:
                hero_investment = hand.total_pot
            
            if hero_won or total_pot_won > 0:
                hand.hero_profit = total_pot_won - hero_investment
            elif hand.total_pot > 0:
                hand.hero_profit = -hero_investment
            
            # Normalize positions
            self._normalize_positions(hand, players, hero_name)
            
            # Convert actions to strings
            hand.preflop_action = '\n'.join(actions['preflop'])
            hand.flop_action = '\n'.join(actions['flop'])
            hand.turn_action = '\n'.join(actions['turn'])
            hand.river_action = '\n'.join(actions['river'])
            
            return hand
            
        except Exception as e:
            return None
    
    def _calculate_player_investment(self, actions: Dict[str, List[str]], player_name: str) -> int:
        """Calculate total investment for a player"""
        total = 0
        
        for street in ['preflop', 'flop', 'turn', 'river']:
            street_investment = 0
            
            for action in actions.get(street, []):
                if player_name not in action:
                    continue
                
                if 'Posts SB' in action:
                    match = re.search(r'Posts SB (\d+)', action)
                    if match:
                        street_investment += int(match.group(1))
                elif 'Posts BB' in action:
                    match = re.search(r'Posts BB (\d+)', action)
                    if match:
                        street_investment += int(match.group(1))
                elif 'Raises to' in action:
                    match = re.search(r'Raises to (\d+)', action)
                    if match:
                        street_investment = int(match.group(1))
                elif 'Calls' in action:
                    match = re.search(r'Calls (\d+)', action)
                    if match:
                        street_investment += int(match.group(1))
                elif 'Bets' in action:
                    match = re.search(r'Bets (\d+)', action)
                    if match:
                        street_investment += int(match.group(1))
            
            total += street_investment
        
        return total
    
    def _normalize_positions(self, hand: ParsedHand, players: List[Dict], hero_name: str):
        """Normalize position format"""
        # Store player count
        hand.player_count = len(players)
        
        villain = next((p for p in players if p['name'] != hero_name), None)
        
        if villain:
            hand.villain_position = villain['position']
            hand.villain_stack = villain['stack']
            
            # Normalize hero position based on player count
            hero_pos = hand.hero_position
            if hand.player_count == 2:
                # HU: BTN SB is actually SB, BB is BB
                if hero_pos == 'BTN SB' or hero_pos == 'BTN':
                    hero_pos = 'SB'  # In HU, BTN is SB
                # Keep BB as BB
            
            hand.hero_position = f"Hero ({hero_pos})"
            
            # Same for villain
            villain_pos = villain['position']
            if hand.player_count == 2:
                if villain_pos == 'BTN SB' or villain_pos == 'BTN':
                    villain_pos = 'SB'
            
            hand.villain_position = f"Villain ({villain_pos})"


# Register the parser
ParserFactory.register_parser(BetclicParser)
