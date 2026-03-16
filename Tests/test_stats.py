import pytest
from app.models.database import Hand, Player, Tournament
from datetime import datetime


@pytest.mark.asyncio
async def test_stats_empty(client):
    response = await client.get("/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["total_hands"] == 0
    assert data["total_profit"] == 0.0
    assert data["total_tournaments"] == 0


@pytest.mark.asyncio
async def test_stats_with_hands(client, db_session):
    player = Player(name="test_player")
    db_session.add(player)
    await db_session.flush()
    
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
    await db_session.flush()
    
    hand = Hand(
        hand_id="hand_001",
        room="Betclic",
        game_type="Spin",
        buy_in=2.0,
        total_pot=100.0,
        player_count=2,
        position=1,
        result="win",
        player_id=player.id,
        tournament_id=tournament.id,
        hand_datetime=datetime(2026, 1, 2, 22, 53, 5)
    )
    db_session.add(hand)
    await db_session.commit()
    
    response = await client.get("/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["total_hands"] == 1
    assert data["total_profit"] == 100.0
    assert data["total_tournaments"] == 1


@pytest.mark.asyncio
async def test_stats_with_hero_name(client, db_session):
    player = Player(name="jmenfouu")
    db_session.add(player)
    await db_session.flush()
    
    hand = Hand(
        hand_id="hand_001",
        room="Betclic",
        game_type="Spin",
        buy_in=2.0,
        total_pot=100.0,
        player_count=2,
        position=1,
        result="win",
        player_id=player.id,
        hand_datetime=datetime(2026, 1, 2, 22, 53, 5)
    )
    db_session.add(hand)
    await db_session.commit()
    
    response = await client.get("/stats?hero_name=jmenfouu")
    assert response.status_code == 200
    data = response.json()
    assert data["total_hands"] == 1


@pytest.mark.asyncio
async def test_stats_with_date_filter(client, db_session):
    player = Player(name="test_player")
    db_session.add(player)
    await db_session.flush()
    
    hand1 = Hand(
        hand_id="hand_001",
        room="Betclic",
        game_type="Spin",
        buy_in=2.0,
        total_pot=50.0,
        player_count=2,
        position=1,
        result="win",
        player_id=player.id,
        hand_datetime=datetime(2026, 1, 2, 22, 53, 5)
    )
    hand2 = Hand(
        hand_id="hand_002",
        room="Betclic",
        game_type="Spin",
        buy_in=2.0,
        total_pot=100.0,
        player_count=2,
        position=1,
        result="win",
        player_id=player.id,
        hand_datetime=datetime(2026, 1, 3, 22, 53, 5)
    )
    db_session.add_all([hand1, hand2])
    await db_session.commit()
    
    response = await client.get("/stats?date_from=2026-01-02&date_to=2026-01-02")
    assert response.status_code == 200
    data = response.json()
    assert data["total_hands"] == 1


@pytest.mark.asyncio
async def test_stats_chart_empty(client):
    response = await client.get("/stats/chart")
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert data["data"] == []
