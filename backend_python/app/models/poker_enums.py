from enum import Enum


class Street(str, Enum):
    PREFLOP = "Preflop"
    FLOP = "Flop"
    TURN = "Turn"
    RIVER = "River"
    SHOWDOWN = "Showdown"
    UNKNOWN = "Unknown"


class Position(str, Enum):
    UTG = "UTG"
    MP = "MP"
    CO = "CO"
    BTN = "BTN"
    SB = "SB"
    BB = "BB"
    BTN_SB = "BTN_SB"
    UNKNOWN = "Unknown"


class Action(str, Enum):
    FOLD = "Fold"
    CHECK = "Check"
    BET = "Bet"
    RAISE = "Raise"
    CALL = "Call"
    ALL_IN = "AllIn"
    ANY = "Any"
    UNKNOWN = "Unknown"


class Actor(str, Enum):
    HERO = "Hero"
    VILLAIN = "Villain"
    ANY = "Any"


STREET_NAMES = ["Preflop", "Flop", "Turn", "River", "Showdown"]
POSITION_NAMES = ["UTG", "MP", "CO", "BTN", "SB", "BB", "BTN_SB"]
ACTION_NAMES = ["Fold", "Check", "Bet", "Raise", "Call", "AllIn", "Any"]


def parse_street(street: str | None) -> Street:
    if not street:
        return Street.UNKNOWN
    street_lower = street.lower()
    mapping = {
        "preflop": Street.PREFLOP,
        "flop": Street.FLOP,
        "turn": Street.TURN,
        "river": Street.RIVER,
        "showdown": Street.SHOWDOWN,
    }
    return mapping.get(street_lower, Street.UNKNOWN)


def parse_position(position: str | None) -> Position:
    if not position:
        return Position.UNKNOWN
    pos_upper = position.upper()
    if "UTG" in pos_upper:
        return Position.UTG
    if "MP" in pos_upper:
        return Position.MP
    if "CO" in pos_upper:
        return Position.CO
    if "BTN" in pos_upper:
        return Position.BTN
    if "SB" in pos_upper and "BB" in pos_upper:
        return Position.BTN_SB
    if "SB" in pos_upper:
        return Position.SB
    if "BB" in pos_upper:
        return Position.BB
    return Position.UNKNOWN


def parse_action(action: str | None) -> Action:
    if not action:
        return Action.UNKNOWN
    action_lower = action.lower()
    mapping = {
        "fold": Action.FOLD,
        "check": Action.CHECK,
        "bet": Action.BET,
        "raise": Action.RAISE,
        "call": Action.CALL,
        "all-in": Action.ALL_IN,
        "allin": Action.ALL_IN,
        "any": Action.ANY,
    }
    return mapping.get(action_lower, Action.UNKNOWN)