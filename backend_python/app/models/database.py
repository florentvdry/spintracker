from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, ForeignKey, Index
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Player(Base):
    __tablename__ = "players"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False, unique=True)
    is_reg = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    hands = relationship("Hand", back_populates="player")
    tournaments = relationship("TournamentPlayer", back_populates="player")


class Tournament(Base):
    __tablename__ = "tournaments"

    id = Column(Integer, primary_key=True)
    tournament_id = Column(String(255), unique=True)
    room = Column(String(50))
    game_type = Column(String(50))
    game_name = Column(String(255))
    buy_in = Column(Float)
    prize_pool = Column(Float)
    multiplier = Column(Integer, default=1)
    players_count = Column(Integer)
    net_profit = Column(Float, default=0)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    players_rel = relationship("TournamentPlayer", back_populates="tournament")
    hands = relationship("Hand", back_populates="tournament")

    __table_args__ = (
        Index("idx_tournament_id", "tournament_id"),
        Index("idx_tournament_room", "room"),
    )


class TournamentPlayer(Base):
    __tablename__ = "tournament_players"

    id = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    position = Column(Integer)
    chips = Column(Float)
    prize = Column(Float)
    rank = Column(Integer)

    tournament = relationship("Tournament", back_populates="players_rel")
    player = relationship("Player", back_populates="tournaments")


class Hand(Base):
    __tablename__ = "hands"

    id = Column(Integer, primary_key=True)
    hand_id = Column(String(255), unique=True)
    game_id = Column(String(255))
    room = Column(String(50))
    game_mode = Column(String(50))
    game_type = Column(String(50))
    game_name = Column(String(255))
    prize_pool = Column(Float)
    multiplier = Column(Integer, default=1)
    buy_in = Column(Float)
    hand_datetime = Column(DateTime)
    table_id = Column(String(255))
    blinds = Column(String(50))
    total_pot = Column(Float)
    rake = Column(Float)
    player_count = Column(Integer)
    position = Column(Integer)
    preflop_action = Column(Text)
    flop = Column(String(50))
    flop_action = Column(Text)
    turn = Column(String(50))
    turn_action = Column(Text)
    river = Column(String(50))
    river_action = Column(Text)
    showdown = Column(Text)
    result = Column(String(255))
    all_in_street = Column(String(50))
    went_to_showdown = Column(Boolean)

    player_id = Column(Integer, ForeignKey("players.id"))
    player = relationship("Player", back_populates="hands")
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=True)
    tournament = relationship("Tournament", back_populates="hands")

    players_info = relationship("HandPlayer", back_populates="hand")

    __table_args__ = (
        Index("idx_hand_id", "hand_id"),
        Index("idx_hand_datetime", "hand_datetime"),
        Index("idx_player_id", "player_id"),
        Index("idx_room", "room"),
    )


class HandPlayer(Base):
    __tablename__ = "hand_players"

    id = Column(Integer, primary_key=True)
    hand_id = Column(Integer, ForeignKey("hands.id"), nullable=False)
    player_name = Column(String(255))
    stack = Column(Float)
    investment = Column(Float)
    chips_won = Column(Float)
    net_profit = Column(Float)
    ev_chips = Column(Float, nullable=True)
    cards = Column(String(10))
    is_hero = Column(Boolean, default=False)
    folded = Column(Boolean, default=False)
    is_all_in = Column(Boolean, default=False)
    position = Column(String(50))
    went_to_showdown = Column(Boolean)

    hand = relationship("Hand", back_populates="players_info")


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True)
    player_id = Column(Integer, ForeignKey("players.id"))
    room = Column(String(50))
    game_type = Column(String(50))
    buy_in = Column(Float)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    total_hands = Column(Integer)
    net_profit = Column(Float)
    ev_chips = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)


class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True)
    key = Column(String(255), unique=True, nullable=False)
    value = Column(Text)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)