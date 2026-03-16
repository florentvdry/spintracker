import pytest
from sqlalchemy import select
from app.models.database import Hand, Player


@pytest.mark.asyncio
async def test_database_get_hands_empty(client):
    response = await client.get("/database/hands")
    assert response.status_code == 200
    data = response.json()
    assert data["hands"] == []
    assert data["total"] == 0
    assert data["page"] == 1


@pytest.mark.asyncio
async def test_database_get_hands_with_data(client, db_session, betclic_sample_content):
    parse_response = await client.post(
        "/parser/parse",
        json={"content": betclic_sample_content[:10000], "room": "Betclic"}
    )
    assert parse_response.status_code == 200
    parsed_data = parse_response.json()
    
    insert_response = await client.post(
        "/parser/insert",
        json={"hands": parsed_data["hands"][:10]}
    )
    
    response = await client.get("/database/hands")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] > 0
    assert len(data["hands"]) > 0


@pytest.mark.asyncio
async def test_database_get_hands_pagination(client, db_session):
    response = await client.get("/database/hands?page=1&limit=5")
    assert response.status_code == 200
    data = response.json()
    assert data["page"] == 1
    assert data["limit"] == 5


@pytest.mark.asyncio
async def test_database_get_hands_with_filters(client, db_session):
    response = await client.get("/database/hands?min_pot=100&max_pot=1000")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_database_stats_empty(client):
    response = await client.get("/database/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["total_hands"] == 0
    assert data["total_players"] == 0


@pytest.mark.asyncio
async def test_database_stats_with_data(client, db_session):
    player = Player(name="test_player")
    db_session.add(player)
    await db_session.commit()
    
    response = await client.get("/database/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["total_players"] == 1
