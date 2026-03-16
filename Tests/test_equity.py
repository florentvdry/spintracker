import pytest


@pytest.mark.asyncio
async def test_equity_calculate(client):
    response = await client.post(
        "/equity/calculate",
        json={
            "hero_cards": "Ah Kh",
            "villain_cards": "7d 8s",
            "board": "2c 4d 9h",
            "iterations": 1000
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "hero_equity" in data
    assert "villain_equity" in data
    assert data["hero_equity"] + data["villain_equity"] == pytest.approx(100.0, rel=1.0)


@pytest.mark.asyncio
async def test_equity_calculate_without_board(client):
    response = await client.post(
        "/equity/calculate",
        json={
            "hero_cards": "As Ks",
            "villain_cards": "7d 8s",
            "iterations": 500
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "hero_equity" in data
    assert "villain_equity" in data
    assert data["hero_equity"] > 0


@pytest.mark.asyncio
async def test_equity_batch(client):
    response = await client.post(
        "/equity/batch",
        json={
            "hands": [
                {"hero_cards": "Ah Kh", "villain_cards": "7d 8s"},
                {"hero_cards": "As Ks", "villain_cards": "7d 8c"}
            ],
            "iterations": 500
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert len(data["results"]) == 2


@pytest.mark.asyncio
async def test_equity_calculate_high_cards_vs_low(client):
    response = await client.post(
        "/equity/calculate",
        json={
            "hero_cards": "As Ks",
            "villain_cards": "2d 7s",
            "iterations": 1000
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["hero_equity"] > data["villain_equity"]


@pytest.mark.asyncio
async def test_equity_calculate_pocket_pairs(client):
    response = await client.post(
        "/equity/calculate",
        json={
            "hero_cards": "As Ah",
            "villain_cards": "Ks Qh",
            "iterations": 1000
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["hero_equity"] > 80.0
