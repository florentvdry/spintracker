import pytest


@pytest.mark.asyncio
async def test_analysis_range(client):
    response = await client.post(
        "/analysis/range",
        json={
            "position": "BTN",
            "action": "open",
            "stack": 20
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "range" in data or "message" in data


@pytest.mark.asyncio
async def test_analysis_range_sb_open(client):
    response = await client.post(
        "/analysis/range",
        json={
            "position": "SB",
            "action": "open",
            "stack": 15
        }
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_analysis_range_bb_defend(client):
    response = await client.post(
        "/analysis/range",
        json={
            "position": "BB",
            "action": "defend",
            "stack": 20
        }
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_analysis_range_co_open(client):
    response = await client.post(
        "/analysis/range",
        json={
            "position": "CO",
            "action": "open",
            "stack": 25
        }
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_analysis_range_utg_open(client):
    response = await client.post(
        "/analysis/range",
        json={
            "position": "UTG",
            "action": "open",
            "stack": 20
        }
    )
    assert response.status_code == 200
