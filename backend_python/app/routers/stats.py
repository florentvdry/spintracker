from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.database import Hand, Player, Tournament
from app.schemas.request_response import StatsResponse, StatsFilters, ChartQueryOptions
from datetime import datetime

router = APIRouter(prefix="/stats", tags=["Stats"])


@router.get("", response_model=StatsResponse)
async def get_stats(
    hero_name: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    db: AsyncSession = Depends(get_db)
):
    query = select(Hand)
    count_query = select(func.count(Hand.id))
    tournament_query = select(func.count(Tournament.id))

    if hero_name:
        query = query.join(Player).where(Player.name == hero_name)
        count_query = count_query.join(Player).where(Player.name == hero_name)

    if date_from:
        dt_from = datetime.fromisoformat(date_from)
        query = query.where(Hand.hand_datetime >= dt_from)
        count_query = count_query.where(Hand.hand_datetime >= dt_from)
        tournament_query = tournament_query.where(Tournament.start_time >= dt_from)

    if date_to:
        dt_to = datetime.fromisoformat(date_to)
        dt_to = dt_to.replace(hour=23, minute=59, second=59)
        query = query.where(Hand.hand_datetime <= dt_to)
        count_query = count_query.where(Hand.hand_datetime <= dt_to)
        tournament_query = tournament_query.where(Tournament.start_time <= dt_to)

    total_hands = (await db.execute(count_query)).scalar() or 0

    profit_query = select(
        func.sum(Hand.total_pot).label('total_profit'),
        func.avg(Hand.buy_in).label('avg_buy_in')
    )
    
    if hero_name:
        profit_query = profit_query.join(Player).where(Player.name == hero_name)
    
    if date_from:
        dt_from = datetime.fromisoformat(date_from)
        profit_query = profit_query.where(Hand.hand_datetime >= dt_from)
    
    if date_to:
        dt_to = datetime.fromisoformat(date_to)
        dt_to = dt_to.replace(hour=23, minute=59, second=59)
        profit_query = profit_query.where(Hand.hand_datetime <= dt_to)

    result = await db.execute(profit_query)
    row = result.one()

    total_profit = row.total_profit or 0.0
    avg_buy_in = row.avg_buy_in or 0.0
    win_rate = (total_profit / total_hands * 100) if total_hands > 0 else 0.0

    total_tournaments = (await db.execute(tournament_query)).scalar() or 0

    return StatsResponse(
        total_hands=total_hands,
        total_profit=total_profit,
        total_ev=total_profit,
        win_rate=win_rate,
        avg_buy_in=avg_buy_in,
        total_tournaments=total_tournaments
    )


@router.get("/chart")
async def get_chart_data(
    date_from: str | None = None,
    date_to: str | None = None,
    hero_name: str | None = None,
    buy_in: float | None = None,
    position: str | None = None,
    db: AsyncSession = Depends(get_db)
):
    query = select(
        func.date(Hand.hand_datetime).label('date'),
        func.count(Hand.id).label('hands'),
        func.sum(Hand.total_pot).label('profit')
    ).group_by(func.date(Hand.hand_datetime))

    if hero_name:
        query = query.join(Player).where(Player.name == hero_name)

    if buy_in:
        query = query.where(Hand.buy_in == buy_in)

    result = await db.execute(query)
    rows = result.all()

    return {
        "data": [
            {"date": str(r.date), "hands": r.hands, "profit": r.profit or 0}
            for r in rows
        ]
    }