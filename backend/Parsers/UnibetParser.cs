using System.Globalization;
using System.Text.RegularExpressions;
using SpinTrackerBackend;

namespace SpinTrackerBackend;

public class UnibetParser : IHandParser
{
    public string RoomName => "Unibet";
    public int ParserVersion => 1;
    public string HandSeparator => "Unibet Hand #";

    private static readonly Regex HeaderRegex = new(
        @"Unibet Hand #(?<handId>\d+), Tournament #(?<tournamentId>\d+), €(?<buyin>\d+(?:\.\d+)?) \+ €(?<fee>\d+(?:\.\d+)?) - (?<sb>\d+(?:\.\d+)?)\/(?<bb>\d+(?:\.\d+)?).+? - UTC (?<time>\d{2}:\d{2}:\d{2}) (?<date>\d{4}\/\d{2}\/\d{2})",
        RegexOptions.Compiled);

    private static readonly Regex TableRegex = new(
        @"Table ""(?<table>\d+)"" (?<size>\d+)-max",
        RegexOptions.Compiled);

    private static readonly Regex SeatRegex = new(
        @"Seat (?<seat>\d+): (?<name>.+?) \((?<stack>\d+(?:\.\d+)?)\)",
        RegexOptions.Compiled);

    private static readonly Regex ButtonRegex = new(
        @"(?<name>.+?) has the button",
        RegexOptions.Compiled);

    private static readonly Regex DealtToRegex = new(
        @"Dealt to (?<name>.+?) \[(?<cards>[^\]]+)\]",
        RegexOptions.Compiled);

    private static readonly Regex SummarySeatRegex = new(
        @"Seat (?<seat>\d+): (?<name>.+?): bet (?<bet>\d+(?:\.\d+)?) and won (?<won>\d+(?:\.\d+)?), net result: (?<net>-?\d+(?:\.\d+)?)",
        RegexOptions.Compiled);

    private static readonly Regex BoardRegex = new(
        @"\[(?<cards>.+?)\]",
        RegexOptions.Compiled);

    public bool DetectFormat(string content)
    {
        return content.Contains("Unibet Hand #") || content.Contains("Unibet Tournament #");
    }

