from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.database import Hand, Player
from app.schemas.request_response import HandsListResponse, HandsQueryOptions

router = APIRouter(prefix="/database", tags=["Database"])


@router.get("/hands", response_model=HandsListResponse)
async def get_hands(
    page: int = 1,
    limit: int = 50,
    date_from: str | None = None,
    date_to: str | None = None,
    position: int | None = None,
    result: str | None = None,
    game_type: str | None = None,
    min_pot: float | None = None,
    max_pot: float | None = None,
    hero_name: str | None = None,
    sort_by: str | None = "hand_datetime_desc",
    db: AsyncSession = Depends(get_db)
):
    query = select(Hand)
    count_query = select(func.count(Hand.id))

    if date_from:
        query = query.where(Hand.hand_datetime >= date_from)
        count_query = count_query.where(Hand.hand_datetime >= date_from)
    if date_to:
        query = query.where(Hand.hand_datetime <= date_to)
        count_query = count_query.where(Hand.hand_datetime <= date_to)
    if position:
        query = query.where(Hand.position == position)
        count_query = count_query.where(Hand.position == position)
    if result:
        query = query.where(Hand.result == result)
        count_query = count_query.where(Hand.result == result)
    if game_type:
        query = query.where(Hand.game_type == game_type)
        count_query = count_query.where(Hand.game_type == game_type)
    if min_pot:
        query = query.where(Hand.total_pot >= min_pot)
        count_query = count_query.where(Hand.total_pot >= min_pot)
    if max_pot:
        query = query.where(Hand.total_pot <= max_pot)
        count_query = count_query.where(Hand.total_pot <= max_pot)
    if hero_name:
        query = query.join(Player).where(Player.name == hero_name)
        count_query = count_query.join(Player).where(Player.name == hero_name)

    if sort_by == "hand_datetime_desc":
        query = query.order_by(Hand.hand_datetime.desc())
    elif sort_by == "hand_datetime_asc":
        query = query.order_by(Hand.hand_datetime.asc())
    elif sort_by == "total_pot_desc":
        query = query.order_by(Hand.total_pot.desc())
    elif sort_by == "total_pot_asc":
        query = query.order_by(Hand.total_pot.asc())

    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit)

    result_db = await db.execute(query)
    result_count = await db.execute(count_query)

    hands = result_db.scalars().all()
    total = result_count.scalar()

    return HandsListResponse(
        hands=[h for h in hands],
        total=total or 0,
        page=page,
        limit=limit
    )


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    total_hands = await db.scalar(select(func.count(Hand.id)))
    total_players = await db.scalar(select(func.count(Player.id)))

    return {
        "total_hands": total_hands or 0,
        "total_players": total_players or 0
    }