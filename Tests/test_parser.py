import pytest


@pytest.mark.asyncio
async def test_parser_detect(client, betclic_sample_content):
    response = await client.post(
        "/parser/detect",
        json={"content": betclic_sample_content[:5000]}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["count"] > 0


@pytest.mark.asyncio
async def test_parser_parse(client, betclic_sample_content):
    response = await client.post(
        "/parser/parse",
        json={"content": betclic_sample_content[:5000], "room": "Betclic"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["count"] > 0
    assert len(data["hands"]) > 0


@pytest.mark.asyncio
async def test_parser_parse_first_hand(client, betclic_sample_content):
    first_hand = betclic_sample_content.split("------------")[0]
    response = await client.post(
        "/parser/parse",
        json={"content": first_hand, "room": "Betclic"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["count"] == 1
    
    hand = data["hands"][0]
    assert hand["room"] == "Betclic"
    assert hand["hand_id"] == "01KE0EM78GQ5YJ5JGPZKQKTVCA"
    assert hand["buy_in"] == 2.0
    assert hand["total_pot"] == 1360.0


@pytest.mark.asyncio
async def test_parser_detect_missing_content(client):
    response = await client.post(
        "/parser/detect",
        json={"content": ""}
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_parser_parse_missing_content(client):
    response = await client.post(
        "/parser/parse",
        json={"content": ""}
    )
    assert response.status_code == 400
