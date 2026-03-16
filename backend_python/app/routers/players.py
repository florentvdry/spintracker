from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.database import Player
from app.schemas.request_response import PlayerResponse, PlayersQueryOptions
from typing import Optional

router = APIRouter(prefix="/players", tags=["Players"])


@router.get("", response_model=list[PlayerResponse])
async def get_players(
    limit: Optional[int] = None,
    min_hands: Optional[int] = None,
    is_reg_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    query = select(Player)

    if is_reg_filter is not None:
        is_reg = is_reg_filter.lower() == "true"
        query = query.where(Player.is_reg == is_reg)

    if limit:
        query = query.limit(limit)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{player_id}", response_model=PlayerResponse)
async def get_player(player_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Player).where(Player.id == player_id))
    player = result.scalar_one_or_none()
    if not player:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Player not found")
    return player


@router.patch("/{player_id}")
async def update_player(
    player_id: int,
    is_reg: bool,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Player).where(Player.id == player_id))
    player = result.scalar_one_or_none()
    if not player:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Player not found")

    player.is_reg = is_reg
    await db.commit()
    return {"success": True}