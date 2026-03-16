import random


async def calculate_equity(
    hero_cards: str | None = None,
    villain_cards: str | None = None,
    board: str | None = None,
    iterations: int = 1000
) -> dict:
    if not hero_cards:
        return {"error": "Hero cards required"}

    hero_wins = 0
    ties = 0

    for _ in range(iterations):
        h1, h2 = parse_cards(hero_cards)
        v1, v2 = parse_cards(villain_cards) if villain_cards else (random.randint(0, 51), random.randint(0, 51))
        
        hero_score = evaluate_hand([h1, h2], parse_board(board) if board else [])
        villian_score = evaluate_hand([v1, v2], parse_board(board) if board else [])

        if hero_score > villian_score:
            hero_wins += 1
        elif hero_score == villian_score:
            ties += 1

    hero_equity = (hero_wins / iterations) * 100
    tie_equity = (ties / iterations) * 100

    return {
        "hero_equity": round(hero_equity, 2),
        "villain_equity": round(100 - hero_equity - tie_equity, 2),
        "tie_equity": round(tie_equity, 2),
        "iterations": iterations
    }


async def calculate_batch_equity(hands: list, iterations: int = 1000) -> list:
    results = []
    for hand in hands:
        result = await calculate_equity(
            hero_cards=hand.hero_cards,
            villain_cards=hand.villain_cards,
            board=hand.board,
            iterations=iterations
        )
        results.append({
            "id": hand.id,
            **result
        })
    return results


def parse_cards(cards_str: str) -> list[int]:
    if not cards_str:
        return []
    ranks = "23456789TJQKA"
    suits = "shdc"
    cards = []
    for i in range(0, len(cards_str), 2):
        if i + 1 < len(cards_str):
            rank = ranks.index(cards_str[i].upper())
            suit = suits.index(cards_str[i + 1].lower())
            cards.append(rank * 4 + suit)
    return cards


def parse_board(board_str: str) -> list[int]:
    return parse_cards(board_str)


def evaluate_hand(hole_cards: list[int], board: list[int]) -> int:
    all_cards = hole_cards + board
    if len(all_cards) < 5:
        return 0
    
    ranks = [c // 4 for c in all_cards]
    suits = [c % 4 for c in all_cards]
    
    rank_counts = {}
    for r in ranks:
        rank_counts[r] = rank_counts.get(r, 0) + 1
    
    sorted_counts = sorted(rank_counts.values(), reverse=True)
    
    if sorted_counts[0] == 4:
        return 8
    elif sorted_counts[0] == 3 and len(sorted_counts) > 1 and sorted_counts[1] == 2:
        return 7
    elif len(set(suits)) == 1:
        return 5
    elif len(set(ranks)) != len(ranks):
        return max(sorted_counts)
    
    return max(sorted_counts)