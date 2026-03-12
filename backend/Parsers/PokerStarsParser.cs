using System.Text.RegularExpressions;
using System.Globalization;
using SpinTrackerBackend;

namespace SpinTrackerBackend;

public class PokerStarsParser : IHandParser
{
    public string RoomName => "PokerStars";
    public int ParserVersion => 1;
    public string HandSeparator => "PokerStars Game";

    private const string SectionHeader = "PokerStars Game";
    private const string SectionPlayers = "Seat ";
    private const string SectionHoleCards = "Dealt to";
    private const string SectionPreFlop = "*** HOLE CARDS ***";
    private const string SectionFlop = "*** FLOP ***";
    private const string SectionTurn = "*** TURN ***";
    private const string SectionRiver = "*** RIVER ***";
    private const string SectionShowdown = "*** SHOWDOWN ***";
    private const string SectionSummary = "*** SUMMARY ***";

    private static readonly Regex HandIdRegex = new(@"Hand #(\d+)", RegexOptions.Compiled);
    private static readonly Regex DateTimeRegex = new(@"(\d{4}/\d{2}/\d{2} \d{1,2}:\d{2}:\d{2})", RegexOptions.Compiled);
    private static readonly Regex TableRegex = new(@"Table '(.+?)'", RegexOptions.Compiled);
    private static readonly Regex SeatRegex = new(@"Seat (\d+): (.+?) \((\d+)", RegexOptions.Compiled);
    private static readonly Regex BetRegex = new(@"(\d+\.?\d*)", RegexOptions.Compiled);
    private static readonly Regex CardRegex = new(@"\[([\dAKQJTshdc]{2})\]", RegexOptions.Compiled);
    private static readonly Regex BoardRegex = new(@"\[([\dAKQJTshdc]{2})\]", RegexOptions.Compiled);
    private static readonly Regex WinsRegex = new(@"(.+?) wins (\d+\.?\d*)", RegexOptions.Compiled);
    private static readonly Regex ShowRegex = new(@"(.+?): shows \[([\dAKQJTshdc]{2})\s*([\dAKQJTshdc]{2})\]", RegexOptions.Compiled);
    private static readonly Regex ActionRegex = new(@"(.+?): (folds|checks|bets|raises|calls|all-in|All-in)", RegexOptions.Compiled);

    public bool DetectFormat(string content)
    {
        return content.Contains("PokerStars") || content.Contains("PokerStars Game");
    }

    public ParseResult ParseFile(string fileContent)
    {
        try
        {
            var hands = new List<ParsedHand>();
            var handTexts = Regex.Split(fileContent, @"(?=PokerStars Game #\d+)")
                .Where(h => !string.IsNullOrWhiteSpace(h) && h.Contains("PokerStars"))
                .ToList();

            foreach (var handText in handTexts)
            {
                var hand = ParseHand(handText.Trim());
                if (hand != null)
                {
                    hands.Add(hand);
                }
            }

            return new ParseResult
            {
                Success = true,
                Hands = hands,
                Count = hands.Count
            };
        }
        catch (Exception e)
        {
            return new ParseResult
            {
                Success = false,
                Error = e.Message,
                Hands = new List<ParsedHand>(),
                Count = 0
            };
        }
    }

    public ParsedHand? ParseHand(string handText)
    {
        var lines = handText.Split('\n')
            .Select(l => l.Trim())
            .Where(l => !string.IsNullOrEmpty(l))
            .ToList();

        if (!handText.Contains("PokerStars"))
            return null;

        var hand = new ParsedHand { Room = "PokerStars" };
        string currentSection = "HEADER";
        string? heroName = null;

        var actions = new Dictionary<string, List<string>>
        {
            ["preflop"] = new(),
            ["flop"] = new(),
            ["turn"] = new(),
            ["river"] = new()
        };

        foreach (var line in lines)
        {
            var newSection = DetectSection(line);
            if (newSection != null)
            {
                currentSection = newSection;
                if (currentSection == "SHOWDOWN")
                    hand.WentToShowdown = true;
                continue;
            }

            switch (currentSection)
            {
                case "HEADER":
                    ParseHeaderLine(line, hand);
                    break;
                case "PLAYERS":
                    ParsePlayerLine(line, hand, ref heroName);
                    break;
                case "HOLE_CARDS":
                case "PREFLOP":
                case "FLOP":
                case "TURN":
                case "RIVER":
                case "SHOWDOWN":
                    ParseGameLine(line, hand, currentSection, actions, heroName);
                    break;
                case "SUMMARY":
                    ParseSummaryLine(line, hand, heroName);
                    break;
            }
        }

        BuildActionStrings(hand, actions);
        NormalizeHandData(hand);
        GenerateHandId(hand);

        return hand;
    }

    private string? DetectSection(string line)
    {
        if (line.StartsWith("*** HOLE CARDS ***")) return "PREFLOP";
        if (line.StartsWith("*** FLOP ***")) return "FLOP";
        if (line.StartsWith("*** TURN ***")) return "TURN";
        if (line.StartsWith("*** RIVER ***")) return "RIVER";
        if (line.StartsWith("*** SHOWDOWN ***")) return "SHOWDOWN";
        if (line.StartsWith("*** SUMMARY ***")) return "SUMMARY";
        if (line.StartsWith("Seat ")) return "PLAYERS";
        return null;
    }

