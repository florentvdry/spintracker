using System.Globalization;
using System.Text.RegularExpressions;
using SpinTrackerBackend;

namespace SpinTrackerBackend;

public class WinamaxParser : IHandParser
{
    public string RoomName => "Winamax";
    public int ParserVersion => 1;
    public string HandSeparator => "Winamax Poker - Tournament";

    private static readonly Regex HeaderRegex = new(
        @"Winamax Poker - Tournament ""(?<gameName>[^""]+)"" buyIn: (?<buyIn>\d+(?:[.,]\d+)?)\D+\s*\+\s*(?<fee>\d+(?:[.,]\d+)?)\D+ level: (?<level>\d+) - HandId: #(?<handId>[^\s]+) - Holdem no limit \((?<sb>\d+)\/(?<bb>\d+)\) - (?<date>\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) UTC",
        RegexOptions.Compiled);
    private static readonly Regex GameNameRegex = new(@"Tournament ""(?<v>[^""]+)""", RegexOptions.Compiled);
    private static readonly Regex BuyInFeeRegex = new(@"buyIn:\s*(?<buy>\d+(?:[.,]\d+)?)\D+\+\s*(?<fee>\d+(?:[.,]\d+)?)", RegexOptions.Compiled);
    private static readonly Regex LevelRegex = new(@"level:\s*(?<v>\d+)", RegexOptions.Compiled);
    private static readonly Regex HandIdRegex = new(@"HandId:\s*#(?<v>[^\s]+)", RegexOptions.Compiled);
    private static readonly Regex BlindsRegex = new(@"\((?<sb>\d+)\/(?<bb>\d+)\)", RegexOptions.Compiled);
    private static readonly Regex DateRegex = new(@"(?<v>\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s+UTC", RegexOptions.Compiled);

    private static readonly Regex TableRegex = new(
        @"Table: '(?<table>[^']+)' \d+-max .* Seat #(?<button>\d+) is the button",
        RegexOptions.Compiled);

    private static readonly Regex SeatRegex = new(
        @"Seat (?<seat>\d+): (?<name>.+?) \((?<stack>\d+)\)",
        RegexOptions.Compiled);

    private static readonly Regex DealtRegex = new(
        @"^Dealt to (?<name>.+?) \[(?<cards>[^\]]+)\]",
        RegexOptions.Compiled);

    private static readonly Regex CollectedRegex = new(
        @"^(?<name>.+?) collected (?<amount>\d+(?:\.\d+)?) from",
        RegexOptions.Compiled);

    private static readonly Regex ShowRegex = new(
        @"^(?<name>.+?) shows \[(?<cards>[^\]]+)\]",
        RegexOptions.Compiled);

    private static readonly Regex TotalPotRegex = new(
        @"^Total pot (?<pot>\d+(?:\.\d+)?)",
        RegexOptions.Compiled);

    private static readonly Regex PostsSbRegex = new(@" posts small blind (?<amt>\d+)", RegexOptions.Compiled);
    private static readonly Regex PostsBbRegex = new(@" posts big blind (?<amt>\d+)", RegexOptions.Compiled);
    private static readonly Regex CallsRegex = new(@" calls (?<amt>\d+)", RegexOptions.Compiled);
    private static readonly Regex BetsRegex = new(@" bets (?<amt>\d+)", RegexOptions.Compiled);
    private static readonly Regex RaisesToRegex = new(@" raises \d+ to (?<amt>\d+)", RegexOptions.Compiled);

    public bool DetectFormat(string content)
    {
        return content.Contains("Winamax Poker - Tournament") || content.Contains("Site: Winamax");
    }

    public ParseResult ParseFile(string fileContent)
    {
        try
        {
            var blocks = Regex.Split(fileContent, @"(?=Winamax Poker - Tournament)")
                .Select(x => x.Trim())
                .Where(x => !string.IsNullOrWhiteSpace(x) && x.StartsWith("Winamax Poker - Tournament"))
                .ToList();

            var hands = new List<ParsedHand>();
            foreach (var block in blocks)
            {
                var hand = ParseHand(block);
                if (hand != null)
                {
                    hands.Add(hand);
                }
            }

            return new ParseResult { Success = true, Hands = hands, Count = hands.Count };
        }
        catch (Exception ex)
        {
            return new ParseResult { Success = false, Error = ex.Message, Hands = new List<ParsedHand>(), Count = 0 };
        }
    }

