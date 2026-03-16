import pytest
from app.models.database import Tournament
from datetime import datetime


@pytest.mark.asyncio
async def test_tournaments_get_empty(client):
    response = await client.get("/tournaments")
    assert response.status_code == 200
    data = response.json()
    assert data == []


@pytest.mark.asyncio
async def test_tournaments_get_with_data(client, db_session):
    tournament = Tournament(
        tournament_id="test_001",
        room="Betclic",
        game_type="NL Texas Hold'em",
        buy_in=2.0,
        prize_pool=4.0,
        multiplier=2,
        players_count=2,
        start_time=datetime(2026, 1, 2, 22, 53, 5)
    )
    db_session.add(tournament)
    await db_session.commit()
    
    response = await client.get("/tournaments")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["tournament_id"] == "test_001"
    assert data[0]["room"] == "Betclic"


@pytest.mark.asyncio
async def test_tournaments_get_by_id(client, db_session):
    tournament = Tournament(
        tournament_id="test_001",
        room="Betclic",
        game_type="NL Texas Hold'em",
        buy_in=2.0,
        prize_pool=4.0,
        multiplier=2,
        players_count=2,
        start_time=datetime(2026, 1, 2, 22, 53, 5)
    )
    db_session.add(tournament)
    await db_session.commit()
    
    response = await client.get("/tournaments/1")
    assert response.status_code == 200
    data = response.json()
    assert data["tournament_id"] == "test_001"


@pytest.mark.asyncio
async def test_tournaments_get_by_id_not_found(client):
    response = await client.get("/tournaments/999")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_tournaments_limit(client, db_session):
    for i in range(10):
        tournament = Tournament(
            tournament_id=f"test_{i:03d}",
            room="Betclic",
            game_type="NL Texas Hold'em",
            buy_in=2.0,
            start_time=datetime(2026, 1, 2, 22, 53, i)
        )
        db_session.add(tournament)
    await db_session.commit()
    
    response = await client.get("/tournaments?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 5
