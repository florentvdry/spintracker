using System.Text.RegularExpressions;
using System.Globalization;
using SpinTrackerBackend;

namespace SpinTrackerBackend;

public interface IHandParser
{
    string RoomName { get; }
    int ParserVersion { get; }
    bool DetectFormat(string content);
    ParseResult ParseFile(string fileContent);
    ParsedHand? ParseHand(string handText);
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