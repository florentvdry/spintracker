using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace SpinTrackerBackend;

public class UnibetParser : IHandParser
{
    public string RoomName => "Unibet";
    public int ParserVersion => 2;
    public string HandSeparator => "Unibet Hand #";

    private const string SecSeatedPlayers = "*** Seated players ***";
    private const string SecBlindsButton = "*** Blinds and button ***";
    private const string SecHoleCards = "*** Hole cards ***";
    private const string SecPreflop = "*** Preflop ***";
    private const string SecShowdown = "*** Showdown ***";
    private const string SecSummary = "*** Summary ***";

    private static readonly Regex HeaderHandTournamentRegex = new(@"^Unibet Hand #(\d+), Tournament #(\d+),", RegexOptions.Compiled);
    private static readonly Regex HeaderBuyInRakeRegex = new(@"[€$£]?([0-9]+[.,][0-9]+)\s*\+\s*[€$£]?([0-9]+[.,][0-9]+)", RegexOptions.Compiled);
    private static readonly Regex HeaderBlindsRegex = new(@"-\s*([0-9]+[.,][0-9]+)/([0-9]+[.,][0-9]+)\s*-", RegexOptions.Compiled);
    private static readonly Regex HeaderPrizeRegex = new(@"Total prize\s+.*?([0-9]+(?:[.,][0-9]+)?)\s*-", RegexOptions.Compiled);
    private static readonly Regex HeaderUtcDateRegex = new(@"UTC\s+(\d{2}:\d{2}:\d{2})\s+(\d{4}/\d{2}/\d{2})$", RegexOptions.Compiled);
    private static readonly Regex TableRegex = new(@"^Table ""(.+?)"" (\d+)-max$", RegexOptions.Compiled);
    private static readonly Regex SeatRegex = new(@"^Seat (\d+): (.+?) \((\d+)\)$", RegexOptions.Compiled);
    private static readonly Regex FlopBoardRegex = new(@"^\*\*\* Flop \*\*\* \[(.+?)\]$", RegexOptions.Compiled);
    private static readonly Regex TurnBoardRegex = new(@"^\*\*\* Turn \*\*\* \[.+?\] \[(.+?)\]$", RegexOptions.Compiled);
    private static readonly Regex RiverBoardRegex = new(@"^\*\*\* River \*\*\* \[.+?\] \[.+?\] \[(.+?)\]$", RegexOptions.Compiled);
    private static readonly Regex DealtToRegex = new(@"^Dealt to (.+?) \[(.+?)\]$", RegexOptions.Compiled);
    private static readonly Regex DealtInRegex = new(@"^Dealt in (.+?)$", RegexOptions.Compiled);
    private static readonly Regex HasButtonRegex = new(@"^(.+?) has the button$", RegexOptions.Compiled);
    private static readonly Regex PostsSbRegex = new(@"^(.+?) posts small blind (\d+)(?:, and is all-in)?$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex PostsBbRegex = new(@"^(.+?) posts big blind (\d+)(?:, and is all-in)?$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex FoldsRegex = new(@"^(.+?) folds", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex ChecksRegex = new(@"^(.+?) checks", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex CallsRegex = new(@"^(.+?) calls (\d+)", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex BetsRegex = new(@"^(.+?) bets (\d+)", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex RaisesRegex = new(@"^(.+?) raises \d+ to (\d+)", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex UncalledRegex = new(@"^Uncalled bet returned to (.+?): (\d+)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex AllInSuffixRegex = new(@", and is all-in", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex WinsRegex = new(@"^(.+?) wins (?:(?:main pot|side pot #\d+),\s*)?(\d+)(?:\s+from\s+(?:main pot|side pot #\d+))?$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex ShowsRegex = new(@"^(.+?) shows \[(.+?)\]", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex TotalPotRegex = new(@"^Total pot (\d+)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex SummarySeatRegex = new(@"^Seat \d+: (.+?): bet (\d+) and won (\d+), net result: (-?\d+)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex FinishedRegex = new(@"^(.+?) finished the tournament in (\d+)(?:st|nd|rd|th) place(?:, and won .+)?$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex UnibetIdRegex = new(@"Unibet_[A-Za-z0-9]+", RegexOptions.Compiled);
    private static readonly Regex UnibetIdSuffixRegex = new(@"\s*\[Unibet_[A-Za-z0-9]+\]", RegexOptions.Compiled);

    private static string StripUnibetId(string name) => UnibetIdSuffixRegex.Replace(name, "").Trim();

    public bool DetectFormat(string content) => content.Contains(HandSeparator, StringComparison.Ordinal);

    public ParseResult ParseFile(string fileContent)
    {
        try
        {
            var hands = SplitHands(fileContent)
                .Select(ParseHandFromLines)
                .OfType<ParsedHand>()
                .ToList();

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
        var normalized = NormalizeContent(handText);
        if (!normalized.TrimStart().StartsWith(HandSeparator, StringComparison.Ordinal))
            return null;

        return ParseHandFromLines(normalized);
    }

    private ParsedHand? ParseHandFromLines(string handText)
    {
        var lines = new List<string>();
        foreach (var rawLine in handText.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            var trimmed = rawLine.Trim();
            if (trimmed.Length > 0)
                lines.Add(trimmed);
        }

        if (lines.Count == 0)
            return null;

        var hand = CreateEmptyHand();
        var heroName = DetectHeroName(lines);
        var currentSection = "HEADER";
        var showdownEncountered = false;
        var showdownLines = new List<string>();
        var seatedPlayers = new List<(int Seat, string Name, double Stack)>();
        var actions = CreateActionBuckets();
        var resultBuilder = new StringBuilder();

        foreach (var line in lines)
        {
            if (line == SecSeatedPlayers)
            {
                currentSection = "SEATED_PLAYERS";
                continue;
            }

            if (line == SecBlindsButton)
            {
                currentSection = "BLINDS_BUTTON";
                continue;
            }

            if (line == SecHoleCards)
            {
                currentSection = "HOLE_CARDS";
                continue;
            }

            if (line == SecPreflop)
            {
                currentSection = "PREFLOP";
                continue;
            }

            if (line == SecShowdown)
            {
                currentSection = "SHOWDOWN";
                showdownEncountered = true;
                hand.WentToShowdown = true;
                continue;
            }

            if (line == SecSummary)
            {
                currentSection = "SUMMARY";
                continue;
            }

            if (TryParseBoardHeader(line, hand, out var street))
            {
                if (showdownEncountered)
                {
                    showdownLines.Add(line);
                }
                else if (street != null)
                {
                    currentSection = street;
                }

                continue;
            }

            if (currentSection != "HEADER" && currentSection != "SUMMARY")
            {
                resultBuilder.Append(line).Append('\n');
            }

            if (showdownEncountered && currentSection == "SHOWDOWN")
            {
                showdownLines.Add(line);
            }

            switch (currentSection)
            {
                case "HEADER":
                    ParseHeaderLine(line, hand);
                    break;
                case "SEATED_PLAYERS":
                    ParseSeatLine(line, hand, seatedPlayers);
                    break;
                case "BLINDS_BUTTON":
                    ParseBlindsButtonLine(line, hand, seatedPlayers, actions);
                    break;
                case "HOLE_CARDS":
                    ParseHoleCardsLine(line, hand, ref heroName);
                    break;
                case "PREFLOP":
                case "FLOP":
                case "TURN":
                case "RIVER":
                    ParseActionLine(line, hand, currentSection, actions);
                    break;
                case "SHOWDOWN":
                    ParseShowdownLine(line, hand);
                    break;
                case "SUMMARY":
                    ParseSummaryLine(line, hand, heroName);
                    break;
            }
        }

        hand.PlayerCount = hand.Players.Count;
        hand.Result = resultBuilder.ToString();
        ApplyPositions(hand, seatedPlayers);
        MarkHero(hand, heroName);
        NormaliseHeadsUpPositions(hand);
        BuildActionStrings(hand, actions);
        BuildStructuredActions(hand, actions, seatedPlayers);
        GenerateHandId(hand);

        if (showdownEncountered)
        {
            foreach (var player in hand.Players.Where(player => !player.Folded))
            {
                player.WentToShowdown = true;
            }
        }

        hand.Showdown = string.Join("\n", showdownLines);
        return hand;
    }

    private static ParsedHand CreateEmptyHand()
    {
        return new ParsedHand
        {
            Room = "Unibet",
            GameMode = "Tournament",
            GameType = "Spin&Go",
            LimitType = "NL",
            GameVariant = "HOLDEM",
            Currency = "€",
            BuyinCurrency = "€"
        };
    }

    private static Dictionary<string, List<string>> CreateActionBuckets()
    {
        return new Dictionary<string, List<string>>
        {
            ["preflop"] = new(),
            ["flop"] = new(),
            ["turn"] = new(),
            ["river"] = new()
        };
    }

    private static string NormalizeContent(string content)
    {
        return content.Replace("\r\n", "\n").Replace('\r', '\n');
    }

    private IEnumerable<string> SplitHands(string content)
    {
        var normalized = NormalizeContent(content);
        var hands = new List<string>();
        var builder = new StringBuilder();

        foreach (var rawLine in normalized.Split('\n'))
        {
            var line = rawLine.TrimEnd();
            if (line.StartsWith(HandSeparator, StringComparison.Ordinal))
            {
                if (builder.Length > 0)
                {
                    hands.Add(builder.ToString().Trim());
                    builder.Clear();
                }
            }

            if (builder.Length > 0 || line.StartsWith(HandSeparator, StringComparison.Ordinal))
            {
                builder.AppendLine(line);
            }
        }

        if (builder.Length > 0)
        {
            hands.Add(builder.ToString().Trim());
        }

        return hands.Where(hand => !string.IsNullOrWhiteSpace(hand));
    }

    private string? DetectHeroName(IList<string> lines)
    {
        string? fallback = null;
        foreach (var line in lines)
        {
            var seatMatch = SeatRegex.Match(line);
            if (seatMatch.Success && UnibetIdRegex.IsMatch(seatMatch.Groups[2].Value))
                return StripUnibetId(seatMatch.Groups[2].Value);

            if (fallback == null)
            {
                var dealtToMatch = DealtToRegex.Match(line);
                if (dealtToMatch.Success && UnibetIdRegex.IsMatch(dealtToMatch.Groups[1].Value))
                {
                    fallback = StripUnibetId(dealtToMatch.Groups[1].Value);
                    continue;
                }

                var dealtInMatch = DealtInRegex.Match(line);
                if (dealtInMatch.Success && UnibetIdRegex.IsMatch(dealtInMatch.Groups[1].Value))
                    fallback = StripUnibetId(dealtInMatch.Groups[1].Value);
            }
        }

        return fallback;
    }

    private static bool TryParseBoardHeader(string line, ParsedHand hand, out string? street)
    {
        street = null;

        var flopMatch = FlopBoardRegex.Match(line);
        if (flopMatch.Success)
        {
            hand.Flop = flopMatch.Groups[1].Value.Trim();
            street = "FLOP";
            return true;
        }

        var turnMatch = TurnBoardRegex.Match(line);
        if (turnMatch.Success)
        {
            hand.Turn = turnMatch.Groups[1].Value.Trim();
            street = "TURN";
            return true;
        }

        var riverMatch = RiverBoardRegex.Match(line);
        if (riverMatch.Success)
        {
            hand.River = riverMatch.Groups[1].Value.Trim();
            street = "RIVER";
            return true;
        }

        return false;
    }

    private static void ParseHeaderLine(string line, ParsedHand hand)
    {
        var handTournamentMatch = HeaderHandTournamentRegex.Match(line);
        if (handTournamentMatch.Success)
        {
            hand.HandId = handTournamentMatch.Groups[1].Value;
            hand.GameId = handTournamentMatch.Groups[2].Value;
            hand.TournamentId = hand.GameId;

            var buyInRakeMatch = HeaderBuyInRakeRegex.Match(line);
            if (buyInRakeMatch.Success)
            {
                var buyInWithoutRake = ParseAmount(buyInRakeMatch.Groups[1].Value);
                var rake = ParseAmount(buyInRakeMatch.Groups[2].Value);
                hand.BuyIn = buyInWithoutRake + rake;
                hand.Rake = rake;
            }

            var blindsMatch = HeaderBlindsRegex.Match(line);
            if (blindsMatch.Success)
            {
                var sb = ParseAmount(blindsMatch.Groups[1].Value);
                var bb = ParseAmount(blindsMatch.Groups[2].Value);
                hand.Blinds = $"{sb}/{bb}";
                hand.StructuredBlinds = new BlindsInfo { Sb = sb, Bb = bb };
            }

            var prizeMatch = HeaderPrizeRegex.Match(line);
            if (prizeMatch.Success)
            {
                hand.PrizePool = ParseAmount(prizeMatch.Groups[1].Value);
            }

            var dateMatch = HeaderUtcDateRegex.Match(line);
            if (dateMatch.Success)
            {
                hand.DateTime = $"{dateMatch.Groups[2].Value.Replace("/", "-")} {dateMatch.Groups[1].Value}";
            }

            if (hand.BuyIn > 0)
            {
                hand.Multiplier = (int)Math.Round(hand.PrizePool / hand.BuyIn);
            }

            return;
        }

        var tableMatch = TableRegex.Match(line);
        if (tableMatch.Success)
        {
            hand.TableId = tableMatch.Groups[1].Value.Trim();
        }
    }

    private static void ParseSeatLine(string line, ParsedHand hand, List<(int Seat, string Name, double Stack)> seatedPlayers)
    {
        var match = SeatRegex.Match(line);
        if (!match.Success)
            return;

        var seat = int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
        var name = StripUnibetId(match.Groups[2].Value.Trim());
        var stack = ParseAmount(match.Groups[3].Value);

        seatedPlayers.Add((seat, name, stack));
        hand.Players.Add(new PlayerInfo
        {
            Name = name,
            Stack = stack
        });
    }

    private static void ParseBlindsButtonLine(string line, ParsedHand hand, List<(int Seat, string Name, double Stack)> seatedPlayers, Dictionary<string, List<string>> actions)
    {
        var buttonMatch = HasButtonRegex.Match(line);
        if (buttonMatch.Success)
        {
            var playerName = buttonMatch.Groups[1].Value.Trim();
            var player = FindPlayer(hand, playerName);
            if (player != null)
                player.Position = "BTN";

            hand.ButtonSeat = seatedPlayers.FirstOrDefault(p => p.Name.Equals(playerName, StringComparison.OrdinalIgnoreCase)).Seat;
            return;
        }

        var smallBlindMatch = PostsSbRegex.Match(line);
        if (smallBlindMatch.Success)
        {
            var playerName = smallBlindMatch.Groups[1].Value.Trim();
            var player = FindPlayer(hand, playerName);
            if (player != null)
            {
                player.Position = player.Position == "BTN" ? "BTN SB" : "SB";
            }

            actions["preflop"].Add(line);
            MarkAllInPlayer(hand, line, "PREFLOP");
            return;
        }

        var bigBlindMatch = PostsBbRegex.Match(line);
        if (bigBlindMatch.Success)
        {
            var playerName = bigBlindMatch.Groups[1].Value.Trim();
            var player = FindPlayer(hand, playerName);
            if (player != null)
            {
                player.Position = "BB";
            }

            actions["preflop"].Add(line);
            MarkAllInPlayer(hand, line, "PREFLOP");
        }
    }

    private static void ParseHoleCardsLine(string line, ParsedHand hand, ref string? heroName)
    {
        // Normalise le nom du joueur en retirant le suffixe Unibet ID avant le match
        var normalizedLine = UnibetIdSuffixRegex.Replace(line, "");
        var dealtToMatch = DealtToRegex.Match(normalizedLine);
        if (!dealtToMatch.Success)
            return;

        var playerName = dealtToMatch.Groups[1].Value.Trim();
        var cards = dealtToMatch.Groups[2].Value.Trim();
        var player = FindPlayer(hand, playerName);
        if (player == null)
            return;

        player.Cards = cards;
        if (string.IsNullOrEmpty(heroName) && UnibetIdRegex.IsMatch(line))
        {
            heroName = playerName; // playerName est déjà strippé via la ligne normalisée
        }
    }

    private static void ParseActionLine(string line, ParsedHand hand, string section, Dictionary<string, List<string>> actions)
    {
        if (line.Contains("is disconnected", StringComparison.OrdinalIgnoreCase) ||
            UncalledRegex.IsMatch(line) ||
            WinsRegex.IsMatch(line))
        {
            return;
        }

        var actionBucket = section switch
        {
            "PREFLOP" => "preflop",
            "FLOP" => "flop",
            "TURN" => "turn",
            "RIVER" => "river",
            _ => null
        };

        if (actionBucket == null)
            return;

        if (FoldsRegex.IsMatch(line))
        {
            var playerName = FoldsRegex.Match(line).Groups[1].Value.Trim();
            var player = FindPlayer(hand, playerName);
            if (player != null)
                player.Folded = true;

            actions[actionBucket].Add(line);
            return;
        }

        if (ChecksRegex.IsMatch(line) || CallsRegex.IsMatch(line) || BetsRegex.IsMatch(line) || RaisesRegex.IsMatch(line))
        {
            actions[actionBucket].Add(line);
            MarkAllInPlayer(hand, line, section);
        }
    }

    private static void ParseShowdownLine(string line, ParsedHand hand)
    {
        var showMatch = ShowsRegex.Match(line);
        if (showMatch.Success)
        {
            var playerName = showMatch.Groups[1].Value.Trim();
            var cards = showMatch.Groups[2].Value.Trim();
            var player = FindPlayer(hand, playerName);
            if (player != null)
            {
                if (string.IsNullOrEmpty(player.Cards))
                    player.Cards = cards;

                player.WentToShowdown = true;
            }

            return;
        }

        var winMatch = WinsRegex.Match(line);
        if (winMatch.Success)
        {
            var playerName = winMatch.Groups[1].Value.Trim();
            var player = FindPlayer(hand, playerName);
            if (player != null && player.ChipsWon <= 0)
            {
                player.ChipsWon = ParseAmount(winMatch.Groups[2].Value);
            }

            return;
        }

        var finishMatch = FinishedRegex.Match(line);
        if (finishMatch.Success)
        {
            var playerName = finishMatch.Groups[1].Value.Trim();
            var player = FindPlayer(hand, playerName);
            if (player != null && player.IsHero)
            {
                hand.Position = int.Parse(finishMatch.Groups[2].Value, CultureInfo.InvariantCulture);
            }
        }
    }

    private static void ParseSummaryLine(string line, ParsedHand hand, string? heroName)
    {
        var totalPotMatch = TotalPotRegex.Match(line);
        if (totalPotMatch.Success)
        {
            hand.TotalPot = ParseAmount(totalPotMatch.Groups[1].Value);
            return;
        }

        var seatMatch = SummarySeatRegex.Match(line);
        if (seatMatch.Success)
        {
            var playerName = seatMatch.Groups[1].Value.Trim();
            var player = FindPlayer(hand, playerName);
            if (player == null)
                return;

            player.Investment = ParseAmount(seatMatch.Groups[2].Value);
            player.ChipsWon = ParseAmount(seatMatch.Groups[3].Value);
            player.NetProfit = ParseAmount(seatMatch.Groups[4].Value);
            return;
        }

        var finishMatch = FinishedRegex.Match(line);
        if (finishMatch.Success && !string.IsNullOrEmpty(heroName) && finishMatch.Groups[1].Value.Trim().Equals(heroName, StringComparison.OrdinalIgnoreCase))
        {
            hand.Position = int.Parse(finishMatch.Groups[2].Value, CultureInfo.InvariantCulture);
        }
    }

    private static void ApplyPositions(ParsedHand hand, List<(int Seat, string Name, double Stack)> seatedPlayers)
    {
        if (seatedPlayers.Count == 0)
            return;

        var buttonPlayer = hand.Players.FirstOrDefault(player => player.Position is "BTN" or "BTN SB");
        if (buttonPlayer == null)
            return;

        var orderedPlayers = seatedPlayers.OrderBy(player => player.Seat).ToList();
        var buttonIndex = orderedPlayers.FindIndex(player => player.Name.Equals(buttonPlayer.Name, StringComparison.OrdinalIgnoreCase));
        if (buttonIndex < 0)
            return;

        for (var index = 0; index < orderedPlayers.Count; index++)
        {
            var player = FindPlayer(hand, orderedPlayers[index].Name);
            if (player == null || !string.IsNullOrEmpty(player.Position))
                continue;

            var relativeIndex = (index - buttonIndex + orderedPlayers.Count) % orderedPlayers.Count;
            player.Position = relativeIndex switch
            {
                0 => "BTN",
                1 => "SB",
                2 => "BB",
                3 => "UTG",
                4 => "MP",
                _ => "CO"
            };
        }
    }

    private static void MarkHero(ParsedHand hand, string? heroName)
    {
        foreach (var player in hand.Players)
        {
            player.IsHero = false;
        }

        if (string.IsNullOrEmpty(heroName))
            return;

        var hero = FindPlayer(hand, heroName);
        if (hero != null)
        {
            hero.IsHero = true;
        }
    }

    private static void NormaliseHeadsUpPositions(ParsedHand hand)
    {
        if (hand.PlayerCount != 2)
            return;

        foreach (var player in hand.Players.Where(player => player.Position is "BTN SB" or "BTN"))
        {
            player.Position = "SB";
        }
    }

    private static void BuildActionStrings(ParsedHand hand, Dictionary<string, List<string>> actions)
    {
        hand.PreflopAction = string.Join("\n", actions["preflop"].Select(FormatActionLineForAnalysis));
        hand.FlopAction = string.Join("\n", actions["flop"].Select(FormatActionLineForAnalysis));
        hand.TurnAction = string.Join("\n", actions["turn"].Select(FormatActionLineForAnalysis));
        hand.RiverAction = string.Join("\n", actions["river"].Select(FormatActionLineForAnalysis));
    }

    private static string FormatActionLineForAnalysis(string line)
    {
        if (string.IsNullOrWhiteSpace(line))
            return line;

        var cleaned = StripUnibetId(line.Trim());

        // Convertit "Player action..." en "Player: action..." pour aligner avec l'analyse Betclic.
        var match = Regex.Match(
            cleaned,
            @"^(.+?)\s+(posts small blind|posts big blind|folds|checks|calls|bets|raises)\b(.*)$",
            RegexOptions.IgnoreCase);

        if (!match.Success)
            return cleaned;

        var player = match.Groups[1].Value.Trim();
        var actionHead = match.Groups[2].Value.Trim();
        var actionTail = match.Groups[3].Value;
        return $"{player}: {actionHead}{actionTail}".Trim();
    }

    private static void GenerateHandId(ParsedHand hand)
    {
        if (!string.IsNullOrEmpty(hand.HandId))
        {
            hand.Id = hand.HandId;
            return;
        }

        if (!string.IsNullOrEmpty(hand.GameId) && !string.IsNullOrEmpty(hand.DateTime))
        {
            hand.Id = $"{hand.GameId}_{hand.DateTime}".Replace(":", "").Replace(" ", "_");
            hand.HandId = hand.GameId;
            return;
        }

        hand.Id = Guid.NewGuid().ToString();
    }

    private static void BuildStructuredActions(ParsedHand hand, Dictionary<string, List<string>> rawActions, List<(int Seat, string Name, double Stack)> seatedPlayers)
    {
        var seatMap = seatedPlayers.ToDictionary(player => player.Name, player => player.Seat, StringComparer.OrdinalIgnoreCase);
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
                TournamentId = hand.GameId,
                BuyIn = hand.BuyIn > 0 ? hand.BuyIn : null,
                BuyinCurrency = hand.BuyinCurrency,
                Multiplier = hand.Multiplier > 1 ? hand.Multiplier : null,
                PrizePool = hand.PrizePool > 0 ? hand.PrizePool : null,
                Position = hand.Position > 0 ? hand.Position : null
            },
            Players = hand.Players.Select(player => new PlayerHandInfo
            {
                Seat = seatMap.GetValueOrDefault(player.Name, 0),
                Name = player.Name,
                Stack = player.Stack,
                IsHero = player.IsHero
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
                Winners = hand.Players
                    .Where(player => player.ChipsWon > 0)
                    .Select(player => new WinnerInfo { Player = player.Name, Amount = player.ChipsWon })
                    .ToList()
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
            foreach (var actionLine in rawActions[street])
            {
                orderCounters[street]++;
                var action = ParseToStructuredAction(actionLine, street, orderCounters[street]);
                if (action != null)
                {
                    structured.Actions.Add(action);
                }
            }
        }

        hand.StructuredActions = structured;
    }

    private static StreetAction? ParseToStructuredAction(string line, string street, int order)
    {
        var isAllIn = AllInSuffixRegex.IsMatch(line);
        var playerMatch = Regex.Match(line, @"^(.+?) (?:posts small blind|posts big blind|folds|checks|calls|bets|raises)", RegexOptions.IgnoreCase);
        var playerName = playerMatch.Success ? playerMatch.Groups[1].Value.Trim() : "Unknown";

        if (PostsSbRegex.IsMatch(line))
        {
            var match = PostsSbRegex.Match(line);
            return new StreetAction
            {
                Street = street,
                Order = order,
                Player = playerName,
                Type = ActionType.post,
                PostType = "sb",
                Amount = ParseAmount(match.Groups[2].Value),
                IsAllIn = isAllIn
            };
        }

        if (PostsBbRegex.IsMatch(line))
        {
            var match = PostsBbRegex.Match(line);
            return new StreetAction
            {
                Street = street,
                Order = order,
                Player = playerName,
                Type = ActionType.post,
                PostType = "bb",
                Amount = ParseAmount(match.Groups[2].Value),
                IsAllIn = isAllIn
            };
        }

        if (FoldsRegex.IsMatch(line))
        {
            return new StreetAction { Street = street, Order = order, Player = playerName, Type = ActionType.fold };
        }

        if (ChecksRegex.IsMatch(line))
        {
            return new StreetAction { Street = street, Order = order, Player = playerName, Type = ActionType.check };
        }

        if (CallsRegex.IsMatch(line))
        {
            var match = CallsRegex.Match(line);
            var amount = ParseAmount(match.Groups[2].Value);
            return new StreetAction { Street = street, Order = order, Player = playerName, Type = ActionType.call, Amount = amount, Effective = amount, IsAllIn = isAllIn };
        }

        if (BetsRegex.IsMatch(line))
        {
            var match = BetsRegex.Match(line);
            var amount = ParseAmount(match.Groups[2].Value);
            return new StreetAction { Street = street, Order = order, Player = playerName, Type = ActionType.bet, Amount = amount, Effective = amount, IsAllIn = isAllIn };
        }

        if (RaisesRegex.IsMatch(line))
        {
            var match = RaisesRegex.Match(line);
            var amount = ParseAmount(match.Groups[2].Value);
            return new StreetAction { Street = street, Order = order, Player = playerName, Type = ActionType.raise, Amount = amount, Effective = amount, IsAllIn = isAllIn };
        }

        return null;
    }

    private static void MarkAllInPlayer(ParsedHand hand, string line, string street)
    {
        if (!AllInSuffixRegex.IsMatch(line))
            return;

        var playerMatch = Regex.Match(line, @"^(.+?) (?:posts small blind|posts big blind|calls|bets|raises)", RegexOptions.IgnoreCase);
        if (!playerMatch.Success)
            return;

        var player = FindPlayer(hand, playerMatch.Groups[1].Value.Trim());
        if (player == null)
            return;

        player.IsAllIn = true;
        hand.AllInStreet ??= street;
    }

    private static PlayerInfo? FindPlayer(ParsedHand hand, string playerName)
    {
        var normalized = StripUnibetId(playerName);
        return hand.Players.FirstOrDefault(player => player.Name.Equals(normalized, StringComparison.OrdinalIgnoreCase));
    }

    private static double ParseAmount(string value)
    {
        double.TryParse(value.Replace(',', '.'), NumberStyles.Any, CultureInfo.InvariantCulture, out var amount);
        return amount;
    }
}
