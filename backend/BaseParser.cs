using System.Text.RegularExpressions;
using System.Globalization;

namespace SpinTrackerBackend;

public interface IHandParser
{
    string RoomName { get; }
    int ParserVersion { get; }
    bool DetectFormat(string content);
    ParseResult ParseFile(string fileContent);
    ParsedHand? ParseHand(string handText);
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
    public bool WentToShowdown { get; set; }
    public List<PlayerInfo> Players { get; set; } = new();
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

public static class ParserFactory
{
    private static readonly List<IHandParser> _parsers = new()
    {
        new BetclicParser()
    };

    public static IHandParser? GetParser(string content)
    {
        foreach (var parser in _parsers)
        {
            if (parser.DetectFormat(content))
                return parser;
        }
        return null;
    }

    public static IHandParser? GetParserByRoom(string room)
    {
        return _parsers.FirstOrDefault(p =>
            p.RoomName.Equals(room, StringComparison.OrdinalIgnoreCase));
    }
}