from app.services.parser_service import parse_file
from app.schemas.request_response import ImportProgress, ParsedHand
from app.models.database import Hand, Player, Tournament, HandPlayer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select


async def import_file(file_path: str, db: AsyncSession = None) -> ImportProgress:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        result = await parse_file(content, None)
        
        if result.success and result.hands and db:
            return await insert_hands(result.hands, db)
        elif result.success:
            return ImportProgress(
                message=f"Parsed {result.count} hands (no DB session - not saved)",
                percent=100,
                hands_imported=0,
                total_hands=result.count,
                success=True
            )
        else:
            return ImportProgress(
                message="Failed to parse file",
                error=result.error,
                success=False
            )
    except Exception as e:
        return ImportProgress(
            message="Error importing file",
            error=str(e),
            success=False
        )


async def insert_hands(hands: list[ParsedHand], db: AsyncSession) -> ImportProgress:
    if not hands:
        return ImportProgress(
            message="No hands to insert",
            percent=100,
            hands_imported=0,
            total_hands=0,
            success=True
        )
    
    if db is None:
        return ImportProgress(
            message="Database session required",
            percent=0,
            hands_imported=0,
            total_hands=len(hands),
            success=False
        )
    
    try:
        inserted_count = 0
        for hand_data in hands:
            if not hand_data.hand_id:
                continue
                
            existing = await db.execute(
                select(Hand).where(Hand.hand_id == hand_data.hand_id)
            )
            if existing.scalar_one_or_none():
                continue
            
            hero_name = hand_data.hero_name
            if not hero_name:
                for p in hand_data.players:
                    if p.is_hero:
                        hero_name = p.name
                        break
            if not hero_name and hand_data.players:
                hero_name = hand_data.players[0].name
            if not hero_name:
                continue
            
            player = await db.execute(
                select(Player).where(Player.name == hero_name)
            )
            player_obj = player.scalar_one_or_none()
            if not player_obj:
                player_obj = Player(name=hero_name)
                db.add(player_obj)
                await db.flush()
            
            tournament_id = None
            if hand_data.tournament_id:
                tournament = await db.execute(
                    select(Tournament).where(Tournament.tournament_id == hand_data.tournament_id)
                )
                tournament_obj = tournament.scalar_one_or_none()
                if not tournament_obj:
                    tournament_obj = Tournament(
                        tournament_id=hand_data.tournament_id,
                        room=hand_data.room,
                        game_type=hand_data.game_type,
                        buy_in=hand_data.buy_in or 0,
                        prize_pool=hand_data.prize_pool,
                        players_count=hand_data.player_count,
                    )
                    db.add(tournament_obj)
                    await db.flush()
                tournament_id = tournament_obj.id
            
            hand = Hand(
                hand_id=hand_data.hand_id,
                game_id=hand_data.game_id,
                room=hand_data.room,
                game_mode=hand_data.game_mode,
                game_type=hand_data.game_type,
                game_name=hand_data.game_name,
                prize_pool=hand_data.prize_pool,
                multiplier=hand_data.multiplier or 1,
                buy_in=hand_data.buy_in or 0,
                hand_datetime=hand_data.hand_datetime,
                table_id=hand_data.table_id,
                blinds=hand_data.blinds,
                total_pot=hand_data.total_pot or 0,
                rake=hand_data.rake or 0,
                player_count=hand_data.player_count,
                position=hand_data.position,
                preflop_action=hand_data.preflop_action,
                flop=hand_data.flop,
                flop_action=hand_data.flop_action,
                turn=hand_data.turn,
                turn_action=hand_data.turn_action,
                river=hand_data.river,
                river_action=hand_data.river_action,
                showdown=hand_data.showdown,
                result=hand_data.result,
                all_in_street=hand_data.all_in_street,
                went_to_showdown=hand_data.went_to_showdown,
                player_id=player_obj.id,
                tournament_id=tournament_id,
            )
            db.add(hand)
            await db.flush()
            
            for p_info in hand_data.players:
                p = await db.execute(
                    select(Player).where(Player.name == p_info.name)
                )
                p_obj = p.scalar_one_or_none()
                if not p_obj:
                    p_obj = Player(name=p_info.name)
                    db.add(p_obj)
                    await db.flush()
                
                hand_player = HandPlayer(
                    hand_id=hand.id,
                    player_name=p_info.name,
                    stack=p_info.stack or 0,
                    investment=p_info.investment or 0,
                    chips_won=p_info.chips_won or 0,
                    net_profit=p_info.net_profit or 0,
                    ev_chips=p_info.ev_chips,
                    cards=p_info.cards,
                    is_hero=p_info.is_hero,
                    folded=p_info.folded,
                    is_all_in=p_info.is_all_in,
                    position=p_info.position,
                    went_to_showdown=p_info.went_to_showdown,
                )
                db.add(hand_player)
            
            inserted_count += 1
        
        await db.commit()
        
        return ImportProgress(
            message=f"Inserted {inserted_count} hands",
            percent=100,
            hands_imported=inserted_count,
            total_hands=len(hands),
            success=True
        )
    except Exception as e:
        await db.rollback()
        return ImportProgress(
            message="Error inserting hands",
            error=str(e),
            success=False
        )