using System.Text.RegularExpressions;
using System.Globalization;
using SpinTrackerBackend;
using System.Text.Json;

namespace SpinTrackerBackend;

public class BetclicParser : IHandParser
{
    public string RoomName => "Betclic";
    public int ParserVersion => 3;
    public string HandSeparator => "------------";

    // Section Headers
    private const string SectionHeader = "*** HEADER ***";
    private const string SectionPlayers = "*** PLAYERS ***";
    private const string SectionHoleCards = "*** HOLE CARDS ***";
    private const string SectionPreFlop = "*** PRE-FLOP ***";
    private const string SectionFlop = "*** FLOP ***";
    private const string SectionTurn = "*** TURN ***";
    private const string SectionRiver = "*** RIVER ***";
    private const string SectionShowdown = "*** SHOWDOWN ***";
    private const string SectionSummary = "*** SUMMARY ***";

    // Regex Patterns
    private static readonly Regex FlopRegex = new(@"\[(.*?)\]", RegexOptions.Compiled);
    private static readonly Regex TurnRiverRegex = new(@"\[(.*?)\]", RegexOptions.Compiled);
    private static readonly Regex PrizePoolRegex = new(@"(?<!x)(\d+\.?\d*)", RegexOptions.Compiled);
    private static readonly Regex MultiplierRegex = new(@"x(\d+)", RegexOptions.Compiled);
    private static readonly Regex BuyInRegex = new(@"[\d.]+", RegexOptions.Compiled);
    private static readonly Regex SeatRegex = new(@"Seat (\d+): (.+?) \((\d+)\)(.*)", RegexOptions.Compiled);
    private static readonly Regex ShowMatchRegex = new(@"^(?:[0-9]{1,2}:[0-9]{2}\s*-\s*)?(.+?)\s+(?:shows|mucks)\s+\[(.*?)\]", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex HoleMatchRegex = new(@"^(?:[0-9]{1,2}:[0-9]{2}\s*-\s*)?(.+?):\s*\[(.+?)\]", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex DealtToRegex = new(@"^Dealt to (.+?) \[(.+?)\]", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex NoShowMatchRegex = new(@"^(?:[0-9]{1,2}:[0-9]{2}\s*-\s*)?(.+?)\s+does not show", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex SummaryShowMatchRegex = new(@"Seat \d+: (.+?) .*showed \[(.+?)\]", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex PotWinRegex = new(@"^(?:[0-9]{1,2}:[0-9]{2}:[0-9]{2}\s*-\s*)?(.+?) wins .*?pot (?:of )?(\d+(?:\.\d+)?)", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex TotalPotSummaryRegex = new(@"(\d+\.?\d*)", RegexOptions.Compiled);
    private static readonly Regex FinishPositionRegex = new(@"^(?:[0-9]{1,2}:[0-9]{2}:[0-9]{2}\s*-\s*)?(.+?) finished (\d+)(?:st|nd|rd)", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // Investment Regex Patterns
    private static readonly Regex PostsSbRegex = new(@"Posts SB (\d+)", RegexOptions.Compiled);
    private static readonly Regex PostsBbRegex = new(@"Posts BB (\d+)", RegexOptions.Compiled);
    private static readonly Regex RaisesToRegex = new(@"Raises to (\d+)", RegexOptions.Compiled);
    private static readonly Regex CallsRegex = new(@"Calls (\d+)", RegexOptions.Compiled);
    private static readonly Regex BetsRegex = new(@"Bets (\d+)", RegexOptions.Compiled);

    public bool DetectFormat(string content)
    {
        // Check for Betclic variants (Betclic, Betclic.fr, etc.)
        return content.Contains("Site: Betclic");
    }

    public ParseResult ParseFile(string fileContent)
    {
        try
        {
            var handTexts = fileContent.Split(new[] { HandSeparator }, StringSplitOptions.RemoveEmptyEntries)
                                      .Select(h => h.Trim())
                                      .Where(h => !string.IsNullOrEmpty(h))
                                      .ToList();

            var hands = new List<ParsedHand>();

            foreach (var handText in handTexts)
            {
                var hand = ParseHand(handText);
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

            var hand = new ParsedHand { Room = "Betclic" };
            
            // Context variables used across sections
            string currentSection = "HEADER";
            string? heroName = null;
            var players = new List<Dictionary<string, object>>();
            bool heroWon = false;
            double totalPotWon = 0;
            bool heroHasPotRecorded = false;
            bool explicitPotWinFound = false;
            bool showdownSectionEncountered = false;

            var actions = new Dictionary<string, List<string>>
            {
                ["preflop"] = new(),
                ["flop"] = new(),
                ["turn"] = new(),
                ["river"] = new()
            };

            foreach (var line in lines)
            {
                // Normalize hero name for the result log
                string resultLine = !string.IsNullOrEmpty(heroName) ? line.Replace(heroName, "Hero") : line;
                hand.Result += resultLine + "\n";

                // Detect Section Change
                var newSection = DetectSection(line);
                if (newSection != null)
                {
                    currentSection = newSection;
                    
                    // Extract board cards immediately upon section detection
                    ParseBoardCards(line, currentSection, hand);
                    
                    if (currentSection == "SHOWDOWN")
                    {
                        hand.WentToShowdown = true;
                        showdownSectionEncountered = true;
                    }
                    continue; 
                }

                // Process Line based on Section
                switch (currentSection)
                {
                    case "HEADER":
                        ParseHeaderLine(line, hand);
                        break;

                    case "PLAYERS":
                        ParsePlayerLine(line, hand, players, ref heroName);
                        break;

                    case "HOLE_CARDS":
                    case "PREFLOP":
                    case "FLOP":
                    case "TURN":
                    case "RIVER":
                    case "SHOWDOWN":
                        // Actions and Card Reveals happen in these sections
                        ParseGamePlayLine(line, hand, currentSection, actions, heroName, ref showdownSectionEncountered);
                        break;

                    case "SUMMARY":
                        ParseSummaryLine(line, hand, ref explicitPotWinFound, ref heroHasPotRecorded, ref totalPotWon, ref heroWon, heroName, showdownSectionEncountered);
                        break;
                }
            }

            // Post-Processing Calculations
            BuildActionStrings(hand, actions); // Build action strings before calculations
            BuildStructuredActions(hand, actions, heroName);
            CalculateInvestmentsAndProfits(hand, players, actions, heroName, totalPotWon);
            NormalizeHandData(hand, players, heroName);
            GenerateHandId(hand);
            ConsolidateShowdownStatus(hand, showdownSectionEncountered);

            return hand;
    }

    private string? DetectSection(string line)
    {
        if (line.Contains(SectionHeader)) return "HEADER";
        if (line.Contains(SectionPlayers)) return "PLAYERS";
        if (line.Contains(SectionHoleCards)) return "HOLE_CARDS";
        if (line.Contains(SectionPreFlop)) return "PREFLOP";
        if (line.Contains(SectionFlop)) return "FLOP";
        if (line.Contains(SectionTurn)) return "TURN";
        if (line.Contains(SectionRiver)) return "RIVER";
        if (line.Contains(SectionShowdown)) return "SHOWDOWN";
        if (line.Contains(SectionSummary)) return "SUMMARY";
        return null;
    }

    private void ParseBoardCards(string line, string section, ParsedHand hand)
    {
        if (section == "FLOP")
        {
            var match = FlopRegex.Match(line);
            if (match.Success) hand.Flop = match.Groups[1].Value;
        }
        else if (section == "TURN")
        {
            var match = TurnRiverRegex.Match(line);
            if (match.Success)
            {
                var cards = match.Groups[1].Value.Split(' ');
                hand.Turn = cards.Length > 0 ? cards[^1] : null;
            }
        }
        else if (section == "RIVER")
        {
            var match = TurnRiverRegex.Match(line);
            if (match.Success)
            {
                var cards = match.Groups[1].Value.Split(' ');
                hand.River = cards.Length > 0 ? cards[^1] : null;
            }
        }
    }

    private void ParseHeaderLine(string line, ParsedHand hand)
    {
        if (line.Contains("Site:"))
            hand.Room = line.Split(new[] { ':' }, 2)[1].Trim();
        else if (line.Contains("Game Mode:"))
            hand.GameMode = line.Split(new[] { ':' }, 2)[1].Trim();
        else if (line.Contains("Game Type:"))
            hand.GameType = line.Split(new[] { ':' }, 2)[1].Trim();
        else if (line.Contains("Game Name:"))
            hand.GameName = line.Split(new[] { ':' }, 2)[1].Trim();
        else if (line.Contains("Game ID:"))
            hand.GameId = line.Split(new[] { ':' }, 2)[1].Trim();
        else if (line.Contains("Hand ID:"))
            hand.HandId = line.Split(new[] { ':' }, 2)[1].Trim();
        else if (line.Contains("Prize pool:"))
        {
            var match = PrizePoolRegex.Match(line);
            if (match.Success) hand.PrizePool = double.Parse(match.Value, CultureInfo.InvariantCulture);
        }
        else if (line.Contains("Multiplier:"))
        {
            var match = MultiplierRegex.Match(line);
            if (match.Success) hand.Multiplier = int.Parse(match.Groups[1].Value);
        }
        else if (line.Contains("Buy In:"))
        {
            var match = BuyInRegex.Match(line);
            if (match.Success) hand.BuyIn = double.Parse(match.Value, CultureInfo.InvariantCulture);
        }
        else if (line.Contains("Date & Time:"))
        {
            var rawDateTime = line.Split(new[] { ':' }, 2)[1].Trim().Replace("(UTC)", "").Trim();
            // Try to parse and re-format to ISO for consistent sorting/filtering
            if (DateTime.TryParse(rawDateTime, out var dt))
            {
                hand.DateTime = dt.ToString("yyyy-MM-dd HH:mm:ss");
            }
            else
            {
                hand.DateTime = rawDateTime;
            }
        }
        else if (line.Contains("Table ID:"))
            hand.TableId = line.Split(new[] { ':' }, 2)[1].Trim();
        else if (line.Contains("Blinds:"))
        {
            hand.Blinds = line.Split(new[] { ':' }, 2)[1].Trim();
            ParseBetclicBlinds(hand, hand.Blinds);
        }
        else if (line.Contains("Total Pot:"))
        {
            var match = PrizePoolRegex.Match(line);
            if (match.Success) hand.TotalPot = double.Parse(match.Value, CultureInfo.InvariantCulture);
        }
        else if (line.Contains("Rake:"))
        {
            var match = PrizePoolRegex.Match(line);
            if (match.Success) hand.Rake = double.Parse(match.Value, CultureInfo.InvariantCulture);
        }
    }

    private void ParsePlayerLine(string line, ParsedHand hand, List<Dictionary<string, object>> players, ref string? heroName)
    {
        if (line.Contains("Seat "))
        {
            var match = SeatRegex.Match(line);
            if (match.Success)
            {
                var seat = int.Parse(match.Groups[1].Value);
                var name = match.Groups[2].Value;
                var stack = int.Parse(match.Groups[3].Value);
                var positions = match.Groups[4].Value;
                bool isHero = positions.Contains("Hero");

                var player = new Dictionary<string, object>
                {
                    ["seat"] = seat,
                    ["name"] = name,
                    ["stack"] = stack,
                    ["position"] = ExtractPosition(positions),
                    ["isHero"] = isHero
                };
                players.Add(player);
                hand.Players.Add(new PlayerInfo
                {
                    Name = name,
                    Stack = stack,
                    IsHero = isHero,
                    Position = ExtractPosition(positions)
                });

                if (isHero)
                {
                    heroName = name;
                }
            }
        }
    }

    private void ParseGamePlayLine(string line, ParsedHand hand, string currentSection, Dictionary<string, List<string>> actions, string? heroName, ref bool showdownSectionEncountered)
    {
        // 1. Check for Card Reveals (Show/Muck/Hole Cards)
        bool cardsFound = ParseCardReveals(line, hand, currentSection, heroName, ref showdownSectionEncountered);
        
        // 2. Parse Actions (Folds, Raises, Calls, etc.)
        if (!cardsFound)
        {
            ParseActionLine(line, hand, currentSection, actions, heroName);
        }
    }

    private bool ParseCardReveals(string line, ParsedHand hand, string currentSection, string? heroName, ref bool showdownSectionEncountered)
    {
        var showMatch = ShowMatchRegex.Match(line);
        var holeMatch = HoleMatchRegex.Match(line);
        var dealtToMatch = DealtToRegex.Match(line);
        var noShowMatch = NoShowMatchRegex.Match(line);
        var summaryShowMatch = SummaryShowMatchRegex.Match(line);

        if (dealtToMatch.Success)
        {
            var playerName = dealtToMatch.Groups[1].Value.Trim();
            var cards = dealtToMatch.Groups[2].Value.Trim();

            var pInfo = hand.Players.FirstOrDefault(x => x.Name.Equals(playerName, StringComparison.OrdinalIgnoreCase));
            if (pInfo != null)
            {
                pInfo.IsHero = true;
                pInfo.Cards = cards;
            }

            return true;
        }

        if (showMatch.Success)
        {
            var playerName = showMatch.Groups[1].Value.Trim();
            var cards = showMatch.Groups[2].Value.Trim();

            hand.WentToShowdown = true;
            showdownSectionEncountered = true;

            UpdatePlayerCards(hand, playerName, cards);
            return true;
        }
        else if (holeMatch.Success || summaryShowMatch.Success)
        {
            var match = holeMatch.Success ? holeMatch : summaryShowMatch;
            var playerName = match.Groups[1].Value.Trim();
            var cards = match.Groups[2].Value.Trim();

            var pInfo = hand.Players.FirstOrDefault(x => x.Name.Equals(playerName, StringComparison.OrdinalIgnoreCase));
            if (pInfo != null)
            {
                pInfo.Cards = cards;
                if (currentSection == "SHOWDOWN" || currentSection == "SUMMARY")
                {
                    pInfo.WentToShowdown = true;
                }
            }

            if (IsHeroName(playerName, heroName))
            {
                if (summaryShowMatch.Success)
                {
                    hand.WentToShowdown = true;
                    showdownSectionEncountered = true;
                    if (pInfo != null) pInfo.WentToShowdown = true;
                }
            }
            else if (IsValidCardString(cards))
            {
                if (summaryShowMatch.Success || currentSection == "SHOWDOWN")
                {
                    hand.WentToShowdown = true;
                    showdownSectionEncountered = true;
                    if (pInfo != null) pInfo.WentToShowdown = true;
                }
            }
            return true;
        }
        else if (noShowMatch.Success)
        {
            var playerName = noShowMatch.Groups[1].Value.Trim();
            hand.WentToShowdown = true;
            showdownSectionEncountered = true;

            var pInfo = hand.Players.FirstOrDefault(x => x.Name.Equals(playerName, StringComparison.OrdinalIgnoreCase));
            if (pInfo != null)
            {
                pInfo.WentToShowdown = true;
            }
            return true;
        }

        return false;
    }

    private void ParseActionLine(string line, ParsedHand hand, string currentSection, Dictionary<string, List<string>> actions, string? heroName)
    {
        var lowerLine = line.ToLower();

        // Detect Folds
        if (line.IndexOf("folds", StringComparison.OrdinalIgnoreCase) >= 0)
        {
            HandleFold(line, hand);
        }

        // Detect Standard Actions
        if (lowerLine.Contains("posts") || lowerLine.Contains("raises") || lowerLine.Contains("calls") || 
            lowerLine.Contains("bets") || lowerLine.Contains("folds") || lowerLine.Contains("checks") || 
            lowerLine.Contains("all-in"))
        {
            // Record raw action string for the section
            if (currentSection == "PREFLOP") actions["preflop"].Add(line);
            else if (currentSection == "FLOP") actions["flop"].Add(line);
            else if (currentSection == "TURN") actions["turn"].Add(line);
            else if (currentSection == "RIVER") actions["river"].Add(line);

            // Detect All-In
            if (lowerLine.Contains("all-in"))
            {
                if (string.IsNullOrEmpty(hand.AllInStreet))
                {
                    hand.AllInStreet = currentSection;
                }

                foreach (var p in hand.Players)
                {
                    if (lowerLine.Contains(p.Name.ToLower()))
                    {
                        p.IsAllIn = true;
                    }
                }
            }
        }
    }

    private void HandleFold(string line, ParsedHand hand)
    {
        // Try to extract player name who folded
        // Format: "HH:MM:SS - PlayerName: Folds" or "PlayerName: Folds" or "PlayerName folds"
        string pName = "";
        
        var lowerLine = line.ToLower();
        if (lowerLine.EndsWith("folds") || lowerLine.Contains(" folds "))
        {
             var preFold = line.Substring(0, line.LastIndexOf("folds", StringComparison.OrdinalIgnoreCase)).Trim();
             if (preFold.EndsWith(":")) preFold = preFold.Substring(0, preFold.Length - 1).Trim();
             
             var dashIndex = preFold.LastIndexOf("- ");
             pName = (dashIndex >= 0) ? preFold.Substring(dashIndex + 1).Trim() : preFold;
        }
        else
        {
            // Fallback Regex
            var foldMatch = Regex.Match(line, @"(?:^|:\s*)Folds\b", RegexOptions.IgnoreCase);
            if (foldMatch.Success)
            {
                 var preFold = line.Substring(0, line.LastIndexOf("folds", StringComparison.OrdinalIgnoreCase)).Trim();
                 if (preFold.EndsWith(":")) preFold = preFold.Substring(0, preFold.Length - 1).Trim();
                 var dashIndex = preFold.LastIndexOf("- ");
                 pName = (dashIndex >= 0) ? preFold.Substring(dashIndex + 1).Trim() : preFold;
            }
        }

        if (!string.IsNullOrEmpty(pName))
        {
             var pInfo = hand.Players.FirstOrDefault(x => x.Name.Equals(pName, StringComparison.OrdinalIgnoreCase));
             if (pInfo != null) pInfo.Folded = true;
        }
    }

    private void ParseSummaryLine(string line, ParsedHand hand, ref bool explicitPotWinFound, ref bool heroHasPotRecorded, ref double totalPotWon, ref bool heroWon, string? heroName, bool showdownSectionEncountered)
    {
        var lowerLine = line.ToLower();

        // Capture raw showdown/summary lines for the Showdown field
        if (!string.IsNullOrWhiteSpace(line))
        {
            if (string.IsNullOrEmpty(hand.Showdown))
                hand.Showdown = line;
            else
                hand.Showdown += "\n" + line;
        }

        // Extract finishing position
        var posMatch = FinishPositionRegex.Match(line);
        if (posMatch.Success)
        {
            var playerName = posMatch.Groups[1].Value.Trim();
            var pos = int.Parse(posMatch.Groups[2].Value);
            bool isHero = IsHeroName(playerName, heroName);
            
            if (isHero)
            {
                hand.Position = pos;
            }
        }

        if (lowerLine.Contains("total pot"))
        {
            var match = TotalPotSummaryRegex.Match(line);
            if (match.Success)
                hand.TotalPot = double.Parse(match.Groups[1].Value);
        }

        // Match any "<player> wins ... pot of <amount>"
        var potWinMatch = PotWinRegex.Match(line);
        if (potWinMatch.Success)
        {
            explicitPotWinFound = true;
            var winner = potWinMatch.Groups[1].Value.Trim();
            var amountStr = potWinMatch.Groups[2].Value;
            double amount = double.Parse(amountStr, CultureInfo.InvariantCulture);

            bool isHeroWin = IsHeroName(winner, heroName);

            var pWin = hand.Players.FirstOrDefault(x => x.Name.Equals(winner, StringComparison.OrdinalIgnoreCase));
            if (pWin == null && isHeroWin)
            {
                pWin = hand.Players.FirstOrDefault(x => x.IsHero);
            }

            if (pWin != null) pWin.ChipsWon += amount;

            if (isHeroWin)
            {
                totalPotWon += amount;
                heroWon = true;
                heroHasPotRecorded = true;
                
                if (showdownSectionEncountered || (pWin != null && pWin.IsAllIn && hand.Players.Any(p => p.Name != pWin.Name && p.IsAllIn)))
                {
                    hand.WentToShowdown = true;
                    if (pWin != null) pWin.WentToShowdown = true;
                }
            }
            else
            {
                if (pWin != null && (showdownSectionEncountered || (pWin.IsAllIn && hand.Players.Any(p => p.Name != pWin.Name && p.IsAllIn))))
                {
                    hand.WentToShowdown = true;
                    pWin.WentToShowdown = true;
                }
            }
        }

        // Fallback for when hero wins but no explicit pot amount line is found
        if (!heroHasPotRecorded && !explicitPotWinFound && !string.IsNullOrEmpty(heroName) && 
            lowerLine.Contains("finished") && lowerLine.Contains("wins") && lowerLine.Contains(heroName.ToLower()))
        {
            if (hand.TotalPot > 0)
            {
                var pHero = hand.Players.FirstOrDefault(x => x.IsHero);
                if (pHero != null) pHero.ChipsWon += hand.TotalPot;

                totalPotWon += hand.TotalPot;
                heroWon = true;
                heroHasPotRecorded = true;
                
                if (showdownSectionEncountered || (pHero != null && pHero.IsAllIn && hand.Players.Any(p => p.Name != pHero.Name && p.IsAllIn)))
                {
                    hand.WentToShowdown = true;
                    if (pHero != null) pHero.WentToShowdown = true;
                }
            }
        }
    }

    private void CalculateInvestmentsAndProfits(ParsedHand hand, List<Dictionary<string, object>> players, Dictionary<string, List<string>> actions, string? heroName, double totalPotWon)
    {
        var playerInvestments = new Dictionary<string, double>();
        double totalInvestment = 0;
        double maxInvestment = 0;
        string? maxInvestor = null;

        foreach (var player in players)
        {
            var pName = player["name"].ToString()!;
            var inv = CalculatePlayerInvestment(actions, pName);
            
            var pInfo = hand.Players.FirstOrDefault(x => x.Name == pName);
            if (pInfo != null) pInfo.Investment = inv;

            playerInvestments[pName] = inv;
            totalInvestment += inv;
            if (inv > maxInvestment)
            {
                maxInvestment = inv;
                maxInvestor = player["name"].ToString();
            }
        }

        // Adjust for uncalled bets
        if (totalInvestment > hand.TotalPot && !string.IsNullOrEmpty(maxInvestor))
        {
            var excess = totalInvestment - hand.TotalPot;
            playerInvestments[maxInvestor] -= excess;

            var pInfo = hand.Players.FirstOrDefault(x => x.Name == maxInvestor);
            if (pInfo != null) pInfo.Investment -= excess;
        }
        
        // Calculate Net Profit
        foreach (var p in hand.Players)
        {
            p.NetProfit = p.ChipsWon - p.Investment;
        }
    }

    private void NormalizeHandData(ParsedHand hand, List<Dictionary<string, object>> players, string? heroName)
    {
        hand.PlayerCount = players.Count;
        
        // Normalize Heads-Up positions
        if (hand.PlayerCount == 2)
        {
            // Update all players positions for consistency in DB
            foreach (var p in hand.Players)
            {
                if (p.Position == "BTN SB" || p.Position == "BTN")
                    p.Position = "SB";
            }
        }
    }
    
    private void BuildActionStrings(ParsedHand hand, Dictionary<string, List<string>> actions)
    {
        hand.PreflopAction = string.Join("\n", actions["preflop"]);
        hand.FlopAction = string.Join("\n", actions["flop"]);
        hand.TurnAction = string.Join("\n", actions["turn"]);
        hand.RiverAction = string.Join("\n", actions["river"]);
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
            hand.HandId = hand.GameId;
        }
        else
        {
            hand.Id = Guid.NewGuid().ToString();
        }
    }

    private void ConsolidateShowdownStatus(ParsedHand hand, bool showdownSectionEncountered)
    {
        if (showdownSectionEncountered)
        {
            hand.WentToShowdown = true;
            foreach (var p in hand.Players)
            {
                if (!p.Folded)
                {
                    p.WentToShowdown = true;
                }
            }
        }
    }

    // Helpers
    private bool IsHeroName(string name, string? heroName)
    {
        return (!string.IsNullOrEmpty(heroName) && name.Equals(heroName, StringComparison.OrdinalIgnoreCase)) ||
                name.Equals("Hero", StringComparison.OrdinalIgnoreCase);
    }

    private bool IsValidCardString(string cards)
    {
        return !cards.Equals("none", StringComparison.OrdinalIgnoreCase) && 
               !cards.Contains("folded", StringComparison.OrdinalIgnoreCase);
    }

    private void UpdatePlayerCards(ParsedHand hand, string playerName, string cards)
    {
        var pInfo = hand.Players.FirstOrDefault(x => x.Name.Equals(playerName, StringComparison.OrdinalIgnoreCase));
        if (pInfo != null)
        {
            if (string.IsNullOrEmpty(pInfo.Cards))
                pInfo.Cards = cards;
            else if (!pInfo.Cards.Contains(cards))
                pInfo.Cards += "|" + cards;
        }
    }

    private string ExtractPosition(string positionString)
    {
        var posUpper = positionString.ToUpper();
        if (posUpper.Contains("BTN") && posUpper.Contains("SB")) return "BTN SB";
        if (posUpper.Contains("BTN")) return "BTN";
        if (posUpper.Contains("SB")) return "SB";
        if (posUpper.Contains("BB")) return "BB";
        if (posUpper.Contains("CO")) return "CO";
        if (posUpper.Contains("MP")) return "MP";
        if (posUpper.Contains("UTG")) return "UTG";
        return "Unknown";
    }

    private void ParseBetclicBlinds(ParsedHand hand, string blindsStr)
    {
        var blindMatch = Regex.Match(blindsStr, @"(\d+\.?\d*)/(\d+\.?\d*)");
        if (blindMatch.Success)
        {
            var sb = double.Parse(blindMatch.Groups[1].Value, CultureInfo.InvariantCulture);
            var bb = double.Parse(blindMatch.Groups[2].Value, CultureInfo.InvariantCulture);
            hand.StructuredBlinds = new BlindsInfo { Sb = sb, Bb = bb };
            hand.LimitType = "NL";
            hand.GameVariant = "HOLDEM";
        }

        var anteMatch = Regex.Match(blindsStr, @"ante (\d+\.?\d*)", RegexOptions.IgnoreCase);
        if (anteMatch.Success)
        {
            hand.Ante = double.Parse(anteMatch.Groups[1].Value, CultureInfo.InvariantCulture);
            if (hand.StructuredBlinds == null)
                hand.StructuredBlinds = new BlindsInfo();
            hand.StructuredBlinds.Ante = hand.Ante;
        }
    }

    private double CalculatePlayerInvestment(Dictionary<string, List<string>> actions, string playerName)
    {
        double total = 0;
        foreach (var street in new[] { "preflop", "flop", "turn", "river" })
        {
            double streetInvestment = 0;
            foreach (var action in actions.GetValueOrDefault(street, new List<string>()))
            {
                if (!action.Contains(playerName)) continue;

                var match = PostsSbRegex.Match(action);
                if (match.Success) streetInvestment += double.Parse(match.Groups[1].Value);

                match = PostsBbRegex.Match(action);
                if (match.Success) streetInvestment += double.Parse(match.Groups[1].Value);

                match = RaisesToRegex.Match(action);
                if (match.Success) streetInvestment = double.Parse(match.Groups[1].Value);

                match = CallsRegex.Match(action);
                if (match.Success) streetInvestment += double.Parse(match.Groups[1].Value);

                match = BetsRegex.Match(action);
                if (match.Success) streetInvestment += double.Parse(match.Groups[1].Value);
            }
            total += streetInvestment;
        }
        return total;
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
                TournamentId = hand.GameId,
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
                var action = ParseBetclicActionLineToStructured(actionLine, street, orderCounters[street], heroName);
                if (action != null)
                    structured.Actions.Add(action);
            }
        }

        hand.StructuredActions = structured;
    }

    private StreetAction? ParseBetclicActionLineToStructured(string line, string street, int order, string? heroName)
    {
        var lowerLine = line.ToLower();

        var playerMatch = Regex.Match(line, @"^(?:[0-9]{1,2}:[0-9]{2}\s*-\s*)?(.+?):");
        var playerName = playerMatch.Success ? playerMatch.Groups[1].Value.Trim() : "Unknown";

        if (lowerLine.Contains("posts sb"))
        {
            var amountMatch = Regex.Match(line, @"Posts SB (\d+)");
            return new StreetAction
            {
                Street = street,
                Order = order,
                Player = playerName,
                Type = ActionType.post,
                PostType = "sb",
                Amount = amountMatch.Success ? double.Parse(amountMatch.Groups[1].Value) : null
            };
        }
        else if (lowerLine.Contains("posts bb"))
        {
            var amountMatch = Regex.Match(line, @"Posts BB (\d+)");
            return new StreetAction
            {
                Street = street,
                Order = order,
                Player = playerName,
                Type = ActionType.post,
                PostType = "bb",
                Amount = amountMatch.Success ? double.Parse(amountMatch.Groups[1].Value) : null
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
            var amountMatch = Regex.Match(line, @"Bets (\d+)");
            var isAllIn = lowerLine.Contains("all-in");
            return new StreetAction
            {
                Street = street,
                Order = order,
                Player = playerName,
                Type = ActionType.bet,
                Amount = amountMatch.Success ? double.Parse(amountMatch.Groups[1].Value) : null,
                Effective = amountMatch.Success ? double.Parse(amountMatch.Groups[1].Value) : null,
                IsAllIn = isAllIn
            };
        }
        else if (lowerLine.Contains("calls"))
        {
            var amountMatch = Regex.Match(line, @"Calls (\d+)");
            var isAllIn = lowerLine.Contains("all-in");
            return new StreetAction
            {
                Street = street,
                Order = order,
                Player = playerName,
                Type = ActionType.call,
                Amount = amountMatch.Success ? double.Parse(amountMatch.Groups[1].Value) : null,
                Effective = amountMatch.Success ? double.Parse(amountMatch.Groups[1].Value) : null,
                IsAllIn = isAllIn
            };
        }
        else if (lowerLine.Contains("raises"))
        {
            var amountMatch = Regex.Match(line, @"Raises to (\d+)");
            var isAllIn = lowerLine.Contains("all-in");
            double? amount = amountMatch.Success ? double.Parse(amountMatch.Groups[1].Value) : null;
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
}
