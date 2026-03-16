import pytest
from app.models.database import Player


@pytest.mark.asyncio
async def test_players_get_empty(client):
    response = await client.get("/players")
    assert response.status_code == 200
    data = response.json()
    assert data == []


@pytest.mark.asyncio
async def test_players_get_with_data(client, db_session):
    player = Player(name="test_player", is_reg=False)
    db_session.add(player)
    await db_session.commit()
    
    response = await client.get("/players")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "test_player"
    assert data[0]["is_reg"] is False


@pytest.mark.asyncio
async def test_players_get_by_id(client, db_session):
    player = Player(name="test_player", is_reg=True)
    db_session.add(player)
    await db_session.commit()
    
    response = await client.get("/players/1")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "test_player"
    assert data["is_reg"] is True


@pytest.mark.asyncio
async def test_players_get_by_id_not_found(client):
    response = await client.get("/players/999")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_players_update(client, db_session):
    player = Player(name="test_player", is_reg=False)
    db_session.add(player)
    await db_session.commit()
    
    response = await client.patch("/players/1?is_reg=true")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    
    get_response = await client.get("/players/1")
    player_data = get_response.json()
    assert player_data["is_reg"] is True


@pytest.mark.asyncio
async def test_players_filter_by_reg(client, db_session):
    player1 = Player(name="reg_player", is_reg=True)
    player2 = Player(name="fish_player", is_reg=False)
    db_session.add_all([player1, player2])
    await db_session.commit()
    
    response = await client.get("/players?is_reg_filter=true")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "reg_player"


@pytest.mark.asyncio
async def test_players_limit(client, db_session):
    for i in range(10):
        player = Player(name=f"player_{i}")
        db_session.add(player)
    await db_session.commit()
    
    response = await client.get("/players?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 5
