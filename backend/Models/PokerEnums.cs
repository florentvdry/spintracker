namespace SpinTrackerBackend;

public enum Street
{
    Preflop,
    Flop,
    Turn,
    River,
    Showdown,
    Unknown
}

public enum Position
{
    UTG,
    MP,
    CO,
    BTN,
    SB,
    BB,
    BTN_SB,
    Unknown
}

public enum Action
{
    Fold,
    Check,
    Bet,
    Raise,
    Call,
    AllIn,
    Unknown
}

public enum Actor
{
    Hero,
    Villain,
    Any
}

public static class PokerConstants
{
    public static readonly string[] StreetNames = { "Preflop", "Flop", "Turn", "River", "Showdown" };
    
    public static readonly string[] PositionNames = { "UTG", "MP", "CO", "BTN", "SB", "BB", "BTN SB" };
    
    public static readonly string[] ActionNames = { "Fold", "Check", "Bet", "Raise", "Call", "AllIn", "Any" };

    public static Street ParseStreet(string? street)
    {
        if (string.IsNullOrEmpty(street)) return Street.Unknown;
        return street.ToLower() switch
        {
            "preflop" => Street.Preflop,
            "flop" => Street.Flop,
            "turn" => Street.Turn,
            "river" => Street.River,
            "showdown" => Street.Showdown,
            _ => Street.Unknown
        };
    }

    public static Position ParsePosition(string? position)
    {
        if (string.IsNullOrEmpty(position)) return Position.Unknown;
        var posUpper = position.ToUpper();
        if (posUpper.Contains("UTG")) return Position.UTG;
        if (posUpper.Contains("MP")) return Position.MP;
        if (posUpper.Contains("CO")) return Position.CO;
        if (posUpper.Contains("BTN")) return Position.BTN;
        if (posUpper.Contains("SB") && posUpper.Contains("BB")) return Position.BTN_SB;
        if (posUpper.Contains("SB")) return Position.SB;
        if (posUpper.Contains("BB")) return Position.BB;
        return Position.Unknown;
    }

    public static Action ParseAction(string? action)
    {
        if (string.IsNullOrEmpty(action)) return Action.Unknown;
        return action.ToLower() switch
        {
            "fold" => Action.Fold,
            "check" => Action.Check,
            "bet" => Action.Bet,
            "raise" => Action.Raise,
            "call" => Action.Call,
            "all-in" or "allin" => Action.AllIn,
            "any" => Action.Any,
            _ => Action.Unknown
        };
    }
}
