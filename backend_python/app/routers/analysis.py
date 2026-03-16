from fastapi import APIRouter, Depends
from app.schemas.request_response import AnalyzeRangeRequest
from app.services.analysis_service import analyze_range

router = APIRouter(prefix="/analysis", tags=["Analysis"])


@router.post("/range")
async def analyze_range_endpoint(request: AnalyzeRangeRequest):
    result = await analyze_range(
        position=request.position,
        action=request.action,
        stack=request.stack
    )
    return result