    public ParseResult ParseFile(string fileContent)
    {
        try
        {
            // Split by "Unibet Hand #" but keep it in the block
            var blocks = Regex.Split(fileContent, @"(?=Unibet Hand #)")
                .Select(x => x.Trim())
                .Where(x => !string.IsNullOrWhiteSpace(x) && x.StartsWith("Unibet Hand #"))
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
            Room = "Unibet",
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

        string section = "HEADER";
        string? heroName = null;

        foreach (var line in lines)
        {
            hand.Result += line + "\n";

            if (line.StartsWith("*** Seated players ***")) { section = "PLAYERS"; continue; }
            if (line.StartsWith("*** Blinds and button ***")) { section = "BLINDS"; continue; }
            if (line.StartsWith("*** Hole cards ***")) { section = "HOLECARDS"; continue; }
            if (line.StartsWith("*** Preflop ***")) { section = "PREFLOP"; continue; }
            if (line.StartsWith("*** Flop ***")) { ParseBoard(line, hand, "FLOP"); if (section != "SHOWDOWN" && section != "SUMMARY") section = "FLOP"; continue; }
            if (line.StartsWith("*** Turn ***")) { ParseBoard(line, hand, "TURN"); if (section != "SHOWDOWN" && section != "SUMMARY") section = "TURN"; continue; }
            if (line.StartsWith("*** River ***")) { ParseBoard(line, hand, "RIVER"); if (section != "SHOWDOWN" && section != "SUMMARY") section = "RIVER"; continue; }
            if (line.StartsWith("*** Showdown ***")) { section = "SHOWDOWN"; hand.WentToShowdown = true; continue; }
            if (line.StartsWith("*** Summary ***")) { section = "SUMMARY"; continue; }

            if (section == "HEADER")
            {
                var m = HeaderRegex.Match(line);
                if (m.Success)
                {
                    hand.HandId = m.Groups["handId"].Value;
                    hand.GameId = m.Groups["tournamentId"].Value;
                    hand.TournamentId = hand.GameId;
                    hand.BuyIn = double.Parse(m.Groups["buyin"].Value, CultureInfo.InvariantCulture);
                    hand.RakePerPlayer = double.Parse(m.Groups["fee"].Value, CultureInfo.InvariantCulture);
                    var sb = double.Parse(m.Groups["sb"].Value, CultureInfo.InvariantCulture);
                    var bb = double.Parse(m.Groups["bb"].Value, CultureInfo.InvariantCulture);
                    hand.Blinds = $"{sb}/{bb}";
                    hand.StructuredBlinds = new BlindsInfo { Sb = sb, Bb = bb };
                    hand.DateTime = $"{m.Groups["date"].Value.Replace('/', '-')} {m.Groups["time"].Value}";
                    
                    if (hand.BuyIn > 0)
                    {
                        var totalBuyIn = hand.BuyIn + (hand.RakePerPlayer ?? 0);
                        var prizeMatch = Regex.Match(line, @"Total prize €(?<prize>\d+(?:\.\d+)?)");
                        if (prizeMatch.Success)
                        {
                            hand.PrizePool = double.Parse(prizeMatch.Groups["prize"].Value, CultureInfo.InvariantCulture);
                            hand.Multiplier = (int)Math.Round(hand.PrizePool / totalBuyIn);
                        }
                    }                }
                var tm = TableRegex.Match(line);
                if (tm.Success)
                {
                    hand.TableId = tm.Groups["table"].Value;
                    hand.PlayerCount = int.Parse(tm.Groups["size"].Value);
                }
            }
            else if (section == "PLAYERS")
            {
                var sm = SeatRegex.Match(line);
                if (sm.Success)
                {
                    hand.Players.Add(new PlayerInfo
                    {
                        Name = sm.Groups["name"].Value.Trim(),
                        Stack = double.Parse(sm.Groups["stack"].Value, CultureInfo.InvariantCulture)
                    });
                }
            }
            else if (section == "BLINDS")
            {
                var bm = ButtonRegex.Match(line);
                if (bm.Success)
                {
                    var name = bm.Groups["name"].Value.Trim();
                    var p = hand.Players.FirstOrDefault(x => x.Name == name);
                    if (p != null) p.Position = "BTN";
                }
                actions["preflop"].Add(line);
                CheckAllIn(line, hand, "PREFLOP");
            }
            else if (section == "HOLECARDS")
            {
                var dm = DealtToRegex.Match(line);
                if (dm.Success)
                {
                    heroName = dm.Groups["name"].Value.Trim();
                    var cards = dm.Groups["cards"].Value.Trim();
                    var p = hand.Players.FirstOrDefault(x => x.Name == heroName);
                    if (p != null)
                    {
                        p.Cards = cards;
                    }
                }
                else if (line.StartsWith("Dealt in "))
                {
                    // This is just a notification that a player is in the hand
                }
            }
            else if (section == "PREFLOP")
            {
                actions["preflop"].Add(line);
                CheckAllIn(line, hand, section);
                CheckFold(line, hand);
            }
            else if (section == "FLOP")
            {
                actions["flop"].Add(line);
                CheckAllIn(line, hand, section);
                CheckFold(line, hand);
            }
            else if (section == "TURN")
            {
                actions["turn"].Add(line);
                CheckAllIn(line, hand, section);
                CheckFold(line, hand);
            }
            else if (section == "RIVER")
            {
                actions["river"].Add(line);
                CheckAllIn(line, hand, section);
                CheckFold(line, hand);
            }
            else if (section == "SHOWDOWN")
            {
                if (line.Contains("shows"))
                {
                    var parts = line.Split(" shows ");
                    var name = parts[0].Trim();
                    var cardsMatch = Regex.Match(parts[1], @"\[(.+?)\]");
                    if (cardsMatch.Success)
                    {
                        var p = hand.Players.FirstOrDefault(x => x.Name == name);
                        if (p != null)
                        {
                            p.Cards = cardsMatch.Groups[1].Value.Trim();
                            p.WentToShowdown = true;
                        }
                    }
                }
            }
            else if (section == "SUMMARY")
            {
                if (line.StartsWith("Total pot"))
                {
                    var potMatch = Regex.Match(line, @"Total pot (\d+(?:\.\d+)?)");
                    if (potMatch.Success) hand.TotalPot = double.Parse(potMatch.Groups[1].Value, CultureInfo.InvariantCulture);
                }
                var ssm = SummarySeatRegex.Match(line);
                if (ssm.Success)
                {
                    var name = ssm.Groups["name"].Value.Trim();
                    var p = hand.Players.FirstOrDefault(x => x.Name == name);
                    if (p != null)
                    {
                        p.Investment = double.Parse(ssm.Groups["bet"].Value, CultureInfo.InvariantCulture);
                        p.ChipsWon = double.Parse(ssm.Groups["won"].Value, CultureInfo.InvariantCulture);
                        p.NetProfit = double.Parse(ssm.Groups["net"].Value, CultureInfo.InvariantCulture);
                    }
                }
            }
        }

        // Fix positions
        foreach (var line in actions["preflop"])
        {
            if (line.Contains("posts small blind"))
            {
                var name = line.Split(" posts small blind")[0].Trim();
                var p = hand.Players.FirstOrDefault(x => x.Name == name);
                if (p != null) p.Position = "SB";
            }
            else if (line.Contains("posts big blind"))
            {
                var name = line.Split(" posts big blind")[0].Trim();
                var p = hand.Players.FirstOrDefault(x => x.Name == name);
                if (p != null) p.Position = "BB";
            }
        }
        
        // If button didn't post SB (3-max), button position was already set.
        // If button DID post SB, we should prefer "BTN" or "SB"? 
        // Existing parsers seem to use "SB" for BTN in HU.
        if (hand.Players.Count == 2)
        {
            foreach (var p in hand.Players)
            {
                if (p.Position == "BTN") p.Position = "SB";
            }
        }

        hand.PreflopAction = string.Join("\n", actions["preflop"]);
        hand.FlopAction = string.Join("\n", actions["flop"]);
        hand.TurnAction = string.Join("\n", actions["turn"]);
        hand.RiverAction = string.Join("\n", actions["river"]);

        if (heroName != null)
        {
            var hero = hand.Players.FirstOrDefault(x => x.Name == heroName);
            if (hero != null && hero.WentToShowdown) hand.WentToShowdown = true;
        }

        hand.PlayerCount = hand.Players.Count;

        hand.Id = hand.HandId ?? Guid.NewGuid().ToString();

        return hand;
    }

    private void ParseBoard(string line, ParsedHand hand, string street)
    {
        var matches = BoardRegex.Matches(line);
        if (street == "FLOP" && matches.Count >= 1)
        {
            hand.Flop = matches[0].Groups["cards"].Value;
        }
        else if (street == "TURN" && matches.Count >= 2)
        {
            hand.Turn = matches[1].Groups["cards"].Value;
        }
        else if (street == "RIVER" && matches.Count >= 3)
        {
            hand.River = matches[2].Groups["cards"].Value;
        }
    }

    private void CheckAllIn(string line, ParsedHand hand, string street)
    {
        if (line.Contains("is all-in"))
        {
            if (string.IsNullOrEmpty(hand.AllInStreet)) hand.AllInStreet = street.ToUpper();
            var parts = line.Split(' ');
            var name = parts[0].Trim();
            var p = hand.Players.FirstOrDefault(x => x.Name == name);
            if (p != null) p.IsAllIn = true;
        }
    }

    private void CheckFold(string line, ParsedHand hand)
    {
        var foldIdx = line.IndexOf(" folds", StringComparison.OrdinalIgnoreCase);
        if (foldIdx < 0) return;
        var name = line[..foldIdx].Trim();
        var p = hand.Players.FirstOrDefault(x => x.Name == name);
        if (p != null) p.Folded = true;
    }
}
