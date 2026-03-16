from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.cev_service import calculate_cev_for_player, calculate_cev_for_hand

router = APIRouter(prefix="/cev", tags=["CEV"])


@router.get("")
async def get_player_cev(
    hero_name: str = Query(..., description="Player name"),
    date_from: str | None = Query(None, description="Start date (ISO format)"),
    date_to: str | None = Query(None, description="End date (ISO format)"),
    db: AsyncSession = Depends(get_db)
):
    result = await calculate_cev_for_player(hero_name, db, date_from, date_to)
    return result


@router.get("/hand/{hand_id}")
async def get_hand_cev(
    hand_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await calculate_cev_for_hand(hand_id, db)
    return result
