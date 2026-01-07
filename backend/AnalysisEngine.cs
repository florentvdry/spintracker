namespace PokerTrackerBackend;

public class AnalysisEngine
{
    private readonly ILogger<AnalysisEngine> _logger;
    private readonly Dictionary<string, List<string>> _gtoRanges;

    public AnalysisEngine(ILogger<AnalysisEngine> logger)
    {
        _logger = logger;
        _gtoRanges = GetDefaultRanges();
    }

    public object DetectLeaks(List<ParsedHand> hands, Dictionary<string, object> options)
    {
        var leaks = new List<object>();

        foreach (var hand in hands)
        {
            // Simplified leak detection
            // In production, implement comprehensive leak analysis

            // Example: Check for obvious mistakes
            if (hand.HeroProfit < -100)
            {
                leaks.Add(new
                {
                    handId = hand.Id,
                    leakType = "Large Loss",
                    severity = "High",
                    description = $"Lost {Math.Abs(hand.HeroProfit)} chips"
                });
            }
        }

        return new
        {
            leaks,
            total = leaks.Count
        };
    }

    public object AnalyzeRange(string? position, string? action, int stack)
    {
        if (string.IsNullOrEmpty(position) || !_gtoRanges.ContainsKey(position))
        {
            return new { error = "Invalid position" };
        }

        var range = _gtoRanges[position];

        return new
        {
            position,
            action,
            stack,
            range,
            handCount = range.Count
        };
    }

    private Dictionary<string, List<string>> GetDefaultRanges()
    {
        return new Dictionary<string, List<string>>
        {
            ["BTN"] = new List<string>
            {
                "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22",
                "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
                "AKo", "AQo", "AJo", "ATo", "A9o", "A8o", "A7o", "A6o", "A5o",
                "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s", "K5s",
                "KQo", "KJo", "KTo", "K9o",
                "QJs", "QTs", "Q9s", "Q8s", "Q7s",
                "QJo", "QTo", "Q9o",
                "JTs", "J9s", "J8s", "J7s",
                "JTo", "J9o",
                "T9s", "T8s", "T7s", "T6s",
                "T9o",
                "98s", "97s", "96s", "87s", "86s", "76s", "75s", "65s", "54s"
            },
            ["SB"] = new List<string>
            {
                "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22",
                "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
                "AKo", "AQo", "AJo", "ATo", "A9o", "A8o",
                "KQs", "KJs", "KTs", "K9s", "K8s",
                "KQo", "KJo", "KTo",
                "QJs", "QTs", "Q9s",
                "QJo", "QTo",
                "JTs", "J9s", "T9s", "T8s", "98s", "87s", "76s", "65s"
            },
            ["BB"] = new List<string>
            {
                "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22",
                "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
                "AKo", "AQo", "AJo", "ATo", "A9o", "A8o", "A7o",
                "KQs", "KJs", "KTs", "K9s", "K8s", "K7s",
                "KQo", "KJo", "KTo", "K9o",
                "QJs", "QTs", "Q9s", "Q8s",
                "QJo", "QTo", "Q9o",
                "JTs", "J9s", "J8s", "T9s", "T8s", "98s", "97s", "87s", "76s", "65s", "54s"
            }
        };
    }
}
