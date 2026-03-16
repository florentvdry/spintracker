from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.database import Hand, Player
from app.schemas.request_response import HandsListResponse

router = APIRouter(prefix="/hands", tags=["Hands"])


@router.get("", response_model=HandsListResponse)
async def get_hands(
    page: int = 1,
    limit: int = 50,
    date_from: str | None = None,
    date_to: str | None = None,
    hero_name: str | None = None,
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
    if hero_name:
        query = query.join(Player).where(Player.name == hero_name)
        count_query = count_query.join(Player).where(Player.name == hero_name)

    query = query.order_by(Hand.hand_datetime.desc())

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


@router.get("/{hand_id}")
async def get_hand(hand_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Hand).where(Hand.id == hand_id))
    hand = result.scalar_one_or_none()
    if not hand:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Hand not found")
    return hand