    public ParsedHand? ParseHand(string handText)
    {
        var lines = handText.Split('\n')
            .Select(l => l.Trim())
            .Where(l => !string.IsNullOrWhiteSpace(l))
            .ToList();

        if (lines.Count == 0) return null;

        var hand = new ParsedHand
        {
            Room = "Winamax",
            GameMode = "Expresso",
            GameType = "Holdem no limit",
            GameVariant = "HOLDEM",
            LimitType = "NL",
            Currency = "EUR"
        };

        var actions = new Dictionary<string, List<string>>
        {
            ["preflop"] = new(),
            ["flop"] = new(),
            ["turn"] = new(),
            ["river"] = new()
        };

        var playerSeat = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        string? heroName = null;
        string section = "HEADER";

        foreach (var line in lines)
        {
            hand.Result += line + "\n";

            if (line.StartsWith("*** ANTE/BLINDS ***")) { section = "ANTE"; continue; }
            if (line.StartsWith("*** PRE-FLOP ***")) { section = "PREFLOP"; continue; }
            if (line.StartsWith("*** FLOP ***")) { section = "FLOP"; ParseBoard(line, hand, "FLOP"); continue; }
            if (line.StartsWith("*** TURN ***")) { section = "TURN"; ParseBoard(line, hand, "TURN"); continue; }
            if (line.StartsWith("*** RIVER ***")) { section = "RIVER"; ParseBoard(line, hand, "RIVER"); continue; }
            if (line.StartsWith("*** SHOW DOWN ***")) { section = "SHOWDOWN"; hand.WentToShowdown = true; continue; }
            if (line.StartsWith("*** SUMMARY ***")) { section = "SUMMARY"; continue; }

            if (section == "HEADER")
            {
                // Keep parsing header metadata, but do not short-circuit:
                // Winamax seat lines are still in the header block (before ANTE/BLINDS).
                ParseHeaderLine(line, hand);
            }

            // Track collected chips regardless of section (some Winamax exports place this outside strict blocks)
            var collectedAny = CollectedRegex.Match(line);
            if (collectedAny.Success)
            {
                var name = collectedAny.Groups["name"].Value.Trim();
                var amount = double.Parse(collectedAny.Groups["amount"].Value, CultureInfo.InvariantCulture);
                var winner = hand.Players.FirstOrDefault(x => x.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
                if (winner != null) winner.ChipsWon += amount;
            }

            var seatMatch = SeatRegex.Match(line);
            if (seatMatch.Success)
            {
                var seat = int.Parse(seatMatch.Groups["seat"].Value);
                var name = seatMatch.Groups["name"].Value.Trim();
                var stack = double.Parse(seatMatch.Groups["stack"].Value, CultureInfo.InvariantCulture);

                hand.Players.Add(new PlayerInfo
                {
                    Name = name,
                    Stack = stack
                });
                playerSeat[name] = seat;
                continue;
            }

            var dealt = DealtRegex.Match(line);
            if (dealt.Success)
            {
                heroName = dealt.Groups["name"].Value.Trim();
                var cards = dealt.Groups["cards"].Value.Trim();
                var hero = hand.Players.FirstOrDefault(p => p.Name.Equals(heroName, StringComparison.OrdinalIgnoreCase));
                if (hero != null)
                {
                    hero.IsHero = true;
                    hero.Cards = cards;
                }
                continue;
            }

            if (section is "ANTE" or "PREFLOP" or "FLOP" or "TURN" or "RIVER")
            {
                // Blinds/antes are preflop investments from a bankroll perspective.
                if (section == "ANTE") actions["preflop"].Add(line);
                if (section == "PREFLOP") actions["preflop"].Add(line);
                if (section == "FLOP") actions["flop"].Add(line);
                if (section == "TURN") actions["turn"].Add(line);
                if (section == "RIVER") actions["river"].Add(line);

                if (line.Contains(" and is all-in", StringComparison.OrdinalIgnoreCase) && string.IsNullOrEmpty(hand.AllInStreet))
                {
                    hand.AllInStreet = section;
                }

                if (line.Contains(" and is all-in", StringComparison.OrdinalIgnoreCase))
                {
                    var playerName = line.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
                    if (!string.IsNullOrWhiteSpace(playerName))
                    {
                        var p = hand.Players.FirstOrDefault(x => x.Name.Equals(playerName, StringComparison.OrdinalIgnoreCase));
                        if (p != null) p.IsAllIn = true;
                    }
                }

                continue;
            }

            if (section == "SHOWDOWN")
            {
                var show = ShowRegex.Match(line);
                if (show.Success)
                {
                    var name = show.Groups["name"].Value.Trim();
                    var cards = show.Groups["cards"].Value.Trim();
                    var p = hand.Players.FirstOrDefault(x => x.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
                    if (p != null)
                    {
                        p.Cards = cards;
                        p.WentToShowdown = true;
                    }
                }

                continue;
            }

            if (section == "SUMMARY")
            {
                var totalPot = TotalPotRegex.Match(line);
                if (totalPot.Success)
                {
                    hand.TotalPot = double.Parse(totalPot.Groups["pot"].Value, CultureInfo.InvariantCulture);
                }

            }
        }

        hand.PlayerCount = hand.Players.Count;
        hand.PreflopAction = string.Join("\n", actions["preflop"]);
        hand.FlopAction = string.Join("\n", actions["flop"]);
        hand.TurnAction = string.Join("\n", actions["turn"]);
        hand.RiverAction = string.Join("\n", actions["river"]);

        // Assign positions from button + blinds/actions (after actions and player count are finalized)
        AssignPositions(hand, playerSeat, actions["preflop"]);

        foreach (var p in hand.Players)
        {
            p.Investment = CalculateInvestmentForPlayer(actions, p.Name);
            p.NetProfit = p.ChipsWon - p.Investment;
        }

        if (!string.IsNullOrWhiteSpace(heroName))
        {
            var hero = hand.Players.FirstOrDefault(p => p.Name.Equals(heroName, StringComparison.OrdinalIgnoreCase));
            if (hero != null && hero.WentToShowdown)
            {
                hand.WentToShowdown = true;
            }
        }

        hand.Id = !string.IsNullOrWhiteSpace(hand.HandId) ? hand.HandId : Guid.NewGuid().ToString();
        return hand;
    }

    private static void ParseHeaderLine(string line, ParsedHand hand)
    {
        var m = HeaderRegex.Match(line);
        if (m.Success)
        {
            hand.GameName = m.Groups["gameName"].Value.Trim();
            hand.BuyIn = ParseEuro(m.Groups["buyIn"].Value);
            var fee = ParseEuro(m.Groups["fee"].Value);
            hand.RakePerPlayer = fee;
            hand.TournamentLevel = int.Parse(m.Groups["level"].Value, CultureInfo.InvariantCulture);
            hand.HandId = m.Groups["handId"].Value.Trim();
            hand.DateTime = DateTime.ParseExact(m.Groups["date"].Value, "yyyy/MM/dd HH:mm:ss", CultureInfo.InvariantCulture)
                .ToString("yyyy-MM-dd HH:mm:ss");
            var sb = double.Parse(m.Groups["sb"].Value, CultureInfo.InvariantCulture);
            var bb = double.Parse(m.Groups["bb"].Value, CultureInfo.InvariantCulture);
            hand.Blinds = $"{sb}/{bb}";
            hand.StructuredBlinds = new BlindsInfo { Sb = sb, Bb = bb };
        }
        else if (line.StartsWith("Winamax Poker - Tournament", StringComparison.Ordinal))
        {
            var gm = GameNameRegex.Match(line);
            if (gm.Success) hand.GameName = gm.Groups["v"].Value.Trim();

            var bf = BuyInFeeRegex.Match(line);
            if (bf.Success)
            {
                hand.BuyIn = ParseEuro(bf.Groups["buy"].Value);
                hand.RakePerPlayer = ParseEuro(bf.Groups["fee"].Value);
            }

            var lvl = LevelRegex.Match(line);
            if (lvl.Success && int.TryParse(lvl.Groups["v"].Value, out var parsedLevel))
            {
                hand.TournamentLevel = parsedLevel;
            }

            var hid = HandIdRegex.Match(line);
            if (hid.Success)
            {
                hand.HandId = hid.Groups["v"].Value.Trim();
            }

            var bl = BlindsRegex.Match(line);
            if (bl.Success)
            {
                var sb = double.Parse(bl.Groups["sb"].Value, CultureInfo.InvariantCulture);
                var bb = double.Parse(bl.Groups["bb"].Value, CultureInfo.InvariantCulture);
                hand.Blinds = $"{sb}/{bb}";
                hand.StructuredBlinds = new BlindsInfo { Sb = sb, Bb = bb };
            }

            var dt = DateRegex.Match(line);
            if (dt.Success)
            {
                if (DateTime.TryParseExact(dt.Groups["v"].Value.Trim(), "yyyy/MM/dd HH:mm:ss", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate))
                {
                    hand.DateTime = parsedDate.ToString("yyyy-MM-dd HH:mm:ss");
                }
            }
        }

        var t = TableRegex.Match(line);
        if (t.Success)
        {
            hand.TableId = t.Groups["table"].Value.Trim();
            hand.ButtonSeat = int.Parse(t.Groups["button"].Value, CultureInfo.InvariantCulture);

            var tourneyIdMatch = Regex.Match(hand.TableId, @"\((\d+)\)#");
            if (tourneyIdMatch.Success)
            {
                hand.GameId = tourneyIdMatch.Groups[1].Value;
                hand.TournamentId = hand.GameId;
            }
        }
    }

    private static void ParseBoard(string line, ParsedHand hand, string street)
    {
        var boardMatches = Regex.Matches(line, @"\[(.*?)\]");
        if (street == "FLOP" && boardMatches.Count >= 1)
        {
            hand.Flop = boardMatches[0].Groups[1].Value;
        }
        else if (street == "TURN" && boardMatches.Count >= 2)
        {
            hand.Turn = boardMatches[1].Groups[1].Value.Trim();
        }
        else if (street == "RIVER" && boardMatches.Count >= 2)
        {
            hand.River = boardMatches[1].Groups[1].Value.Trim();
        }
    }

    private static void AssignPositions(ParsedHand hand, Dictionary<string, int> playerSeat, List<string> preflopActions)
    {
        var playerCount = hand.Players.Count;
        if (!hand.ButtonSeat.HasValue || playerCount == 0) return;

        var buttonSeat = hand.ButtonSeat.Value;
        foreach (var p in hand.Players)
        {
            if (!playerSeat.TryGetValue(p.Name, out var seat)) continue;
            if (seat == buttonSeat) p.Position = playerCount == 2 ? "SB" : "BTN";
        }

        var sbLine = preflopActions.FirstOrDefault(x => x.Contains("posts small blind", StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrEmpty(sbLine))
        {
            var sbName = sbLine.Split(" posts small blind", StringSplitOptions.None)[0].Trim();
            var sbPlayer = hand.Players.FirstOrDefault(x => x.Name.Equals(sbName, StringComparison.OrdinalIgnoreCase));
            if (sbPlayer != null)
            {
                // In 3-max the button often posts SB; keep BTN classification there.
                if (playerCount == 2 || string.IsNullOrWhiteSpace(sbPlayer.Position))
                {
                    sbPlayer.Position = "SB";
                }
            }
        }

        var bbLine = preflopActions.FirstOrDefault(x => x.Contains("posts big blind", StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrEmpty(bbLine))
        {
            var bbName = bbLine.Split(" posts big blind", StringSplitOptions.None)[0].Trim();
            var bbPlayer = hand.Players.FirstOrDefault(x => x.Name.Equals(bbName, StringComparison.OrdinalIgnoreCase));
            if (bbPlayer != null) bbPlayer.Position = "BB";
        }
    }

    private static double CalculateInvestmentForPlayer(Dictionary<string, List<string>> actions, string playerName)
    {
        double total = 0;
        foreach (var street in new[] { "preflop", "flop", "turn", "river" })
        {
            double streetInvestment = 0;
            foreach (var line in actions[street])
            {
                if (!line.StartsWith(playerName, StringComparison.OrdinalIgnoreCase)) continue;

                var sb = PostsSbRegex.Match(line);
                if (sb.Success) streetInvestment += double.Parse(sb.Groups["amt"].Value, CultureInfo.InvariantCulture);

                var bb = PostsBbRegex.Match(line);
                if (bb.Success) streetInvestment += double.Parse(bb.Groups["amt"].Value, CultureInfo.InvariantCulture);

                var call = CallsRegex.Match(line);
                if (call.Success) streetInvestment += double.Parse(call.Groups["amt"].Value, CultureInfo.InvariantCulture);

                var bet = BetsRegex.Match(line);
                if (bet.Success) streetInvestment += double.Parse(bet.Groups["amt"].Value, CultureInfo.InvariantCulture);

                var raise = RaisesToRegex.Match(line);
                if (raise.Success) streetInvestment = Math.Max(streetInvestment, double.Parse(raise.Groups["amt"].Value, CultureInfo.InvariantCulture));
            }
            total += streetInvestment;
        }
        return total;
    }

    private static double ParseEuro(string raw)
    {
        return double.Parse(raw.Replace(',', '.'), CultureInfo.InvariantCulture);
    }
}

