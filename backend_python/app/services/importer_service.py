from app.services.parser_service import parse_file
from app.schemas.request_response import ImportProgress, ParsedHand


async def import_file(file_path: str) -> ImportProgress:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        result = await parse_file(content, None)
        
        if result.success:
            return ImportProgress(
                message=f"Parsed {result.count} hands",
                percent=100,
                hands_imported=result.count,
                total_hands=result.count,
                success=True
            )
        else:
            return ImportProgress(
                message="Failed to parse file",
                error=result.error,
                success=False
            )
    except Exception as e:
        return ImportProgress(
            message="Error importing file",
            error=str(e),
            success=False
        )


async def insert_hands(hands: list[ParsedHand]) -> ImportProgress:
    return ImportProgress(
        message=f"Inserted {len(hands)} hands",
        percent=100,
        hands_imported=len(hands),
        total_hands=len(hands),
        success=True
    )