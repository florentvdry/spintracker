from app.parsers.base import BaseParser
from app.schemas.request_response import ParseResult, ParsedHand, PlayerInfo
import re
from datetime import datetime


class BetclicParser(BaseParser):
    async def parse(self, content: str) -> ParseResult:
        try:
            hands = []
            blocks = content.split("-" * 50)
            
            for block in blocks:
                if not block.strip():
                    continue
                
                hand = self.parse_hand(block)
                if hand:
                    hands.append(hand)
            
            return ParseResult(
                success=True,
                hands=hands,
                count=len(hands)
            )
        except Exception as e:
            return ParseResult(success=False, error=str(e))

    def parse_hand(self, block: str) -> ParsedHand | None:
        lines = block.strip().split("\n")
        if not lines:
            return None

        hand = ParsedHand()
        hand.room = "Betclic"
        
        for line in lines:
            line = line.strip()
            
            if "Game #" in line:
                match = re.search(r"Game #(\d+)", line)
                if match:
                    hand.hand_id = match.group(1)
            
            if "Tournament" in line or "Tournoi" in line:
                hand.game_mode = "Tournament"
            
            if "Buy-in" in line or "Buyin" in line:
                match = re.search(r"([\d.,]+)", line.replace(",", "."))
                if match:
                    hand.buy_in = float(match.group(1))
            
            if "Level" in line:
                match = re.search(r"Level (\d+)", line)
                if match:
                    pass
            
            if "Blinds" in line or "Blinde" in line:
                match = re.search(r"([\d.,]+)/([\d.,]+)", line.replace(",", "."))
                if match:
                    hand.blinds = f"{match.group(1)}/{match.group(2)}"
            
            if "Table" in line or "Table" in line:
                match = re.search(r"Table '?([^']+)'?", line)
                if match:
                    hand.table_id = match.group(1)
            
            if "Seat" in line:
                match = re.search(r"Seat (\d+): (.+?) \(?([\d.,]+)?\)?", line.replace(",", "."))
                if match:
                    player = PlayerInfo()
                    player.name = match.group(2).strip()
                    if match.group(3):
                        player.stack = float(match.group(3))
            
            if "Hero" in line and "shows" in line:
                cards_match = re.search(r"\[([^\]]+)\]", line)
                if cards_match:
                    for p in hand.players:
                        if p.is_hero:
                            p.cards = cards_match.group(1)
            
            if "Total Pot" in line:
                match = re.search(r"([\d.,]+)", line.replace(",", "."))
                if match:
                    hand.total_pot = float(match.group(1))
            
            if "Rake" in line:
                match = re.search(r"([\d.,]+)", line.replace(",", "."))
                if match:
                    hand.rake = float(match.group(1))

        return hand