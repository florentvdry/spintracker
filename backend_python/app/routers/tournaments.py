from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.database import Tournament
from app.schemas.request_response import TournamentResponse

router = APIRouter(prefix="/tournaments", tags=["Tournaments"])


@router.get("", response_model=list[TournamentResponse])
async def get_tournaments(
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Tournament).order_by(Tournament.start_time.desc()).limit(limit)
    )
    return result.scalars().all()


@router.get("/{tournament_id}", response_model=TournamentResponse)
async def get_tournament(tournament_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Tournament).where(Tournament.id == tournament_id)
    )
    tournament = result.scalar_one_or_none()
    if not tournament:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Tournament not found")
    return tournament