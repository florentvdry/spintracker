import pytest
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend_python'))

from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import get_db
from app.models.database import Base


TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
async def db_session():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with AsyncSession(engine) as session:
        yield session
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture(scope="function")
async def client(db_session):
    async def override_get_db():
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    
    app.dependency_overrides.clear()


@pytest.fixture
def betclic_sample_content():
    file_path = os.path.join(
        os.path.dirname(__file__), 
        '..', 'publish', 'exemple-data', 'Betclic', '21793509_ExportHH_2026-1-2.txt'
    )
    with open(file_path, 'r', encoding='utf-8') as f:
        return f.read()


@pytest.fixture
def betclic_expected_results():
    return {
        "global": {
            "pseudo": "jmenfouu",
            "total_hands": 4416,
            "tournaments": 300,
            "cev_spinnpro": 86,
            "hu_sb": 32,
            "hu_bb": 21,
            "btn": 24,
            "3w_sb": 5,
            "3w_bb": 4,
            "chips_won": 28500,
            "net_expected_chips_won": 25786,
            "chips_won_with_showdown": 25372,
            "chips_won_without_showdown": 3128,
        },
        "2026-01-02": {
            "pseudo": "jmenfouu",
            "tournaments": 192,
            "cev_spinnpro": 100,
            "hu_sb": 51,
            "hu_bb": 19,
            "btn": 28,
            "3w_sb": -5,
            "3w_bb": 7,
            "chips_won": 19500,
            "net_expected_chips_won": 19130,
            "chips_won_with_showdown": 17726,
            "chips_won_without_showdown": 1774,
        },
        "2026-01-03": {
            "pseudo": "jmenfouu",
            "tournaments": 108,
            "cev_spinnpro": 62,
            "hu_sb": 0,
            "hu_bb": 25,
            "btn": 16,
            "3w_sb": 22,
            "3w_bb": -1,
            "chips_won": 9000,
            "net_expected_chips_won": 6656,
            "chips_won_with_showdown": 7646,
            "chips_won_without_showdown": 1354,
        }
    }
