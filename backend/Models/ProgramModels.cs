namespace SpinTrackerBackend;

// ============ Request/Response Models ============
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
    public string? Opponent { get; set; }
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
}
public record EquityRequest(string? HeroCards, string? VillainCards, string? Board, int? Iterations);
public record BatchEquityRequest(List<BatchEquityHand> Hands, int? Iterations);
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
