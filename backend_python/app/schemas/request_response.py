from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class PlayerInfo(BaseModel):
    name: str = ""
    stack: float = 0.0
    investment: float = 0.0
    chips_won: float = 0.0
    net_profit: float = 0.0
    ev_chips: Optional[float] = None
    cards: str = ""
    is_hero: bool = False
    folded: bool = False
    is_all_in: bool = False
    position: str = ""
    went_to_showdown: bool = False


class ParsedHand(BaseModel):
    id: Optional[str] = None
    game_id: Optional[str] = None
    hand_id: Optional[str] = None
    room: Optional[str] = None
    game_mode: Optional[str] = None
    game_type: Optional[str] = None
    game_name: Optional[str] = None
    prize_pool: float = 0.0
    multiplier: int = 1
    buy_in: float = 0.0
    date_time: Optional[str] = None
    table_id: Optional[str] = None
    blinds: Optional[str] = None
    total_pot: float = 0.0
    rake: float = 0.0
    preflop_action: str = ""
    flop: Optional[str] = None
    flop_action: str = ""
    turn: Optional[str] = None
    turn_action: str = ""
    river: Optional[str] = None
    river_action: str = ""
    showdown: str = ""
    result: str = ""
    all_in_street: Optional[str] = None
    player_count: int = 2
    position: int = 0
    went_to_showdown: bool = False
    players: list[PlayerInfo] = []


class ParseResult(BaseModel):
    success: bool = False
    hands: list[ParsedHand] = []
    count: int = 0
    error: Optional[str] = None


class ImportFileRequest(BaseModel):
    file_path: str


class ParseFileRequest(BaseModel):
    content: Optional[str] = None
    room: Optional[str] = None


class ParseDetectRequest(BaseModel):
    content: Optional[str] = None


class InsertHandsRequest(BaseModel):
    hands: list[ParsedHand]


class HandsQueryOptions(BaseModel):
    page: int = 1
    limit: int = 50
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    position: Optional[str] = None
    result: Optional[str] = None
    game_type: Optional[str] = None
    min_pot: Optional[float] = None
    max_pot: Optional[float] = None
    hero_name: Optional[str] = None
    sort_by: Optional[str] = None


class SessionHistoryRequest(BaseModel):
    limit: int = 50
    hero_name: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    buy_in: Optional[float] = None


class ChartQueryOptions(BaseModel):
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    hero_name: Optional[str] = None
    buy_in: Optional[float] = None
    position: Optional[str] = None


class RangeHeatmapFilters(BaseModel):
    hero_name: Optional[str] = None


class PlayersQueryOptions(BaseModel):
    limit: Optional[int] = None
    min_hands: Optional[int] = None
    is_reg_filter: Optional[str] = None


class EquityRequest(BaseModel):
    hero_cards: Optional[str] = None
    villain_cards: Optional[str] = None
    board: Optional[str] = None
    iterations: Optional[int] = None


class BatchEquityHand(BaseModel):
    id: Optional[str] = None
    hero_cards: Optional[str] = None
    villain_cards: Optional[str] = None
    board: Optional[str] = None


class BatchEquityRequest(BaseModel):
    hands: list[BatchEquityHand]
    iterations: Optional[int] = None


class AnalyzeRangeRequest(BaseModel):
    position: Optional[str] = None
    action: Optional[str] = None
    stack: Optional[int] = None


class ImportProgress(BaseModel):
    message: str = ""
    percent: int = 0
    hands_imported: int = 0
    hands_skipped: int = 0
    total_hands: int = 0
    success: bool = False
    error: Optional[str] = None


class StatsFilters(BaseModel):
    hero_name: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None


class HandResponse(BaseModel):
    id: int
    hand_id: str
    game_id: Optional[str]
    room: str
    game_type: Optional[str]
    game_name: Optional[str]
    buy_in: float
    hand_datetime: datetime
    total_pot: float
    player_count: int
    position: int
    result: str
    preflop_action: str
    flop: Optional[str]
    flop_action: str
    turn: Optional[str]
    turn_action: str
    river: Optional[str]
    river_action: str

    class Config:
        from_attributes = True


class HandsListResponse(BaseModel):
    hands: list[HandResponse]
    total: int
    page: int
    limit: int


class PlayerResponse(BaseModel):
    id: int
    name: str
    is_reg: bool

    class Config:
        from_attributes = True


class StatsResponse(BaseModel):
    total_hands: int
    total_profit: float
    total_ev: float
    win_rate: float
    avg_buy_in: float
    total_tournaments: int


class TournamentResponse(BaseModel):
    id: int
    tournament_id: str
    room: str
    game_type: str
    buy_in: float
    prize_pool: float
    multiplier: int
    players_count: int
    start_time: datetime
    net_profit: float
    rank: Optional[int] = None

    class Config:
        from_attributes = True


class HealthResponse(BaseModel):
    status: str
    database: str
    version: str