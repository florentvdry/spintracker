import pytest
import os


@pytest.mark.asyncio
async def test_betclic_parsing_matches_expected(client):
    file_path = os.path.join(
        os.path.dirname(__file__), 
        '..', 'publish', 'exemple-data', 'Betclic', '21793509_ExportHH_2026-1-2.txt'
    )
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    response = await client.post(
        "/parser/parse",
        json={"content": content, "room": "Betclic"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    
    expected_hands_count = 2815
    assert data["count"] >= expected_hands_count * 0.9


@pytest.mark.asyncio
async def test_betclic_insert_and_verify_stats(client, betclic_sample_content):
    parse_response = await client.post(
        "/parser/parse",
        json={"content": betclic_sample_content, "room": "Betclic"}
    )
    assert parse_response.status_code == 200
    parsed_data = parse_response.json()
    
    insert_response = await client.post(
        "/parser/insert",
        json={"hands": parsed_data["hands"]}
    )
    
    stats_response = await client.get("/stats")
    assert stats_response.status_code == 200
    stats = stats_response.json()
    
    assert stats["total_hands"] == parsed_data["count"]


@pytest.mark.asyncio
async def test_expected_results_jmenfouu_global(client, betclic_sample_content):
    parse_response = await client.post(
        "/parser/parse",
        json={"content": betclic_sample_content, "room": "Betclic"}
    )
    parsed_data = parse_response.json()
    
    insert_response = await client.post(
        "/parser/insert",
        json={"hands": parsed_data["hands"]}
    )
    
    stats_response = await client.get("/stats?hero_name=jmenfouu")
    assert stats_response.status_code == 200
    stats = stats_response.json()
    
    expected_hands = parsed_data["count"]
    assert abs(stats["total_hands"] - expected_hands) < expected_hands * 0.1


@pytest.mark.asyncio
async def test_expected_results_date_filter(client, betclic_sample_content):
    parse_response = await client.post(
        "/parser/parse",
        json={"content": betclic_sample_content, "room": "Betclic"}
    )
    parsed_data = parse_response.json()
    
    insert_response = await client.post(
        "/parser/insert",
        json={"hands": parsed_data["hands"]}
    )
    
    stats_response = await client.get("/stats?hero_name=jmenfouu&date_from=2026-01-02&date_to=2026-01-02")
    assert stats_response.status_code == 200
    stats = stats_response.json()
    
    expected_hands_01_02 = parsed_data["count"]
    assert abs(stats["total_hands"] - expected_hands_01_02) < expected_hands_01_02 * 0.1
