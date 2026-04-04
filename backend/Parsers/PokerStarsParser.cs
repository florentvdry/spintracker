using System.Text.RegularExpressions;
using System.Globalization;
using SpinTrackerBackend;
using System.Text.Json;

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
        BuildStructuredActions(hand, actions, heroName);
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
            hand.GameMode = "tournament";
            hand.GameType = "Hold'em";
            hand.TournamentName = "Spin & Go";
        }

        ExtractBlindsFromLine(line, hand);
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

            if (line.Contains("is the button"))
            {
                hand.ButtonSeat = seat;
            }
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

            var dealAction = new StreetAction
            {
                Street = actionSection ?? "",
                Order = 0,
                Player = "Board",
                Type = ActionType.deal_board
            };

            if (section == "FLOP" && !string.IsNullOrEmpty(hand.Flop))
            {
                dealAction.Cards = hand.Flop.Split(' ').ToList();
            }
            else if (section == "TURN" && !string.IsNullOrEmpty(hand.Turn))
            {
                dealAction.Cards = new List<string> { hand.Turn };
            }
            else if (section == "RIVER" && !string.IsNullOrEmpty(hand.River))
            {
                dealAction.Cards = new List<string> { hand.River };
            }
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

    private void BuildStructuredActions(ParsedHand hand, Dictionary<string, List<string>> rawActions, string? heroName)
    {
        var structured = new HandActions
        {
            Info = new HandInfo
            {
                HandId = hand.HandId,
                Room = hand.Room,
                Table = hand.TableId,
                TableSize = hand.PlayerCount,
                ButtonSeat = hand.ButtonSeat,
                Date = hand.DateTime,
                Limit = hand.LimitType,
                Game = hand.GameVariant,
                Blinds = hand.StructuredBlinds,
                Currency = hand.Currency,
                GameType = hand.GameMode,
                TournamentId = hand.TournamentId,
                TournamentName = hand.GameName,
                TournamentLevel = hand.TournamentLevel,
                BuyIn = hand.BuyIn > 0 ? hand.BuyIn : null,
                BuyinCurrency = hand.BuyinCurrency,
                Multiplier = hand.Multiplier > 1 ? hand.Multiplier : null,
                PrizePool = hand.PrizePool > 0 ? hand.PrizePool : null,
                Position = hand.Position > 0 ? hand.Position : null,
                Ante = hand.Ante,
                RakePerPlayer = hand.RakePerPlayer
            },
            Players = hand.Players.Select(p => new PlayerHandInfo
            {
                Seat = 0,
                Name = p.Name,
                Stack = p.Stack,
                IsHero = p.IsHero
            }).ToList(),
            Board = new BoardInfo
            {
                Flop = !string.IsNullOrEmpty(hand.Flop) ? hand.Flop.Split(' ').ToList() : null,
                Turn = hand.Turn,
                River = hand.River
            },
            Summary = new HandSummary
            {
                TotalPot = hand.TotalPot,
                Rake = hand.Rake,
                Winners = hand.Players.Where(p => p.ChipsWon > 0).Select(p => new WinnerInfo
                {
                    Player = p.Name,
                    Amount = p.ChipsWon,
                    Hand = null
                }).ToList()
            }
        };

        var orderCounters = new Dictionary<string, int>
        {
            ["preflop"] = 0,
            ["flop"] = 0,
            ["turn"] = 0,
            ["river"] = 0
        };

        foreach (var street in new[] { "preflop", "flop", "turn", "river" })
        {
            if (!rawActions.TryGetValue(street, out var streetActions) || streetActions == null)
                continue;

            foreach (var actionLine in streetActions)
            {
                orderCounters[street]++;
                var action = ParseActionLineToStructured(actionLine, street, orderCounters[street], heroName);
                if (action != null)
                    structured.Actions.Add(action);
            }
        }

        hand.StructuredActions = structured;
    }

    private StreetAction? ParseActionLineToStructured(string line, string street, int order, string? heroName)
    {
        var lowerLine = line.ToLower();
        var playerMatch = Regex.Match(line, @"^(.+?):");
        var playerName = playerMatch.Success ? playerMatch.Groups[1].Value.Trim() : "Unknown";

        if (lowerLine.Contains("posts"))
        {
            var isSb = lowerLine.Contains("small blind") || lowerLine.Contains("posts sb");
            var amountMatch = Regex.Match(line, @"(\d+\.?\d*)");
            return new StreetAction
            {
                Street = street,
                Order = order,
                Player = playerName,
                Type = ActionType.post,
                PostType = isSb ? "sb" : "bb",
                Amount = amountMatch.Success ? double.Parse(amountMatch.Groups[1].Value, CultureInfo.InvariantCulture) : null
            };
        }
        else if (lowerLine.Contains("folds"))
        {
            return new StreetAction
            {
                Street = street,
                Order = order,
                Player = playerName,
                Type = ActionType.fold
            };
        }
        else if (lowerLine.Contains("checks"))
        {
            return new StreetAction
            {
                Street = street,
                Order = order,
                Player = playerName,
                Type = ActionType.check
            };
        }
        else if (lowerLine.Contains("bets"))
        {
            var amountMatch = Regex.Match(line, @"(\d+\.?\d*)");
            var isAllIn = lowerLine.Contains("all-in");
            return new StreetAction
            {
                Street = street,
                Order = order,
                Player = playerName,
                Type = ActionType.bet,
                Amount = amountMatch.Success ? double.Parse(amountMatch.Groups[1].Value, CultureInfo.InvariantCulture) : null,
                Effective = amountMatch.Success ? double.Parse(amountMatch.Groups[1].Value, CultureInfo.InvariantCulture) : null,
                IsAllIn = isAllIn
            };
        }
        else if (lowerLine.Contains("calls"))
        {
            var amountMatch = Regex.Match(line, @"(\d+\.?\d*)");
            var isAllIn = lowerLine.Contains("all-in");
            return new StreetAction
            {
                Street = street,
                Order = order,
                Player = playerName,
                Type = ActionType.call,
                Amount = amountMatch.Success ? double.Parse(amountMatch.Groups[1].Value, CultureInfo.InvariantCulture) : null,
                Effective = amountMatch.Success ? double.Parse(amountMatch.Groups[1].Value, CultureInfo.InvariantCulture) : null,
                IsAllIn = isAllIn
            };
        }
        else if (lowerLine.Contains("raises"))
        {
            var amountMatch = Regex.Match(line, @"to (\d+\.?\d*)");
            var isAllIn = lowerLine.Contains("all-in");
            double? amount = amountMatch.Success ? double.Parse(amountMatch.Groups[1].Value, CultureInfo.InvariantCulture) : null;
            return new StreetAction
            {
                Street = street,
                Order = order,
                Player = playerName,
                Type = ActionType.raise,
                Amount = amount,
                Effective = amount,
                IsAllIn = isAllIn
            };
        }

        return null;
    }

    private void ExtractBlindsFromLine(string line, ParsedHand hand)
    {
        var blindMatch = Regex.Match(line, @"(\d+\.?\d*)/(\d+\.?\d*)");
        if (blindMatch.Success)
        {
            var sb = double.Parse(blindMatch.Groups[1].Value, CultureInfo.InvariantCulture);
            var bb = double.Parse(blindMatch.Groups[2].Value, CultureInfo.InvariantCulture);
            hand.StructuredBlinds = new BlindsInfo { Sb = sb, Bb = bb };
            hand.Blinds = $"{sb}/{bb}";
            hand.LimitType = "NL";
            hand.GameVariant = "HOLDEM";
        }

        var anteMatch = Regex.Match(line, @"(\d+\.?\d*) ante", RegexOptions.IgnoreCase);
        if (anteMatch.Success)
        {
            hand.Ante = double.Parse(anteMatch.Groups[1].Value, CultureInfo.InvariantCulture);
            if (hand.StructuredBlinds == null)
                hand.StructuredBlinds = new BlindsInfo();
            hand.StructuredBlinds.Ante = hand.Ante;
        }
    }
}
