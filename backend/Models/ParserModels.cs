namespace SpinTrackerBackend;

public enum ActionType
{
    deal_board,
    post,
    fold,
    check,
    bet,
    call,
    raise,
    all_in,
    runout,
    win
}

public class StreetAction
{
    public string Street { get; set; } = "";
    public int Order { get; set; }
    public string Player { get; set; } = "";
    public ActionType Type { get; set; }
    public string? PostType { get; set; }
    public double? Amount { get; set; }
    public double? Effective { get; set; }
    public bool IsAllIn { get; set; }
    public List<string>? Cards { get; set; }
    public int? RunoutNumber { get; set; }
}

public class BlindsInfo
{
    public double Sb { get; set; }
    public double Bb { get; set; }
    public double? Ante { get; set; }
}

public class PotInfo
{
    public double MainPot { get; set; }
    public List<SidePot>? SidePots { get; set; }
}

public class SidePot
{
    public double Amount { get; set; }
    public List<string> EligiblePlayers { get; set; } = new();
}

public class WinnerInfo
{
    public string Player { get; set; } = "";
    public double Amount { get; set; }
    public string? Hand { get; set; }
    public List<string>? Cards { get; set; }
}

public class BoardInfo
{
    public List<string>? Flop { get; set; }
    public string? Turn { get; set; }
    public string? River { get; set; }
}

public class HandSummary
{
    public double TotalPot { get; set; }
    public double Rake { get; set; }
    public List<WinnerInfo> Winners { get; set; } = new();
}

public class HandInfo
{
    public string? HandId { get; set; }
    public string? Room { get; set; }
    public string? Table { get; set; }
    public int TableSize { get; set; } = 6;
    public int? ButtonSeat { get; set; }
    public string? Date { get; set; }
    public string? Limit { get; set; }
    public string? Game { get; set; }
    public BlindsInfo? Blinds { get; set; }
    public string? Currency { get; set; }
    public string? GameType { get; set; }
    public string? TournamentId { get; set; }
    public string? TournamentName { get; set; }
    public int? TournamentLevel { get; set; }
    public double? BuyIn { get; set; }
    public string? BuyinCurrency { get; set; }
    public int? Multiplier { get; set; }
    public double? PrizePool { get; set; }
    public int? Position { get; set; }
    public double? Ante { get; set; }
    public int? PlayersRemaining { get; set; }
    public int? TotalPlayers { get; set; }
    public double? RakePerPlayer { get; set; }
}

public class PlayerHandInfo
{
    public int Seat { get; set; }
    public string Name { get; set; } = "";
    public double Stack { get; set; }
    public bool IsHero { get; set; }
}

public class HandActions
{
    public HandInfo? Info { get; set; }
    public List<PlayerHandInfo> Players { get; set; } = new();
    public List<StreetAction> Actions { get; set; } = new();
    public BoardInfo? Board { get; set; }
    public PotInfo? Pots { get; set; }
    public HandSummary? Summary { get; set; }
    public List<object>? Runouts { get; set; }
}

public class ParseResult
{
    public bool Success { get; set; }
    public List<ParsedHand> Hands { get; set; } = new();
    public int Count { get; set; }
    public string? Error { get; set; }
}

public class ParsedHand
{
    public string? Id { get; set; }
    public string? GameId { get; set; }
    public string? HandId { get; set; }
    public string? Room { get; set; }
    public string? GameMode { get; set; }
    public string? GameType { get; set; }
    public string? GameName { get; set; }
    public double PrizePool { get; set; }
    public int Multiplier { get; set; } = 1;
    public double BuyIn { get; set; }
    public string? DateTime { get; set; }
    public string? TableId { get; set; }
    public string? Blinds { get; set; }
    public double TotalPot { get; set; }
    public double Rake { get; set; }
    public string PreflopAction { get; set; } = "";
    public string? Flop { get; set; }
    public string FlopAction { get; set; } = "";
    public string? Turn { get; set; }
    public string TurnAction { get; set; } = "";
    public string? River { get; set; }
    public string RiverAction { get; set; } = "";
    public string Showdown { get; set; } = "";
    public string Result { get; set; } = "";
    public string? AllInStreet { get; set; }
    public int PlayerCount { get; set; } = 2;
    public int Position { get; set; } = 0;
    public bool WentToShowdown { get; set; }
    public List<PlayerInfo> Players { get; set; } = new();

    public string? LimitType { get; set; }
    public string? GameVariant { get; set; }
    public string? Currency { get; set; }
    public int? ButtonSeat { get; set; }
    public double? Ante { get; set; }
    public string? TournamentId { get; set; }
    public string? TournamentName { get; set; }
    public int? TournamentLevel { get; set; }
    public string? BuyinCurrency { get; set; }
    public double? RakePerPlayer { get; set; }

    public BlindsInfo? StructuredBlinds { get; set; }
    public HandActions? StructuredActions { get; set; }
}

public class PlayerInfo
{
    public string Name { get; set; } = "";
    public double Stack { get; set; }
    public double Investment { get; set; }
    public double ChipsWon { get; set; }
    public double NetProfit { get; set; }
    public double? EvChips { get; set; }
    public string Cards { get; set; } = "";
    public bool IsHero { get; set; }
    public bool Folded { get; set; }
    public bool IsAllIn { get; set; }
    public string Position { get; set; } = "";
    public bool WentToShowdown { get; set; }
}