namespace SpinTrackerBackend;

public class MultiplierStats
{
    public int Multiplier { get; set; }
    public int TotalCount { get; set; }
    public double PercentageOfTotal { get; set; }
    public int WinCount { get; set; }
    public int LossCount { get; set; }
    public double WinPercentage { get; set; }
}

public class VoluntaryFoldException : Exception { }

public class HandAnalytics
{
    public string? HandId { get; set; }
    public string? PlayerName { get; set; }
    public double? EvChips { get; set; }
    public double? NetWonAdjusted { get; set; }
    public double? EquityPreflop { get; set; }
    public double? EquityFlop { get; set; }
    public double? EquityTurn { get; set; }
    public double? EquityRiver { get; set; }
    public double? ChipsWonShowdown { get; set; }
    public double? ChipsWonNoShowdown { get; set; }
    public double? CevContribution { get; set; }
}