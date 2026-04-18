namespace SpinTracker.ViewModels;

public class SessionInfo
{
    public string Date { get; set; } = "";
    public double BuyIn { get; set; }
    public double Profit { get; set; }
    public int Hands { get; set; }
}

public class HandsQueryOptions
{
    public int Page { get; set; } = 1;
    public int Limit { get; set; } = 50;
    public string? DateFrom { get; set; }
    public string? DateTo { get; set; }
    public string? Position { get; set; }
    public string? HeroName { get; set; }
}

public class HandDisplay
{
    public string Id { get; set; } = "";
    public string DateTime { get; set; } = "";
    public string Position { get; set; } = "";
    public string Cards { get; set; } = "";
    public double TotalPot { get; set; }
    public int PlayerCount { get; set; }
    public double? Result { get; set; }
}

public class PlayerDisplay
{
    public string Name { get; set; } = "";
    public int TotalHands { get; set; }
    public bool IsReg { get; set; }
}