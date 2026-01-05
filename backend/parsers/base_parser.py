"""
Poker Tracker Pro - Base Parser
Abstract base class for hand history parsers
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
import re


@dataclass
class ParsedHand:
    """Data structure for a parsed poker hand"""
    id: str = None
    game_id: str = None
    hand_id: str = None
    room: str = None
    game_mode: str = None
    game_type: str = None
    game_name: str = None
    prize_pool: float = 0
    multiplier: int = 1
    buy_in: float = 0
    date_time: str = None
    table_id: str = None
    blinds: str = None
    total_pot: float = 0
    rake: float = 0
    hero_position: str = None
    hero_stack: int = 0
    hero_cards: str = None
    villain_position: str = None
    villain_stack: int = 0
    villain_cards: str = None
    preflop_action: str = ''
    flop: str = None
    flop_action: str = ''
    turn: str = None
    turn_action: str = ''
    river: str = None
    river_action: str = ''
    showdown: str = ''
    result: str = ''
    hero_profit: float = 0
    hero_all_in: bool = False
    villain_all_in: bool = False
    ev_chips: float = None
    player_count: int = 2  # Number of players in the hand (2=HU, 3=3-way)
    went_to_showdown: bool = False  # True if hero showed cards at showdown
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for database insertion"""
        return {
            'id': self.id,
            'game_id': self.game_id,
            'hand_id': self.hand_id,
            'room': self.room,
            'game_mode': self.game_mode,
            'game_type': self.game_type,
            'game_name': self.game_name,
            'prize_pool': self.prize_pool,
            'multiplier': self.multiplier,
            'buy_in': self.buy_in,
            'date_time': self.date_time,
            'table_id': self.table_id,
            'blinds': self.blinds,
            'total_pot': self.total_pot,
            'rake': self.rake,
            'hero_position': self.hero_position,
            'hero_stack': self.hero_stack,
            'hero_cards': self.hero_cards,
            'villain_position': self.villain_position,
            'villain_stack': self.villain_stack,
            'villain_cards': self.villain_cards,
            'preflop_action': self.preflop_action,
            'flop': self.flop,
            'flop_action': self.flop_action,
            'turn': self.turn,
            'turn_action': self.turn_action,
            'river': self.river,
            'river_action': self.river_action,
            'showdown': self.showdown,
            'result': self.result,
            'hero_profit': self.hero_profit,
            'hero_all_in': self.hero_all_in,
            'villain_all_in': self.villain_all_in,
            'ev_chips': self.ev_chips,
            'player_count': self.player_count,
            'went_to_showdown': self.went_to_showdown
        }


class BaseParser(ABC):
    """Abstract base class for poker hand history parsers"""
    
    PARSER_VERSION = 1
    ROOM_NAME = "Unknown"
    
    @abstractmethod
    def parse_file(self, file_content: str) -> Dict[str, Any]:
        """Parse a file containing multiple hands
        
        Returns:
            Dict with keys: success, hands, count, error (if any)
        """
        pass
    
    @abstractmethod
    def parse_hand(self, hand_text: str) -> Optional[ParsedHand]:
        """Parse a single hand
        
        Returns:
            ParsedHand object or None if parsing failed
        """
        pass
    
    @abstractmethod
    def detect_format(self, content: str) -> bool:
        """Check if this parser can handle the given content"""
        pass
    
    def extract_position(self, position_string: str) -> str:
        """Extract position from position string
        
        In HU (heads-up), the BTN is also the SB.
        We preserve 'BTN SB' to distinguish HU from 3-way.
        """
        pos_upper = position_string.upper()
        
        # Check for BTN SB combination (HU where BTN is SB)
        if 'BTN' in pos_upper and 'SB' in pos_upper:
            return 'BTN SB'
        
        if 'BTN' in pos_upper:
            return 'BTN'
        if 'SB' in pos_upper:
            return 'SB'
        if 'BB' in pos_upper:
            return 'BB'
        if 'CO' in pos_upper:
            return 'CO'
        if 'MP' in pos_upper:
            return 'MP'
        if 'UTG' in pos_upper:
            return 'UTG'
        return 'Unknown'
    
    def normalize_card(self, card: str) -> str:
        """Normalize card format to standard (e.g., 'As' -> 'As')"""
        if len(card) != 2:
            return card
        rank = card[0].upper()
        suit = card[1].lower()
        return f"{rank}{suit}"
    
    def normalize_cards(self, cards_str: str) -> str:
        """Normalize a string of cards"""
        # Remove brackets
        cards_str = cards_str.replace('[', '').replace(']', '')
        # Split and normalize each card
        cards = cards_str.split()
        return ' '.join(self.normalize_card(c) for c in cards)


class ParserFactory:
    """Factory for creating the appropriate parser based on file content"""
    
    _parsers = []
    
    @classmethod
    def register_parser(cls, parser_class):
        """Register a parser class"""
        cls._parsers.append(parser_class)
    
    @classmethod
    def get_parser(cls, content: str) -> Optional[BaseParser]:
        """Get the appropriate parser for the given content"""
        for parser_class in cls._parsers:
            parser = parser_class()
            if parser.detect_format(content):
                return parser
        return None
    
    @classmethod
    def get_parser_by_room(cls, room: str) -> Optional[BaseParser]:
        """Get parser by room name"""
        room_lower = room.lower()
        for parser_class in cls._parsers:
            if parser_class.ROOM_NAME.lower() == room_lower:
                return parser_class()
        return None