    private void ParseHeaderLine(string line, ParsedHand hand)
    {
        var handMatch = HandIdRegex.Match(line);
        if (handMatch.Success)
        {
            hand.HandId = handMatch.Groups[1].Value;
            hand.GameId = handMatch.Groups[1].Value;
        }

        var dateMatch = DateTimeRegex.Match(line);
        if (dateMatch.Success && DateTime.TryParse(dateMatch.Value, out var dt))
        {
            hand.DateTime = dt.ToString("yyyy-MM-dd HH:mm:ss");
        }

        if (line.Contains("Table '"))
        {
            var tableMatch = TableRegex.Match(line);
            if (tableMatch.Success)
                hand.TableId = tableMatch.Groups[1].Value;
        }

        if (line.Contains("Spin & Go"))
        {
            hand.GameMode = "Spin & Go";
            hand.GameType = "Hold'em";
        }
    }

    private void ParsePlayerLine(string line, ParsedHand hand, ref string? heroName)
    {
        if (!line.StartsWith("Seat ")) return;

        var match = SeatRegex.Match(line);
        if (match.Success)
        {
            var seat = int.Parse(match.Groups[1].Value);
            var name = match.Groups[2].Value;
            var stack = int.Parse(match.Groups[3].Value);

            var player = new PlayerInfo
            {
                Name = name,
                Stack = stack,
                IsHero = false
            };
            hand.Players.Add(player);
        }
    }

    private void ParseGameLine(string line, ParsedHand hand, string section, Dictionary<string, List<string>> actions, string? heroName)
    {
        if (line.StartsWith("Dealt to "))
        {
            var dealtMatch = Regex.Match(line, @"Dealt to (.+?) \[([\dAKQJTshdc]{2})\s*([\dAKQJTshdc]{2})\]");
            if (dealtMatch.Success)
            {
                var name = dealtMatch.Groups[1].Value.Trim();
                var pInfo = hand.Players.FirstOrDefault(x => x.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
                if (pInfo != null)
                {
                    pInfo.IsHero = true;
                    heroName = name;
                    pInfo.Cards = $"{dealtMatch.Groups[2].Value} {dealtMatch.Groups[3].Value}";
                }
            }
            return;
        }

        if (section == "FLOP")
        {
            var boardMatch = BoardRegex.Matches(line);
            if (boardMatch.Count >= 3)
            {
                hand.Flop = $"{boardMatch[0].Groups[1].Value} {boardMatch[1].Groups[1].Value} {boardMatch[2].Groups[1].Value}";
            }
        }
        else if (section == "TURN")
        {
            var boardMatch = BoardRegex.Match(line);
            if (boardMatch.Success)
                hand.Turn = boardMatch.Groups[1].Value;
        }
        else if (section == "RIVER")
        {
            var boardMatch = BoardRegex.Match(line);
            if (boardMatch.Success)
                hand.River = boardMatch.Groups[1].Value;
        }

        var actionMatch = ActionRegex.Match(line);
        if (actionMatch.Success)
        {
            var actionSection = section switch
            {
                "PREFLOP" => "preflop",
                "FLOP" => "flop",
                "TURN" => "turn",
                "RIVER" => "river",
                _ => null
            };
            if (actionSection != null)
                actions[actionSection].Add(line);
        }
    }

    private void ParseSummaryLine(string line, ParsedHand hand, string? heroName)
    {
        var winsMatch = WinsRegex.Match(line);
        if (winsMatch.Success)
        {
            var winner = winsMatch.Groups[1].Value.Trim();
            var amount = double.Parse(winsMatch.Groups[2].Value, CultureInfo.InvariantCulture);

            var pWin = hand.Players.FirstOrDefault(x => x.Name.Equals(winner, StringComparison.OrdinalIgnoreCase));
            if (pWin != null)
            {
                pWin.ChipsWon += amount;
            }

            if (!string.IsNullOrEmpty(heroName) && winner.Equals(heroName, StringComparison.OrdinalIgnoreCase))
            {
                hand.WentToShowdown = true;
            }
        }

        var showMatch = ShowRegex.Match(line);
        if (showMatch.Success)
        {
            var player = showMatch.Groups[1].Value.Trim();
            var cards = $"{showMatch.Groups[2].Value} {showMatch.Groups[3].Value}";
            var pInfo = hand.Players.FirstOrDefault(x => x.Name.Equals(player, StringComparison.OrdinalIgnoreCase));
            if (pInfo != null)
            {
                pInfo.Cards = cards;
                pInfo.WentToShowdown = true;
            }
            hand.WentToShowdown = true;
        }
    }

    private void BuildActionStrings(ParsedHand hand, Dictionary<string, List<string>> actions)
    {
        hand.PreflopAction = string.Join("\n", actions["preflop"]);
        hand.FlopAction = string.Join("\n", actions["flop"]);
        hand.TurnAction = string.Join("\n", actions["turn"]);
        hand.RiverAction = string.Join("\n", actions["river"]);
    }

    private void NormalizeHandData(ParsedHand hand)
    {
        hand.PlayerCount = hand.Players.Count;

        if (hand.PlayerCount == 2)
        {
            foreach (var p in hand.Players)
            {
                if (p.Position == "BTN SB" || p.Position == "BTN")
                    p.Position = "SB";
            }
        }
    }

    private void GenerateHandId(ParsedHand hand)
    {
        if (!string.IsNullOrEmpty(hand.HandId))
        {
            hand.Id = hand.HandId;
        }
        else if (!string.IsNullOrEmpty(hand.GameId) && !string.IsNullOrEmpty(hand.DateTime))
        {
            hand.Id = $"{hand.GameId}_{hand.DateTime}".Replace(":", "").Replace(" ", "_");
        }
        else
        {
            hand.Id = Guid.NewGuid().ToString();
        }
    }
}
