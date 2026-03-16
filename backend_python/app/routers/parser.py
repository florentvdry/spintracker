from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.request_response import (
    ParseResult, ParseFileRequest, ParseDetectRequest, ImportFileRequest, InsertHandsRequest, ImportProgress
)
from app.services.parser_service import detect_and_parse, parse_file
from app.services.importer_service import insert_hands, import_file

router = APIRouter(prefix="/parser", tags=["Parser"])


@router.post("/detect", response_model=ParseResult)
async def detect(request: ParseDetectRequest):
    if not request.content:
        raise HTTPException(status_code=400, detail="Content is required")
    return await detect_and_parse(request.content)


@router.post("/parse", response_model=ParseResult)
async def parse(request: ParseFileRequest):
    if not request.content:
        raise HTTPException(status_code=400, detail="Content is required")
    return await parse_file(request.content, request.room)


@router.post("/import", response_model=ImportProgress)
async def import_hands(request: ImportFileRequest):
    if not request.file_path:
        raise HTTPException(status_code=400, detail="File path is required")
    return await import_file(request.file_path)


@router.post("/insert", response_model=ImportProgress)
async def insert(request: InsertHandsRequest, db: AsyncSession = Depends(get_db)):
    return await insert_hands(request.hands, db)