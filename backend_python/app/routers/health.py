from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.config import get_settings
from app.schemas.request_response import HealthResponse

router = APIRouter(prefix="/health", tags=["Health"])
settings = get_settings()


@router.get("", response_model=HealthResponse)
async def health_check(db: AsyncSession = Depends(get_db)):
    return HealthResponse(
        status="healthy",
        database="connected",
        version=settings.app_version
    )