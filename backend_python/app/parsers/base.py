from abc import ABC, abstractmethod
from app.schemas.request_response import ParseResult, ParsedHand


class BaseParser(ABC):
    @abstractmethod
    async def parse(self, content: str) -> ParseResult:
        pass

    def extract_player_info(self, line: str) -> dict:
        return {}