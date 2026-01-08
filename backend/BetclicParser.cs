using System.Text.RegularExpressions;
using System.Globalization;

namespace PokerTrackerBackend;

public class BetclicParser : IHandParser
{
    public string RoomName => "Betclic";
    public int ParserVersion => 3;
    private const string HandSeparator = "------------";

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
    private static readonly Regex PrizePoolRegex = new(@"[\d.]+", RegexOptions.Compiled);
    private static readonly Regex MultiplierRegex = new(@"x(\d+)", RegexOptions.Compiled);
    private static readonly Regex BuyInRegex = new(@"[\d.]+", RegexOptions.Compiled);
    private static readonly Regex SeatRegex = new(@"Seat (\d+): (.+?) \((\d+)\)(.*)", RegexOptions.Compiled);
    private static readonly Regex ShowMatchRegex = new(@"^(?:[0-9]{1,2}:[0-9]{2}\s*-\s*)?(.+?)\s+(?:shows|mucks)\s+\[(.*?)\]", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex HoleMatchRegex = new(@"^(?:[0-9]{1,2}:[0-9]{2}\s*-\s*)?(.+?):\s*\[(.+?)\]", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex NoShowMatchRegex = new(@"^(?:[0-9]{1,2}:[0-9]{2}\s*-\s*)?(.+?)\s+does not show", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex SummaryShowMatchRegex = new(@"Seat \d+: (.+?) .*showed \[(.+?)\]", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex PotWinRegex = new(@"^(.+?) wins .*?pot (?:of )?(\d+(?:\.\d+)?)", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex TotalPotSummaryRegex = new(@"(\d+\.?\d*)", RegexOptions.Compiled);

    // Investment Regex Patterns
    private static readonly Regex PostsSbRegex = new(@"Posts SB (\d+)", RegexOptions.Compiled);
    private static readonly Regex PostsBbRegex = new(@"Posts BB (\d+)", RegexOptions.Compiled);
    private static readonly Regex RaisesToRegex = new(@"Raises to (\d+)", RegexOptions.Compiled);
    private static readonly Regex CallsRegex = new(@"Calls (\d+)", RegexOptions.Compiled);
    private static readonly Regex BetsRegex = new(@"Bets (\d+)", RegexOptions.Compiled);

    public bool DetectFormat(string content)
    {
        return content.Contains("Site: Betclic") || content.Contains(SectionHeader);
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
        try
        {
            var lines = handText.Split('\n')
                               .Select(l => l.Trim())
                               .Where(l => !string.IsNullOrEmpty(l))
                               .ToList();

            var hand = new ParsedHand { Room = "Betclic.fr" };
            
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
            CalculateInvestmentsAndProfits(hand, players, actions, heroName, totalPotWon);
            NormalizeHandData(hand, players, heroName);
            GenerateHandId(hand);
            ConsolidateShowdownStatus(hand, showdownSectionEncountered);

            return hand;
        }
        catch (Exception)
        {
            return null;
        }
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
            hand.DateTime = line.Split(new[] { ':' }, 2)[1].Trim().Replace("(UTC)", "").Trim();
        else if (line.Contains("Table ID:"))
            hand.TableId = line.Split(new[] { ':' }, 2)[1].Trim();
        else if (line.Contains("Blinds:"))
            hand.Blinds = line.Split(new[] { ':' }, 2)[1].Trim();
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
                    hand.HeroStack = stack;
                    hand.HeroPosition = player["position"].ToString();
                    hand.HeroName = heroName;
                }
                else
                {
                    hand.VillainStacks[name] = stack;
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
        var noShowMatch = NoShowMatchRegex.Match(line);
        var summaryShowMatch = SummaryShowMatchRegex.Match(line);

        if (showMatch.Success)
        {
            var playerName = showMatch.Groups[1].Value.Trim();
            var cards = showMatch.Groups[2].Value.Trim();

            hand.WentToShowdown = true;
            showdownSectionEncountered = true;

            UpdatePlayerCards(hand, playerName, cards);
            
            if (IsHeroName(playerName, heroName))
            {
                hand.HeroCards = cards;
            }
            else if (IsValidCardString(cards))
            {
                UpdateVillainCards(hand, cards);
            }
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
                hand.HeroCards = cards;
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
                UpdateVillainCards(hand, cards);
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

                if (!string.IsNullOrEmpty(heroName) && lowerLine.Contains(heroName.ToLower()))
                    hand.HeroAllIn = true;
                else
                    hand.VillainAllIn = true;
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
        
        var heroInvestment = playerInvestments.GetValueOrDefault(heroName ?? "", 0.0);
        hand.HeroInvestment = heroInvestment;
        hand.HeroProfit = totalPotWon - heroInvestment;
        hand.HeroNetProfit = hand.HeroProfit;
    }

    private void NormalizeHandData(ParsedHand hand, List<Dictionary<string, object>> players, string? heroName)
    {
        hand.PlayerCount = players.Count;
        var villain = players.FirstOrDefault(p => p["name"].ToString() != heroName);
        if (villain != null)
        {
            hand.VillainPosition = villain["position"].ToString();
            hand.VillainStack = (int)villain["stack"];
            
            // Normalize Heads-Up positions
            if (hand.PlayerCount == 2)
            {
                if (hand.HeroPosition == "BTN SB" || hand.HeroPosition == "BTN")
                    hand.HeroPosition = "SB";
                
                var villainPos = villain["position"].ToString();
                if (villainPos == "BTN SB" || villainPos == "BTN")
                    villainPos = "SB";
                
                hand.VillainPosition = $"Villain ({villainPos})";

                // Update all players positions for consistency in DB
                foreach (var p in hand.Players)
                {
                    if (p.Position == "BTN SB" || p.Position == "BTN")
                        p.Position = "SB";
                }
            }
            else
            {
                hand.VillainPosition = $"Villain ({hand.VillainPosition})";
            }
            
            hand.HeroPosition = $"Hero ({hand.HeroPosition})";
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
            
            var heroP = hand.Players.FirstOrDefault(p => p.IsHero);
            if (heroP != null)
            {
                hand.HeroWentToShowdown = heroP.WentToShowdown;
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

    private void UpdateVillainCards(ParsedHand hand, string cards)
    {
        if (string.IsNullOrEmpty(hand.VillainCards))
            hand.VillainCards = cards;
        else if (!hand.VillainCards.Contains(cards))
            hand.VillainCards += "|" + cards;
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
}
