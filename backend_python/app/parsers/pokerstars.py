from app.parsers.base import BaseParser
from app.schemas.request_response import ParseResult, ParsedHand, PlayerInfo
import re


class PokerstarsParser(BaseParser):
    async def parse(self, content: str) -> ParseResult:
        try:
            hands = []
            blocks = content.split("PokerStars Hand")
            
            for block in blocks:
                if not block.strip() or "#" not in block:
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
        hand = ParsedHand()
        hand.room = "PokerStars"
        
        lines = block.split("\n")
        
        for line in lines:
            line = line.strip()
            
            if "Hand #" in line:
                match = re.search(r"Hand #(\d+)", line)
                if match:
                    hand.hand_id = match.group(1)
            
            if "Tournament" in line:
                hand.game_mode = "Tournament"
            
            if "Buy-in:" in line:
                match = re.search(r"([\d.]+)", line)
                if match:
                    hand.buy_in = float(match.group(1))
            
            if "Level" in line:
                match = re.search(r"Level (\d+)", line)
                if match:
                    pass
            
            if "Blinds" in line:
                match = re.search(r"([\d.]+)/([\d.]+)", line)
                if match:
                    hand.blinds = f"{match.group(1)}/{match.group(2)}"
            
            if "Table '" in line:
                match = re.search(r"Table '([^']+)'", line)
                if match:
                    hand.table_id = match.group(1)
            
            if "Seat " in line and "chips" in line:
                match = re.search(r"Seat (\d+): ([^(]+) \(?([\d.]+)?\)?", line)
                if match:
                    player = PlayerInfo()
                    player.name = match.group(2).strip()
                    if match.group(3):
                        player.stack = float(match.group(3))
                    hand.players.append(player)
            
            if "Total Pot" in line:
                match = re.search(r"([\d.]+)", line)
                if match:
                    hand.total_pot = float(match.group(1))
            
            if "Rake" in line:
                match = re.search(r"([\d.]+)", line)
                if match:
                    hand.rake = float(match.group(1))

        return hand