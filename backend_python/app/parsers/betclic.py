from app.parsers.base import BaseParser
from app.schemas.request_response import ParseResult, ParsedHand, PlayerInfo
import re
from datetime import datetime


class BetclicParser(BaseParser):
    async def parse(self, content: str) -> ParseResult:
        try:
            hands = []
            blocks = content.split("-" * 12)
            
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
            
            if "Hand ID:" in line:
                match = re.search(r"Hand ID: (.+)", line)
                if match:
                    hand.hand_id = match.group(1).strip()
            
            if "Tournament" in line or "Tournoi" in line:
                hand.game_mode = "Tournament"
            
            if "Spin" in line:
                hand.game_mode = "Spin"
            
            if "Buy In:" in line or "Buy-in:" in line:
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
            
            if line.startswith("*** FLOP ***"):
                match = re.search(r"\[([^\]]+)\]", line)
                if match:
                    hand.flop = match.group(1).strip()
            
            if line.startswith("*** TURN ***"):
                match = re.search(r"\[([^\]]+)\]", line)
                if match:
                    hand.turn = match.group(1).strip()
            
            if line.startswith("*** RIVER ***"):
                match = re.search(r"\[([^\]]+)\]", line)
                if match:
                    hand.river = match.group(1).strip()
            
            if "Table" in line or "Table" in line:
                match = re.search(r"Table '?([^']+)'?", line)
                if match:
                    hand.table_id = match.group(1)
            
            if "Seat" in line:
                match = re.search(r"Seat (\d+): (.+?) \(?([\d.,]+)?\)?", line.replace(",", "."))
                if match:
                    player = PlayerInfo()
                    player.name = match.group(2).strip()
                    if "[BTN SB Hero]" in line or "[BB Hero]" in line or "[SB Hero]" in line or "[BTN Hero]" in line or "[Hero]" in line:
                        player.is_hero = True
                        hand.hero_name = player.name
                    
                    if "[BTN SB Hero]" in line or "[BTN Hero]" in line:
                        player.position = "BTN"
                    elif "[BB Hero]" in line:
                        player.position = "BB"
                    elif "[SB Hero]" in line:
                        player.position = "SB"
                    
                    if match.group(3):
                        player.stack = float(match.group(3))
                    hand.players.append(player)
            
            if "Game ID:" in line:
                match = re.search(r"Game ID: (.+)", line)
                if match:
                    hand.tournament_id = match.group(1).strip()
            
            if "Date & Time:" in line:
                match = re.search(r"Date & Time: (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})", line)
                if match:
                    try:
                        hand.hand_datetime = datetime.strptime(match.group(1), "%Y-%m-%d %H:%M:%S")
                    except:
                        pass
            
            if "Hero" in line and "shows" in line:
                cards_match = re.search(r"\[([^\]]+)\]", line)
                if cards_match:
                    for p in hand.players:
                        if p.is_hero:
                            p.cards = cards_match.group(1)
            
            hole_cards_match = re.search(r"^(\w+): \[([^\]]+)\]", line)
            if hole_cards_match:
                player_name = hole_cards_match.group(1)
                cards = hole_cards_match.group(2)
                for p in hand.players:
                    if p.name == player_name:
                        p.cards = cards
                        break
            
            if "Total Pot" in line:
                match = re.search(r"([\d.,]+)", line.replace(",", "."))
                if match:
                    hand.total_pot = float(match.group(1))
            
            if "Rake" in line:
                match = re.search(r"([\d.,]+)", line.replace(",", "."))
                if match:
                    hand.rake = float(match.group(1))
            
            if "is all-in" in line:
                if "PRE-FLOP" in block:
                    hand.all_in_street = "preflop"
                elif "FLOP" in block:
                    hand.all_in_street = "flop"
                elif "TURN" in block:
                    hand.all_in_street = "turn"
                elif "RIVER" in block:
                    hand.all_in_street = "river"
            
            if "wins main pot of" in line:
                match = re.search(r"wins main pot of ([\d.,]+)", line.replace(",", "."))
                if match:
                    winner_match = re.search(r"(\w+) wins main pot", line)
                    if winner_match:
                        winner_name = winner_match.group(1)
                        for p in hand.players:
                            if p.name == winner_name:
                                p.chips_won = hand.total_pot
                                p.net_profit = hand.total_pot - (p.stack or 0) + (p.stack or 0)
                            else:
                                p.chips_won = 0
                                p.net_profit = -(p.stack or 0)

        return hand