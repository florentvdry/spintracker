using System.Text.RegularExpressions;
using System.Globalization;

namespace PokerTrackerBackend;

public class BetclicParser : IHandParser
{
    public string RoomName => "Betclic";
    public int ParserVersion => 3;
    private const string HandSeparator = "------------";

    public bool DetectFormat(string content)
    {
        return content.Contains("Site: Betclic") || content.Contains("*** HEADER ***");
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

            string currentSection = "HEADER"; // Initialize to HEADER as first lines are usually header info
            string? heroName = null;
            var players = new List<Dictionary<string, object>>();
            bool heroWon = false;
            double totalPotWon = 0;
            bool heroHasPotRecorded = false;
            bool explicitPotWinFound = false;
            bool showdownSectionEncountered = false;

            // Health check name comparison helper
            bool IsHeroName(string name) => 
                (!string.IsNullOrEmpty(heroName) && name.Equals(heroName, StringComparison.OrdinalIgnoreCase)) ||
                name.Equals("Hero", StringComparison.OrdinalIgnoreCase);

            var actions = new Dictionary<string, List<string>>
            {
                ["preflop"] = new(),
                ["flop"] = new(),
                ["turn"] = new(),
                ["river"] = new()
            };

            foreach (var line in lines)
            {
                // Record the line in Result for auditing/debugging
                string resultLine = !string.IsNullOrEmpty(heroName) ? line.Replace(heroName, "Hero") : line;
                hand.Result += resultLine + "\n";

                // Detect sections
                if (line.Contains("*** HEADER ***")) currentSection = "HEADER";
                else if (line.Contains("*** PLAYERS ***")) currentSection = "PLAYERS";
                else if (line.Contains("*** HOLE CARDS ***")) currentSection = "HOLE_CARDS";
                else if (line.Contains("*** PRE-FLOP ***")) currentSection = "PREFLOP";
                else if (line.Contains("*** FLOP ***"))
                {
                    currentSection = "FLOP";
                    var match = Regex.Match(line, @"\[(.*?)\]");
                    if (match.Success)
                        hand.Flop = match.Groups[1].Value;
                }
                else if (line.Contains("*** TURN ***"))
                {
                    currentSection = "TURN";
                    var match = Regex.Match(line, @"\[(.*?)\]");
                    if (match.Success)
                    {
                        var cards = match.Groups[1].Value.Split(' ');
                        hand.Turn = cards.Length > 0 ? cards[^1] : null;
                    }
                }
                else if (line.Contains("*** RIVER ***"))
                {
                    currentSection = "RIVER";
                    var match = Regex.Match(line, @"\[(.*?)\]");
                    if (match.Success)
                    {
                        var cards = match.Groups[1].Value.Split(' ');
                        hand.River = cards.Length > 0 ? cards[^1] : null;
                    }
                }
                else if (line.Contains("*** SHOWDOWN ***")) 
                {
                    currentSection = "SHOWDOWN";
                    hand.WentToShowdown = true;
                    showdownSectionEncountered = true;
                }
                else if (line.Contains("*** SUMMARY ***")) currentSection = "SUMMARY";

                // Parse HEADER
                if (currentSection == "HEADER")
                {
                    if (line.Contains("Site:"))
                    {
                        var parts = line.Split(new[] { ':' }, 2);
                        if (parts.Length > 1)
                            hand.Room = parts[1].Trim();
                    }
                    else if (line.Contains("Game Mode:"))
                    {
                        var parts = line.Split(new[] { ':' }, 2);
                        if (parts.Length > 1)
                            hand.GameMode = parts[1].Trim();
                    }
                    else if (line.Contains("Game Type:"))
                    {
                        var parts = line.Split(new[] { ':' }, 2);
                        if (parts.Length > 1)
                            hand.GameType = parts[1].Trim();
                    }
                    else if (line.Contains("Game Name:"))
                    {
                        var parts = line.Split(new[] { ':' }, 2);
                        if (parts.Length > 1)
                            hand.GameName = parts[1].Trim();
                    }
                    else if (line.Contains("Game ID:"))
                    {
                        var parts = line.Split(new[] { ':' }, 2);
                        if (parts.Length > 1)
                            hand.GameId = parts[1].Trim();
                    }
                    else if (line.Contains("Hand ID:"))
                    {
                        var parts = line.Split(new[] { ':' }, 2);
                        if (parts.Length > 1)
                            hand.HandId = parts[1].Trim();
                    }
                    else if (line.Contains("Prize pool:"))
                    {
                        var match = Regex.Match(line, @"[\d.]+");
                        if (match.Success)
                            hand.PrizePool = double.Parse(match.Value, CultureInfo.InvariantCulture);
                    }
                    else if (line.Contains("Multiplier:"))
                    {
                        var match = Regex.Match(line, @"x(\d+)");
                        if (match.Success)
                            hand.Multiplier = int.Parse(match.Groups[1].Value);
                    }
                    else if (line.Contains("Buy In:"))
                    {
                        var match = Regex.Match(line, @"[\d.]+");
                        if (match.Success)
                            hand.BuyIn = double.Parse(match.Value, CultureInfo.InvariantCulture);
                    }
                    else if (line.Contains("Date & Time:"))
                    {
                        var parts = line.Split(new[] { ':' }, 2);
                        if (parts.Length > 1)
                            hand.DateTime = parts[1].Trim();
                    }
                    else if (line.Contains("Table ID:"))
                    {
                        var parts = line.Split(new[] { ':' }, 2);
                        if (parts.Length > 1)
                            hand.TableId = parts[1].Trim();
                    }
                    else if (line.Contains("Blinds:"))
                    {
                        var parts = line.Split(new[] { ':' }, 2);
                        if (parts.Length > 1)
                            hand.Blinds = parts[1].Trim();
                    }
                    else if (line.Contains("Total Pot:"))
                    {
                        var match = Regex.Match(line, @"[\d.]+");
                        if (match.Success)
                            hand.TotalPot = double.Parse(match.Value, CultureInfo.InvariantCulture);
                    }
                    else if (line.Contains("Rake:"))
                    {
                        var match = Regex.Match(line, @"[\d.]+");
                        if (match.Success)
                            hand.Rake = double.Parse(match.Value, CultureInfo.InvariantCulture);
                    }
                }

                // Parse PLAYERS
                else if (currentSection == "PLAYERS")
                {
                    if (line.Contains("Seat "))
                    {
                        var match = Regex.Match(line, @"Seat (\d+): (.+?) \((\d+)\)(.*)");
                        if (match.Success)
                        {
                            var seat = match.Groups[1].Value;
                            var name = match.Groups[2].Value;
                            var stack = match.Groups[3].Value;
                            var positions = match.Groups[4].Value;
                            bool isHero = positions.Contains("Hero");
                            var player = new Dictionary<string, object>
                            {
                                ["seat"] = int.Parse(seat),
                                ["name"] = name,
                                ["stack"] = int.Parse(stack),
                                ["position"] = ExtractPosition(positions),
                                ["isHero"] = isHero
                            };
                            players.Add(player);
                            hand.Players.Add(new PlayerInfo 
                            { 
                                Name = name, 
                                Stack = int.Parse(stack),
                                IsHero = isHero
                            });

                            if (isHero)
                            {
                                heroName = name;
                                hand.HeroStack = (int)player["stack"];
                                hand.HeroPosition = player["position"].ToString();
                                hand.HeroName = heroName;
                            }
                            else
                            {
                                hand.VillainStacks[name] = (int)player["stack"];
                            }
                        }
                    }
                }
                // Global match for "PlayerName shows/mucks [XX XX]" or "Hero shows/mucks [XX XX]"
                // Support optional timestamp prefix "HH:MM - "
                var showMatch = Regex.Match(line, @"^(?:[0-9]{1,2}:[0-9]{2}\s*-\s*)?(.+?)\s+(?:shows|mucks)\s+\[(.*?)\]", RegexOptions.IgnoreCase);
                // Match "PlayerName: [XX XX]" with optional timestamp prefix
                var holeMatch = Regex.Match(line, @"^(?:[0-9]{1,2}:[0-9]{2}\s*-\s*)?(.+?):\s*\[(.+?)\]", RegexOptions.IgnoreCase);
                
                if (showMatch.Success)
                {
                    var playerName = showMatch.Groups[1].Value.Trim();
                    var cards = showMatch.Groups[2].Value.Trim();

                    // Any explicit show/muck sets showdown flag
                    hand.WentToShowdown = true;
                    showdownSectionEncountered = true;

                    if (IsHeroName(playerName))
                    {
                        hand.HeroCards = cards;
                        hand.HeroWentToShowdown = true;
                    }
                    else if (!cards.Equals("none", StringComparison.OrdinalIgnoreCase) && !cards.Contains("folded", StringComparison.OrdinalIgnoreCase))
                    {
                        if (string.IsNullOrEmpty(hand.VillainCards))
                            hand.VillainCards = cards;
                        else if (!hand.VillainCards.Contains(cards))
                            hand.VillainCards += "|" + cards;
                    }
                }
                else if (holeMatch.Success)
                {
                    var playerName = holeMatch.Groups[1].Value.Trim();
                    var cards = holeMatch.Groups[2].Value.Trim();

                    var pInfo = hand.Players.FirstOrDefault(x => x.Name.Equals(playerName, StringComparison.OrdinalIgnoreCase));
                    if (pInfo != null) pInfo.Cards = cards;

                    if (IsHeroName(playerName))
                    {
                        hand.HeroCards = cards;
                        // Hero cards in SUMMARY section (like "Hero: [As Ad]") is a showdown.
                        // Hero cards in HOLE_CARDS section is just the deal.
                        if (currentSection != "HOLE_CARDS" && currentSection != "PLAYERS" && currentSection != "HEADER")
                        {
                            hand.WentToShowdown = true;
                            hand.HeroWentToShowdown = true;
                            showdownSectionEncountered = true;
                        }
                    }
                    else if (!cards.Equals("none", StringComparison.OrdinalIgnoreCase) && !cards.Contains("folded", StringComparison.OrdinalIgnoreCase))
                    {
                        // Villain showing cards ALWAYS implies a showdown in Betclic HH
                        hand.WentToShowdown = true;
                        showdownSectionEncountered = true;
                        if (string.IsNullOrEmpty(hand.VillainCards))
                            hand.VillainCards = cards;
                        else if (!hand.VillainCards.Contains(cards))
                            hand.VillainCards += "|" + cards;
                    }
                }

                // Parse actions
                // Normalize action keyword detection (case-insensitive)
                var lowerLine = line.ToLower();
                if (lowerLine.Contains("posts") || lowerLine.Contains("raises") || lowerLine.Contains("calls") || lowerLine.Contains("bets") || lowerLine.Contains("folds") || lowerLine.Contains("checks") || lowerLine.Contains("all-in"))
                {
                    if (currentSection == "PREFLOP")
                        actions["preflop"].Add(line);
                    else if (currentSection == "FLOP")
                        actions["flop"].Add(line);
                    else if (currentSection == "TURN")
                        actions["turn"].Add(line);
                    else if (currentSection == "RIVER")
                        actions["river"].Add(line);
                    // Detect all-in (case-insensitive)
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

                // Parse SHOWDOWN
                else if (currentSection == "SHOWDOWN")
                {
                    hand.Showdown += line + "\n";
                }

                // Parse SUMMARY
                else if (currentSection == "SUMMARY")
                {
                    if (lowerLine.Contains("total pot"))
                    {
                        var match = Regex.Match(line, @"(\d+\.?\d*)");
                        if (match.Success)
                            hand.TotalPot = double.Parse(match.Groups[1].Value);
                    }

                    // Match any "<player> wins ... pot of <amount>" and attribute to that player
                    var potWinMatch = Regex.Match(line, @"^(.+?) wins .*?pot (?:of )?(\d+(?:\.\d+)?)", RegexOptions.IgnoreCase);
                    if (potWinMatch.Success)
                    {
                        explicitPotWinFound = true;
                        var winner = potWinMatch.Groups[1].Value.Trim();
                        var amountStr = potWinMatch.Groups[2].Value;
                        double amount = double.Parse(amountStr, CultureInfo.InvariantCulture);

                        bool isHeroWin = IsHeroName(winner);
                        
                        if (hand.HandId == "01KE07GK7BGA0VGNA694AB9XD1")
                            Console.WriteLine($"[Parser Debug] PotWin: Winner='{winner}' Amount={amount} IsHero={isHeroWin} HeroName='{heroName}'");

                        if (isHeroWin)
                        {
                            totalPotWon += amount;
                            heroWon = true;
                            heroHasPotRecorded = true;
                            
                            if (showdownSectionEncountered || (hand.HeroAllIn && hand.VillainAllIn))
                            {
                                hand.WentToShowdown = true;
                                hand.HeroWentToShowdown = true;
                            }
                        }
                        else
                        {
                            if (hand.HeroAllIn && hand.VillainAllIn)
                                hand.WentToShowdown = true;
                        }
                    }

                    // If hero appears in a "finished ... wins" line but no pot amounts were recorded for him,
                    // fall back to using the hand.TotalPot (this covers lines like "finished 1st and wins 4.00 EUR").
                    // Only fallback to attributing the whole TotalPot to hero when there is no explicit
                    // "wins ... pot of <amount>" line anywhere in the summary. If explicit pot wins
                    // are present (as in normal SUMMARY blocks), do not assume the hero won the full pot
                    // based solely on a "finished ... wins" line (which often reports cash payouts in EUR).
                    if (!heroHasPotRecorded && !explicitPotWinFound && !string.IsNullOrEmpty(heroName) && lowerLine.Contains("finished") && lowerLine.Contains("wins") && lowerLine.Contains(heroName.ToLower()))
                    {
                        if (hand.TotalPot > 0)
                        {
                            totalPotWon += hand.TotalPot;
                            heroWon = true;
                            heroHasPotRecorded = true;
                            
                            // If it's a "finished 1st" hand after an all-in, it's usually a showdown
                            if (showdownSectionEncountered || hand.HeroAllIn || hand.VillainAllIn)
                            {
                                hand.WentToShowdown = true;
                                hand.HeroWentToShowdown = true;
                            }
                        }
                    }
                }
            }

            // Calculate profit
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
                // Console.WriteLine($"[Parser Debug] Adjusting uncalled bet: TotalInv={totalInvestment} Pot={hand.TotalPot} Excess={excess} Player={maxInvestor}");
                playerInvestments[maxInvestor] -= excess;

                var pInfo = hand.Players.FirstOrDefault(x => x.Name == maxInvestor);
                if (pInfo != null) pInfo.Investment -= excess;
            }
            
            var heroInvestment = playerInvestments.GetValueOrDefault(heroName ?? "", 0.0);
            hand.HeroInvestment = heroInvestment;
            hand.HeroProfit = totalPotWon - heroInvestment;
            hand.HeroNetProfit = hand.HeroProfit;

            // Normalize positions
            hand.PlayerCount = players.Count;
            var villain = players.FirstOrDefault(p => p["name"].ToString() != heroName);
            if (villain != null)
            {
                hand.VillainPosition = villain["position"].ToString();
                hand.VillainStack = (int)villain["stack"];
                // Normalize hero position based on player count
                var heroPos = hand.HeroPosition;
                if (hand.PlayerCount == 2)
                {
                    if (heroPos == "BTN SB" || heroPos == "BTN")
                    {
                        heroPos = "SB";
                    }
                }
                hand.HeroPosition = $"Hero ({heroPos})";
                var villainPos = villain["position"].ToString();
                if (hand.PlayerCount == 2)
                {
                    if (villainPos == "BTN SB" || villainPos == "BTN")
                    {
                        villainPos = "SB";
                    }
                }
                hand.VillainPosition = $"Villain ({villainPos})";
            }

            // Build action strings
            hand.PreflopAction = string.Join("\n", actions["preflop"]);
            hand.FlopAction = string.Join("\n", actions["flop"]);
            hand.TurnAction = string.Join("\n", actions["turn"]);
            hand.RiverAction = string.Join("\n", actions["river"]);

            // Generate unique ID — prefer the explicit HandId if present (from the hand history),
            // otherwise fallback to GameId + DateTime. This avoids collisions when multiple hands
            // share the same GameId and timestamp precision.
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
                // Last resort: hash of the hand text could be used, but for now use a timestamp-based id
                hand.Id = Guid.NewGuid().ToString();
            }

