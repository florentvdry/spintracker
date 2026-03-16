from fastapi import APIRouter, Depends
from app.schemas.request_response import EquityRequest, BatchEquityRequest
from app.engines.equity import calculate_equity, calculate_batch_equity

router = APIRouter(prefix="/equity", tags=["Equity"])


@router.post("/calculate")
async def calculate(request: EquityRequest):
    result = await calculate_equity(
        hero_cards=request.hero_cards,
        villain_cards=request.villain_cards,
        villain2_cards=request.villain2_cards,
        board=request.board,
        iterations=request.iterations
    )
    return result


@router.post("/batch")
async def batch_calculate(request: BatchEquityRequest):
    results = await calculate_batch_equity(
        hands=request.hands,
        iterations=request.iterations
    )
    return {"results": results}