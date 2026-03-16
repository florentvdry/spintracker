import numpy as np
from itertools import combinations
from typing import Generator, Tuple, List, Optional


async def calculate_equity(
    hero_cards: str | None = None,
    villain_cards: str | None = None,
    board: str | None = None,
    iterations: int = 1000
) -> dict:
    if not hero_cards:
        return {"error": "Hero cards required"}

    hero_indices = parse_cards(hero_cards)
    villain_indices: Optional[List[int]] = parse_cards(villain_cards) if villain_cards else None
    board_indices = parse_board(board) if board else []

    all_known = set(hero_indices + (villain_indices if villain_indices else []) + board_indices)
    deck = [i for i in range(52) if i not in all_known]

    cards_to_deal = 5 - len(board_indices)
    if villain_indices is None and cards_to_deal > 0:
        cards_to_deal += 2
    
    if cards_to_deal <= 0:
        cards_to_deal = 0

    if len(deck) < cards_to_deal:
        return {"error": "Not enough cards in deck"}

    all_combos = list(combinations(deck, cards_to_deal)) if cards_to_deal > 0 else [None]

    hero_wins = 0
    ties = 0
    total = 0

    for combo in all_combo_generator(all_combos, villain_indices, board_indices, hero_indices):
        total += 1
        hero_board, villain_board, villain_cards_combo = combo

        hero_score, hero_kickers = evaluate_hand(hero_indices, hero_board)
        if villain_indices:
            villain_score, villain_kickers = evaluate_hand(villain_indices, villain_board)
        else:
            assert villain_cards_combo is not None
            villain_score, villain_kickers = evaluate_hand(list(villain_cards_combo), villain_board)

        if hero_score > villain_score:
            hero_wins += 1
        elif hero_score == villain_score:
            if hero_kickers >= villain_kickers:
                hero_wins += 1
            elif hero_kickers == villain_kickers:
                ties += 1

    hero_equity = (hero_wins / total) * 100 if total > 0 else 0
    tie_equity = (ties / total) * 100 if total > 0 else 0

    return {
        "hero_equity": round(hero_equity, 2),
        "villain_equity": round(100 - hero_equity - tie_equity, 2),
        "tie_equity": round(tie_equity, 2),
        "iterations": total
    }


def all_combo_generator(
    all_combos,
    villain_indices: Optional[List[int]],
    board_indices: List[int],
    hero_indices: List[int]
) -> Generator[Tuple[List[int], List[int], Optional[Tuple[int, ...]]], None, None]:
    board_len = 5 - len(board_indices)

    for combo in all_combos:
        if combo is None:
            yield (list(board_indices), list(board_indices), None)
            continue
        if villain_indices is None:
            villain_cards = combo[:2]
            remaining_board = combo[2:]
            hero_board = list(board_indices) + list(remaining_board)
            villain_board = list(board_indices) + list(remaining_board)
            yield (hero_board, villain_board, villain_cards)
        else:
            hero_board = list(board_indices) + list(combo[:board_len])
            villain_board = list(board_indices) + list(combo[:board_len])
            yield (hero_board, villain_board, None)


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
    cards_str = cards_str.replace(" ", "").replace("-", "")
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


def evaluate_hand(hole_cards: list[int], board: list[int]) -> tuple[int, list[int]]:
    all_cards = hole_cards + board
    if len(all_cards) < 2:
        return (0, [])
    
    ranks = [c // 4 for c in all_cards]
    suits = [c % 4 for c in all_cards]
    
    rank_counts = {}
    for r in ranks:
        rank_counts[r] = rank_counts.get(r, 0) + 1
    
    sorted_counts = sorted(rank_counts.items(), key=lambda x: (-x[1], -x[0]))
    
    is_flush = len(set(suits)) == 1
    
    unique_ranks = sorted(set(ranks), reverse=True)
    
    is_straight = False
    if len(unique_ranks) >= 5:
        for i in range(len(unique_ranks) - 4):
            straight_ranks = unique_ranks[i:i+5]
            if straight_ranks[0] - straight_ranks[4] == 4:
                is_straight = True
                break
        if not is_straight and set([12, 3, 2, 1, 0]) == set(unique_ranks[:5]):
            is_straight = True
    
    if len(all_cards) >= 5:
        if is_flush and is_straight:
            return (9, unique_ranks[:5])
        if sorted_counts[0][1] == 4:
            return (8, [sorted_counts[0][0]] + unique_ranks[:1])
        if sorted_counts[0][1] == 3 and len(sorted_counts) > 1 and sorted_counts[1][1] >= 2:
            return (7, [sorted_counts[0][0], sorted_counts[1][0]])
        if is_flush:
            return (6, unique_ranks[:5])
        if is_straight:
            return (5, unique_ranks[:5])
        if sorted_counts[0][1] == 3:
            kickers = [r for r, c in sorted_counts if c == 1][:2]
            return (4, [sorted_counts[0][0]] + kickers)
        if sorted_counts[0][1] == 2 and len(sorted_counts) > 1 and sorted_counts[1][1] == 2:
            kicker = [r for r, c in sorted_counts if c == 1][0] if len([r for r, c in sorted_counts if c == 1]) > 0 else 0
            return (3, [sorted_counts[0][0], sorted_counts[1][0], kicker])
        if sorted_counts[0][1] == 2:
            kickers = [r for r, c in sorted_counts if c == 1][:3]
            return (2, [sorted_counts[0][0]] + kickers)
    
    return (1, unique_ranks[:5])