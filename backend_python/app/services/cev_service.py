from app.engines.equity import calculate_equity, parse_cards, parse_board
from app.models.database import Hand, HandPlayer, Player
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List, Dict, Optional
from datetime import datetime


async def calculate_cev_for_player(
    hero_name: str,
    db: AsyncSession,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
) -> dict:
    query = select(Hand, HandPlayer).join(
        HandPlayer, Hand.id == HandPlayer.hand_id
    ).where(
        and_(
            HandPlayer.player_name == hero_name,
            HandPlayer.is_hero == True
        )
    )
    
    if date_from:
        dt_from = datetime.fromisoformat(date_from)
        query = query.where(Hand.hand_datetime >= dt_from)
    
    if date_to:
        dt_to = datetime.fromisoformat(date_to)
        dt_to = dt_to.replace(hour=23, minute=59, second=59)
        query = query.where(Hand.hand_datetime <= dt_to)
    
    result = await db.execute(query)
    rows = result.all()
    
    stats = {
        "hu_sb": {"hands": 0, "chips_won": 0, "cev": 0},
        "hu_bb": {"hands": 0, "chips_won": 0, "cev": 0},
        "btn": {"hands": 0, "chips_won": 0, "cev": 0},
        "3w_sb": {"hands": 0, "chips_won": 0, "cev": 0},
        "3w_bb": {"hands": 0, "chips_won": 0, "cev": 0},
    }
    
    total_chips_won = 0
    total_cev = 0
    total_hands = 0
    tournaments_count = set()
    
    for hand, hand_player in rows:
        if not hand.all_in_street:
            continue
        
        hero_position = hand_player.position or "Unknown"
        player_count = hand.player_count or 2
        
        position_key = get_position_key(hero_position, player_count)
        if not position_key:
            continue
        
        hero_cards = hand_player.cards
        if not hero_cards:
            continue
        
        villain_cards = None
        villain_query = select(HandPlayer).where(
            and_(
                HandPlayer.hand_id == hand.id,
                HandPlayer.is_hero == False,
                HandPlayer.cards.isnot(None)
            )
        )
        villain_result = await db.execute(villain_query)
        villain = villain_result.first()
        
        if villain:
            villain_cards = villain[0].cards
        
        board = ""
        if hand.flop:
            board += hand.flop.replace(" ", "")
        if hand.turn:
            board += hand.turn.replace(" ", "")
        if hand.river:
            board += hand.river.replace(" ", "")
        
        equity_result = await calculate_equity(
            hero_cards=hero_cards,
            villain_cards=villain_cards,
            board=board if board else None
        )
        
        if "error" in equity_result:
            continue
        
        hero_equity = equity_result.get("hero_equity", 0) / 100
        total_pot = hand.total_pot or 0
        
        cev = hero_equity * total_pot
        chips_won = hand_player.chips_won or 0
        
        stats[position_key]["hands"] += 1
        stats[position_key]["chips_won"] += chips_won
        stats[position_key]["cev"] += cev
        
        total_chips_won += chips_won
        total_cev += cev
        total_hands += 1
        
        if hand.tournament_id:
            tournaments_count.add(hand.tournament_id)
    
    num_tournaments = len(tournaments_count)
    if num_tournaments == 0:
        num_tournaments = 1
    
    cev_spinnpro = total_cev / num_tournaments
    
    return {
        "player": hero_name,
        "total_hands": total_hands,
        "total_tournaments": num_tournaments,
        "chips_won": total_chips_won,
        "net_expected_chips_won": round(total_cev, 2),
        "cev_spinnpro": round(cev_spinnpro, 0),
        "by_position": {
            "hu_sb": {
                "hands": stats["hu_sb"]["hands"],
                "chips_won": round(stats["hu_sb"]["chips_won"], 2),
                "cev": round(stats["hu_sb"]["cev"], 2)
            },
            "hu_bb": {
                "hands": stats["hu_bb"]["hands"],
                "chips_won": round(stats["hu_bb"]["chips_won"], 2),
                "cev": round(stats["hu_bb"]["cev"], 2)
            },
            "btn": {
                "hands": stats["btn"]["hands"],
                "chips_won": round(stats["btn"]["chips_won"], 2),
                "cev": round(stats["btn"]["cev"], 2)
            },
            "3w_sb": {
                "hands": stats["3w_sb"]["hands"],
                "chips_won": round(stats["3w_sb"]["chips_won"], 2),
                "cev": round(stats["3w_sb"]["cev"], 2)
            },
            "3w_bb": {
                "hands": stats["3w_bb"]["hands"],
                "chips_won": round(stats["3w_bb"]["chips_won"], 2),
                "cev": round(stats["3w_bb"]["cev"], 2)
            }
        }
    }


def get_position_key(hero_position: str, player_count: int) -> Optional[str]:
    position = hero_position.upper() if hero_position else ""
    
    if player_count == 2:
        if position == "SB":
            return "hu_sb"
        elif position == "BB":
            return "hu_bb"
    elif player_count == 3:
        if position == "BTN":
            return "btn"
        elif position == "SB":
            return "3w_sb"
        elif position == "BB":
            return "3w_bb"
    
    if position == "BTN":
        return "btn"
    elif position == "SB":
        return "hu_sb" if player_count == 2 else "3w_sb"
    elif position == "BB":
        return "hu_bb" if player_count == 2 else "3w_bb"
    
    return None


async def calculate_cev_for_hand(hand_id: int, db: AsyncSession) -> dict:
    query = select(Hand).where(Hand.id == hand_id)
    result = await db.execute(query)
    hand = result.scalar_one_or_none()
    
    if not hand:
        return {"error": "Hand not found"}
    
    hero_query = select(HandPlayer).where(
        and_(
            HandPlayer.hand_id == hand.id,
            HandPlayer.is_hero == True
        )
    )
    hero_result = await db.execute(hero_query)
    hero_player = hero_result.scalar_one_or_none()
    
    if not hero_player:
        return {"error": "Hero not found in hand"}
    
    hero_cards = hero_player.cards
    if not hero_cards:
        return {"error": "No hero cards found"}
    
    villain_query = select(HandPlayer).where(
        and_(
            HandPlayer.hand_id == hand.id,
            HandPlayer.is_hero == False,
            HandPlayer.cards.isnot(None)
        )
    )
    villain_result = await db.execute(villain_query)
    villain = villain_result.first()
    
    villain_cards = villain[0].cards if villain else None
    
    board = ""
    if hand.flop:
        board += hand.flop.replace(" ", "")
    if hand.turn:
        board += hand.turn.replace(" ", "")
    if hand.river:
        board += hand.river.replace(" ", "")
    
    equity_result = await calculate_equity(
        hero_cards=hero_cards,
        villain_cards=villain_cards,
        board=board if board else None
    )
    
    if "error" in equity_result:
        return {"error": equity_result["error"]}
    
    hero_equity = equity_result.get("hero_equity", 0) / 100
    total_pot = hand.total_pot or 0
    
    cev = hero_equity * total_pot
    chips_won = hero_player.chips_won or 0
    
    return {
        "hand_id": hand.hand_id,
        "hero_cards": hero_cards,
        "villain_cards": villain_cards,
        "board": board,
        "total_pot": total_pot,
        "hero_equity": equity_result.get("hero_equity", 0),
        "cev": round(cev, 2),
        "chips_won": chips_won,
        "diff": round(chips_won - cev, 2)
    }