            return hand;
        }
        catch (Exception)
        {
            return null;
        }
    }

    private string ExtractPosition(string positionString)
    {
        var posUpper = positionString.ToUpper();
        if (posUpper.Contains("BTN") && posUpper.Contains("SB"))
            return "BTN SB";
        if (posUpper.Contains("BTN"))
            return "BTN";
        if (posUpper.Contains("SB"))
            return "SB";
        if (posUpper.Contains("BB"))
            return "BB";
        if (posUpper.Contains("CO"))
            return "CO";
        if (posUpper.Contains("MP"))
            return "MP";
        if (posUpper.Contains("UTG"))
            return "UTG";
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
                if (action.Contains("Posts SB"))
                {
                    var match = Regex.Match(action, @"Posts SB (\d+)");
                    if (match.Success)
                        streetInvestment += double.Parse(match.Groups[1].Value);
                }
                else if (action.Contains("Posts BB"))
                {
                    var match = Regex.Match(action, @"Posts BB (\d+)");
                    if (match.Success)
                        streetInvestment += double.Parse(match.Groups[1].Value);
                }
                else if (action.Contains("Raises to"))
                {
                    var match = Regex.Match(action, @"Raises to (\d+)");
                    if (match.Success)
                        streetInvestment = double.Parse(match.Groups[1].Value);
                }
                else if (action.Contains("Calls"))
                {
                    var match = Regex.Match(action, @"Calls (\d+)");
                    if (match.Success)
                        streetInvestment += double.Parse(match.Groups[1].Value);
                }
                else if (action.Contains("Bets"))
                {
                    var match = Regex.Match(action, @"Bets (\d+)");
                    if (match.Success)
                        streetInvestment += double.Parse(match.Groups[1].Value);
                }
            }
            total += streetInvestment;
        }
        return total;
    }
}
