namespace SpinTrackerBackend;

public class AnalysisFilters
{
    public string? HeroName { get; set; }
    public string? Situation { get; set; }
    public string? Action { get; set; }
    
    // Detailed Street Actions by Position
    public string? PreflopBtnAction { get; set; }
    public string? PreflopSbAction { get; set; }
    public string? PreflopBbAction { get; set; }
    
    public string? FlopBtnAction { get; set; }
    public string? FlopSbAction { get; set; }
    public string? FlopBbAction { get; set; }
    
    public string? TurnBtnAction { get; set; }
    public string? TurnSbAction { get; set; }
    public string? TurnBbAction { get; set; }
    
    public string? RiverBtnAction { get; set; }
    public string? RiverSbAction { get; set; }
    public string? RiverBbAction { get; set; }

    public double? MinStackBB { get; set; }
    public double? MaxStackBB { get; set; }
    public string[]? Positions { get; set; } // Hero Position filter
    public int? PlayerCount { get; set; } // New filter
    public List<string>? ActionSequence { get; set; } // Ordered sequence: "BTN:Raise", "SB:Call"
    public string? SituationId { get; set; } // e.g., "rfi", "limp" for preflop situations
    public string? DateFrom { get; set; }
    public string? DateTo { get; set; }
}

public class AnalysisHandsRequest : AnalysisFilters
{
    public int Page { get; set; } = 1;
    public int Limit { get; set; } = 50;
    public string SortBy { get; set; } = "date_desc"; // date_desc, date_asc, profit_desc, profit_asc
}

public class AnalysisHandsResult
{
    public List<object> Hands { get; set; } = new();
    public int Total { get; set; }
    public int Page { get; set; }
    public int Limit { get; set; }
    public int Pages { get; set; }
}

public class TournamentSummary
{
    public string GameId { get; set; } = "";
    public string Room { get; set; } = "";
    public DateTime DateTime { get; set; }
    public double BuyIn { get; set; }
    public double PrizePool { get; set; }
    public double NetProfit { get; set; }
    public double ChipProfit { get; set; }
    public double AvgCev { get; set; }
    public int HandCount { get; set; }
}

public class TournamentsResult
{
    public List<TournamentSummary> Tournaments { get; set; } = new();
    public int Total { get; set; }
    public int Page { get; set; }
    public int Limit { get; set; }
    public int Pages { get; set; }
}

public class AnalysisHandData
{
    public string HandId { get; set; } = "";
    public string? HeroName { get; set; } // The name of the hero in this hand
    public DateTime Date { get; set; }
    public double Profit { get; set; }
    public string PreflopAction { get; set; } = "";
    public string FlopAction { get; set; } = "";
    public string TurnAction { get; set; } = "";
    public string RiverAction { get; set; } = "";
    public string HeroPosition { get; set; } = "";
    public double HeroStack { get; set; }
    public string Blinds { get; set; } = "";
    public bool WentToShowdown { get; set; }
    public double TotalPot { get; set; }
    public double Investment { get; set; }
    public string? Flop { get; set; }
    public string? Turn { get; set; }
    public string? River { get; set; }
    public double? EvChips { get; set; }
    public string PlayerPositionsMap { get; set; } = ""; // "Player1:BTN|Player2:SB"
    public string? HeroCards { get; set; }
}

public class AnalysisStatsResult
{
    public int TotalHands { get; set; }
    public double TotalProfit { get; set; }
    public double Vpip { get; set; }
    public double Pfr { get; set; }
    public double ThreeBet { get; set; }
    public double Wtsd { get; set; }
    public double Wsd { get; set; }
    public double AggressionFreq { get; set; }
    public List<GraphPoint> GraphData { get; set; } = new();
}

public class GraphPoint
{
    public string Date { get; set; } = "";
    public double Profit { get; set; }
    public double CumulativeProfit { get; set; }
}

public class RangeAnalysisResult
{
    public string Position { get; set; } = "";
    public string Action { get; set; } = "";
    public int Stack { get; set; }
    public string Range { get; set; } = "";
    public double Vpip { get; set; }
    public double Pfr { get; set; }
}
