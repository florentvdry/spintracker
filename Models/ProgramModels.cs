namespace SpinTracker;

public record ImportFileRequest(string FilePath);
public record ParseFileRequest(string? Content, string? Room);
public record ParseDetectRequest(string? Content);
public class InsertHandsRequest { public List<ParsedHand> Hands { get; set; } = new(); }
public record HandsQueryOptions
{
    public int Page { get; set; } = 1;
    public int Limit { get; set; } = 50;
    public string? DateFrom { get; set; }
    public string? DateTo { get; set; }
    public string? Position { get; set; }
    public string? Result { get; set; }
    public string? GameType { get; set; }
    public double? MinPot { get; set; }
    public double? MaxPot { get; set; }
    public string? HeroName { get; set; }
    public string? SortBy { get; set; }
}
public record SessionHistoryRequest(int Limit = 50, string? HeroName = null, string? DateFrom = null, string? DateTo = null, double? BuyIn = null);
public record ChartQueryOptions
{
    public string? DateFrom { get; set; }
    public string? DateTo { get; set; }
    public string? HeroName { get; set; }
    public double? BuyIn { get; set; }
    public string? Position { get; set; }
}
public record RangeHeatmapFilters 
{ 
    public string? HeroName { get; set; }
}
public record PlayersQueryOptions
{
    public int? Limit { get; set; }
    public int? MinHands { get; set; }
    public string? IsRegFilter { get; set; }
}
public record EquityRequest(string? HeroCards, string? VillainCards, string? Board);
public record BatchEquityRequest(List<BatchEquityHand> Hands);
public record BatchEquityHand(string? Id, string? HeroCards, string? VillainCards, string? Board);        
public record AnalyzeRangeRequest(string? Position, string? Action, int? Stack);

public class ImportProgress
{
    public string Message { get; set; } = "";
    public int Percent { get; set; }
    public int HandsImported { get; set; }
    public int HandsSkipped { get; set; }
    public int TotalHands { get; set; }
    public bool Success { get; set; }
    public string? Error { get; set; }
}

public class StatsFilters
{
    public string? HeroName { get; set; }
    public string? DateFrom { get; set; }
    public string? DateTo { get; set; }
}

public class ParsedHand
{
    public string Id { get; set; } = "";
    public string? GameId { get; set; }
    public string? HandId { get; set; }
    public string? Room { get; set; }
    public string? GameMode { get; set; }
    public string? GameType { get; set; }
    public string? GameName { get; set; }
    public double PrizePool { get; set; }
    public int Multiplier { get; set; }
    public double BuyIn { get; set; }
    public string? DateTime { get; set; }
    public string? TableId { get; set; }
    public string? Blinds { get; set; }
    public double TotalPot { get; set; }
    public double Rake { get; set; }
    public string? PreflopAction { get; set; }
    public string? Flop { get; set; }
    public string? FlopAction { get; set; }
    public string? Turn { get; set; }
    public string? TurnAction { get; set; }
    public string? River { get; set; }
    public string? RiverAction { get; set; }
    public string? Showdown { get; set; }
    public string? Result { get; set; }
    public string? AllInStreet { get; set; }
    public bool WentToShowdown { get; set; }
    public int PlayerCount { get; set; }
    public string Position { get; set; } = "";
    public string? LimitType { get; set; }
    public string? GameVariant { get; set; }
    public string? Currency { get; set; }
    public int? ButtonSeat { get; set; }
    public double? Ante { get; set; }
    public string? TournamentId { get; set; }
    public string? TournamentName { get; set; }
    public string? TournamentLevel { get; set; }
    public string? BuyinCurrency { get; set; }
    public double? RakePerPlayer { get; set; }
    public List<StreetAction>? StructuredActions { get; set; }
    public List<ParsedPlayer>? Players { get; set; }
}

public class ParsedPlayer
{
    public string Name { get; set; } = "";
    public string? Position { get; set; }
    public int Stack { get; set; }
    public string? Cards { get; set; }
    public double Investment { get; set; }
    public double ChipsWon { get; set; }
    public double NetProfit { get; set; }
    public bool IsAllIn { get; set; }
    public bool WentToShowdown { get; set; }
    public bool IsHero { get; set; }
}

public class StreetAction
{
    public string Street { get; set; } = "";
    public string Action { get; set; } = "";
    public string? Amount { get; set; }
}

public class HandAnalytics
{
    public string? HandId { get; set; }
    public double? EvChips { get; set; }
    public double? NetWonAdjusted { get; set; }
    public double? ChipsWonShowdown { get; set; }
    public double? ChipsWonNoShowdown { get; set; }
    public double? EquityPreflop { get; set; }
    public double? EquityFlop { get; set; }
    public double? EquityTurn { get; set; }
    public double? EquityRiver { get; set; }
    public double? CevContribution { get; set; }
}

public class ParseResult
{
    public List<ParsedHand> Hands { get; set; } = new();
    public string? Error { get; set; }
    public string? Room { get; set; }
}

public class TournamentsResult
{
    public List<TournamentSession> Sessions { get; set; } = new();
    public int TotalCount { get; set; }
}

public class TournamentSession
{
    public string Date { get; set; } = "";
    public double BuyIn { get; set; }
    public double Profit { get; set; }
    public int Hands { get; set; }
}

public class AnalysisFilters
{
    public string? HeroName { get; set; }
    public string? DateFrom { get; set; }
    public string? DateTo { get; set; }
    public string? Position { get; set; }
    public int? StackDepth { get; set; }
    public double? MinPot { get; set; }
    public double? MaxPot { get; set; }
}

public class AnalysisHandsRequest
{
    public AnalysisFilters? Filters { get; set; }
    public int Limit { get; set; } = 100;
    public string? SortBy { get; set; }
}

public class AnalysisHandData
{
    public string HandId { get; set; } = "";
    public string DateTime { get; set; } = "";
    public string Position { get; set; } = "";
    public string Cards { get; set; } = "";
    public double TotalPot { get; set; }
    public double NetResult { get; set; }
    public string? Action { get; set; }
    public int Stack { get; set; }
}