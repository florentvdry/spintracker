from app.parsers.betclic import BetclicParser
from app.parsers.pokerstars import PokerstarsParser
from app.schemas.request_response import ParseResult, ParsedHand


async def detect_and_parse(content: str) -> ParseResult:
    content_lower = content.lower()
    
    if "betclic" in content_lower or "betclic.fr" in content_lower:
        parser = BetclicParser()
        return await parser.parse(content)
    elif "pokerstars" in content_lower or "pokerstars.eu" in content_lower:
        parser = PokerstarsParser()
        return await parser.parse(content)
    
    return ParseResult(success=False, error="Unknown room format")


async def parse_file(content: str, room: str | None) -> ParseResult:
    if room:
        room_lower = room.lower()
        if "betclic" in room_lower:
            parser = BetclicParser()
            return await parser.parse(content)
        elif "pokerstars" in room_lower:
            parser = PokerstarsParser()
            return await parser.parse(content)
    
    return await detect_and_parse(content)