from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.database import init_db, close_db
from app.routers import health, parser, database, tournaments, players, stats, equity, analysis
from app.config import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await close_db()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan
)

app.include_router(health.router)
app.include_router(parser.router)
app.include_router(database.router)
app.include_router(tournaments.router)
app.include_router(players.router)
app.include_router(stats.router)
app.include_router(equity.router)
app.include_router(analysis.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)