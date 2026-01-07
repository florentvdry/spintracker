namespace PokerTrackerBackend;

public class AnalyticsCalculator
{
    private readonly EquityCalculator _equityCalc;
    private readonly ILogger<AnalyticsCalculator> _logger;

    public AnalyticsCalculator(EquityCalculator equityCalc, ILogger<AnalyticsCalculator> logger)
    {
        _equityCalc = equityCalc;
        _logger = logger;
    }

    public HandAnalytics CalculateHandAnalytics(ParsedHand hand)
    {
        var analytics = new HandAnalytics
        {
            HandId = hand.Id
        };

        var heroProfit = hand.HeroProfit;
        var isShowdown = hand.HeroWentToShowdown;

        // Classification: exactly match the 'expected_result' logic
        // Chips Won with Showdown should reflect ACTUAL total profit if showdown occurred
        // Chips Won without Showdown should reflect ACTUAL total profit if no showdown occurred
        if (isShowdown)
        {
            analytics.ChipsWonShowdown = heroProfit;
            analytics.ChipsWonNoShowdown = 0;
        }
        else
        {
            analytics.ChipsWonShowdown = 0;
            analytics.ChipsWonNoShowdown = heroProfit;
        }

        var heroAllIn = hand.HeroAllIn;
        var villainAllIn = hand.VillainAllIn;
        var heroCards = hand.HeroCards;
        var villainCards = hand.VillainCards;

        var isMultiway = !string.IsNullOrEmpty(villainCards) && villainCards.Contains('|');
        var hasBothCards = !string.IsNullOrEmpty(heroCards) &&
                          !string.IsNullOrEmpty(villainCards) &&
                          !string.Equals(villainCards?.Trim(), "none", StringComparison.OrdinalIgnoreCase);
        var anyAllIn = heroAllIn || villainAllIn;

        var isRiverAllIn = IsRiverAllIn(hand);

        var shouldCalculateEv = isShowdown && anyAllIn && hasBothCards && !isRiverAllIn;

        if (shouldCalculateEv)
        {
            double? evChips;

            // If there is post-all-in action (side pots developing on later streets), 
            // PT4 usually falls back to Profit (skips EV). We mimic this.
            if (HasSideAction(hand))
            {
                evChips = null;
            }
            else if (isMultiway)
            {
                evChips = CalculateMultiwayEv(hand);
            }
            else
            {
                evChips = CalculateAllInEv(hand);
            }

            if (evChips.HasValue)
            {
                analytics.EvChips = Math.Round(evChips.Value, 2);
                analytics.NetWonAdjusted = Math.Round(evChips.Value, 2);
                analytics.CevContribution = Math.Round(evChips.Value - heroProfit, 2);
            }
            else
            {
                analytics.NetWonAdjusted = heroProfit;
                analytics.CevContribution = 0;
            }
        }
        else
        {
            analytics.NetWonAdjusted = heroProfit;
            analytics.CevContribution = 0;
        }

        return analytics;
    }

    private bool IsRiverAllIn(ParsedHand hand)
    {
        return !string.IsNullOrEmpty(hand.AllInStreet) && 
               hand.AllInStreet.Equals("RIVER", StringComparison.OrdinalIgnoreCase);
    }

    private bool HasSideAction(ParsedHand hand)
    {
        var allInStreet = hand.AllInStreet;
        if (string.IsNullOrEmpty(allInStreet)) return false;

        bool checkFlop = false, checkTurn = false, checkRiver = false;

        if (allInStreet.Equals("PREFLOP", StringComparison.OrdinalIgnoreCase))
        {
            checkFlop = true; checkTurn = true; checkRiver = true;
        }
        else if (allInStreet.Equals("FLOP", StringComparison.OrdinalIgnoreCase))
        {
            checkTurn = true; checkRiver = true;
        }
        else if (allInStreet.Equals("TURN", StringComparison.OrdinalIgnoreCase))
        {
            checkRiver = true;
        }

        if (checkFlop && HasPlayerAction(hand.FlopAction)) return true;
        if (checkTurn && HasPlayerAction(hand.TurnAction)) return true;
        if (checkRiver && HasPlayerAction(hand.RiverAction)) return true;

        return false;
    }

    private bool HasPlayerAction(string actionText)
    {
        if (string.IsNullOrEmpty(actionText)) return false;
        var lower = actionText.ToLower();
        return lower.Contains("bets") || lower.Contains("calls") || 
               lower.Contains("raises") || lower.Contains("checks");
    }

    private double? CalculateAllInEv(ParsedHand hand)
    {
        try
        {
            var heroCards = hand.HeroCards;
            var villainCards = hand.VillainCards;
            var board = GetBoardAtAllIn(hand);

            if (string.IsNullOrEmpty(heroCards) || string.IsNullOrEmpty(villainCards))
                return null;

            var equity = _equityCalc.Calculate(heroCards, villainCards, board, 10000);
            var totalPot = hand.TotalPot;

            var heroInvestment = hand.HeroInvestment > 0 ? hand.HeroInvestment : (ParseHeroInvestment(hand) ?? (totalPot / 2.0));
            var perPlayer = ParseInvestmentsPerPlayer(hand);
            var heroName = hand.HeroName ?? "";
            var villainInvestment = perPlayer.Where(kv => !kv.Key.Equals(heroName, StringComparison.OrdinalIgnoreCase)).Select(kv => kv.Value).DefaultIfEmpty(0.0).Max();
            var ev = (equity.HeroEquity / 100.0) * totalPot - heroInvestment;

            return ev;
        }
        catch (Exception e)
        {
            _logger.LogError($"EV calculation CRITICAL error: {e.Message}");
            return null;
        }
    }

    private double? CalculateMultiwayEv(ParsedHand hand)
    {
        try
        {
            var heroCards = hand.HeroCards;
            if (string.IsNullOrEmpty(heroCards)) return null;

            // Filter players who have cards (Hero + Villains with known cards)
            // We assume players with known cards are the ones competing for EV (went to showdown or all-in revealed)
            var activePlayers = hand.Players.Where(p => !string.IsNullOrEmpty(p.Cards) && !p.Folded).ToList();
            
            // If we don't have players info (old parser?), fallback to legacy
            if (activePlayers.Count == 0 && !string.IsNullOrEmpty(hand.VillainCards))
            {
                // Fallback to legacy simplistic calculation
                // return CalculateMultiwayEvLegacy(hand); 
                // But we want to fix it, so let's try to reconstruct players from VillainCards string if Players is empty?
                // For now, assume Parser is updated.
                return null;
            }

            // Ensure Hero is in activePlayers
            if (!activePlayers.Any(p => p.IsHero))
            {
                // Should not happen if HeroCards is present
                 return null;
            }

            // Sort by investment (asc)
            var sortedPlayers = activePlayers.OrderBy(p => p.Investment).ToList();
            
            double totalEv = 0;
            double currentLevel = 0;
            
            var board = GetBoardAtAllIn(hand);
            
            for (int i = 0; i < sortedPlayers.Count; i++)
            {
                var p = sortedPlayers[i];
                var investment = p.Investment;
                
                if (investment <= currentLevel) continue;
                
                var step = investment - currentLevel;
                
                // Calculate Pot for this step (Side Pot or Main Pot slice)
                double stepPot = 0;
                foreach (var player in hand.Players)
                {
                    // Every player contributes to this step up to their investment cap
                    var contribution = Math.Max(0, Math.Min(step, player.Investment - currentLevel));
                    stepPot += contribution;
                }
                
                if (stepPot <= 0.01) continue;

                // Who competes for this pot?
                // All activePlayers with Investment >= investment (which are players from i onwards in sorted list)
                var competingPlayers = sortedPlayers.Skip(i).ToList();
                
                // Check if Hero is competing
                var heroPlayer = competingPlayers.FirstOrDefault(x => x.IsHero);
                if (heroPlayer != null)
                {
                    // Calculate Equity for Hero vs Competing Villains in this side pot
                    var villainCardsList = competingPlayers.Where(x => !x.IsHero).Select(x => x.Cards).ToList();
                    
                    double heroEq = 0;
                    if (villainCardsList.Count == 0)
                    {
                        // Hero vs no one? (Everyone else folded or lower stack?)
                        // If no villains left competing for this pot, Hero wins 100%?
                        // This happens if Hero covers everyone.
                        // But wait, if Hero covers everyone, the excess is returned?
                        // `stepPot` includes Hero's excess?
                        // BetclicParser usually adjusts uncalled bets.
                        // So stepPot should be real pot.
                        heroEq = 1.0;
                    }
                    else
                    {
                        var villainCardsStr = string.Join("|", villainCardsList);
                        var equityResult = _equityCalc.Calculate(heroCards, villainCardsStr, board, 50000);
                        heroEq = equityResult.HeroEquity / 100.0;
                    }
                    
                    totalEv += heroEq * stepPot;
                }
                
                currentLevel = investment;
            }
            
            return Math.Round(totalEv - hand.HeroInvestment, 2);
        }
        catch (Exception e)
        {
            _logger.LogWarning($"Multiway Split Pot EV calculation error: {e.Message}");
            return null;
        }
    }

    private Dictionary<string, double> ParseInvestmentsPerPlayer(ParsedHand hand)
    {
        var actions = new[] { hand.PreflopAction, hand.FlopAction, hand.TurnAction, hand.RiverAction };
        var totalPerPlayer = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        foreach (var streetActions in actions)
        {
            if (string.IsNullOrEmpty(streetActions)) continue;
            var streetInv = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
            var lines = streetActions.Split('\n');
            foreach (var line in lines)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                var m = System.Text.RegularExpressions.Regex.Match(line, "^(?:[0-9:]+\\s*-\\s*)?([^:]+):");
                if (!m.Success) continue;
                var player = m.Groups[1].Value.Trim();
                if (!streetInv.ContainsKey(player)) streetInv[player] = 0;
                var lower = line.ToLower();
                var mm = System.Text.RegularExpressions.Regex.Match(lower, "posts\\s+\\w+\\s+(\\d+)");
                if (mm.Success) { streetInv[player] = double.Parse(mm.Groups[1].Value); goto merge; }
                mm = System.Text.RegularExpressions.Regex.Match(lower, "raises\\s+to\\s+(\\d+)");
                if (mm.Success) { streetInv[player] = double.Parse(mm.Groups[1].Value); goto merge; }
                mm = System.Text.RegularExpressions.Regex.Match(lower, "calls\\s+(\\d+)");
                if (mm.Success) { streetInv[player] += double.Parse(mm.Groups[1].Value); goto merge; }
                mm = System.Text.RegularExpressions.Regex.Match(lower, "bets\\s+(\\d+)");
                if (mm.Success) { streetInv[player] = double.Parse(mm.Groups[1].Value); goto merge; }
                mm = System.Text.RegularExpressions.Regex.Match(lower, "(\\d+)\\s+and\\s+is\\s+all-in");
                if (mm.Success)
                {
                    var amt = double.Parse(mm.Groups[1].Value);
                    if (lower.Contains("raises to")) streetInv[player] = amt;
                    else streetInv[player] += amt;
                }
            merge: ;
            }
            foreach (var kv in streetInv)
            {
                if (!totalPerPlayer.ContainsKey(kv.Key)) totalPerPlayer[kv.Key] = 0;
                totalPerPlayer[kv.Key] += kv.Value;
            }
        }
        return totalPerPlayer;
    }

    private string GetBoardAtAllIn(ParsedHand hand)
    {
        var flop = hand.Flop ?? "";
        var turn = hand.Turn ?? "";
        var street = hand.AllInStreet ?? "";

        if (street.Equals("PREFLOP", StringComparison.OrdinalIgnoreCase) || 
            street.Equals("HOLE_CARDS", StringComparison.OrdinalIgnoreCase))
            return "";

        if (street.Equals("FLOP", StringComparison.OrdinalIgnoreCase))
            return flop.Trim();

        if (street.Equals("TURN", StringComparison.OrdinalIgnoreCase))
            return (flop + " " + turn).Trim();

        // River or unknown -> full board (though river is skipped for EV usually)
        return (flop + " " + turn + " " + (hand.River ?? "")).Trim();
    }

    /// <summary>
    /// Parse hero's actual investment in the pot
    /// This is critical for accurate EV calculation
    /// </summary>
    private double? ParseHeroInvestment(ParsedHand hand)
    {
        try
        {
            var heroName = hand.HeroName;
            if (string.IsNullOrEmpty(heroName)) return null;

            var actions = new[] { hand.PreflopAction, hand.FlopAction, hand.TurnAction, hand.RiverAction };
            double totalInvestment = 0;

            foreach (var streetActions in actions)
            {
                if (string.IsNullOrEmpty(streetActions)) continue;

                double streetInvestment = 0;
                var lines = streetActions.Split('\n');
                
                foreach (var line in lines)
                {
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    if (!line.Contains(heroName, StringComparison.OrdinalIgnoreCase)) continue;

                    var lower = line.ToLower();

                    // Posts blind/ante (sets street investment)
                    var m = System.Text.RegularExpressions.Regex.Match(lower, @"posts\s+\w+\s+(\d+)");
                    if (m.Success)
                    {
                        streetInvestment = double.Parse(m.Groups[1].Value);
                        continue;
                    }

                    // Raises to X (replaces previous street investment)
                    m = System.Text.RegularExpressions.Regex.Match(lower, @"raises\s+to\s+(\d+)");
                    if (m.Success)
                    {
                        streetInvestment = double.Parse(m.Groups[1].Value);
                        continue;
                    }

                    // Calls X (adds to street investment)
                    m = System.Text.RegularExpressions.Regex.Match(lower, @"calls\s+(\d+)");
                    if (m.Success)
                    {
                        streetInvestment += double.Parse(m.Groups[1].Value);
                        continue;
                    }

                    // Bets X (sets street investment)
                    m = System.Text.RegularExpressions.Regex.Match(lower, @"bets\s+(\d+)");
                    if (m.Success)
                    {
                        streetInvestment = double.Parse(m.Groups[1].Value);
                        continue;
                    }

                    // All-in (could be raise or call)
                    m = System.Text.RegularExpressions.Regex.Match(lower, @"(\d+)\s+and\s+is\s+all-in");
                    if (m.Success)
                    {
                        var amt = double.Parse(m.Groups[1].Value);
                        if (lower.Contains("raises to"))
                            streetInvestment = amt;
                        else
                            streetInvestment += amt;
                    }
                }

                totalInvestment += streetInvestment;
            }

            return totalInvestment > 0 ? totalInvestment : null;
        }
        catch (Exception e)
        {
            _logger.LogWarning($"ParseHeroInvestment error: {e.Message}");
            return null;
        }
    }

    private double? ParseEffectiveInvestment(ParsedHand hand)
    {
        try
        {
            var actions = new[] { hand.PreflopAction, hand.FlopAction, hand.TurnAction, hand.RiverAction };
            var totalPerPlayer = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
            var foldedPlayers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var streetActions in actions)
            {
                if (string.IsNullOrEmpty(streetActions)) continue;

                var streetInv = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
                var lines = streetActions.Split('\n');
                foreach (var line in lines)
                {
                    if (string.IsNullOrWhiteSpace(line)) continue;

                    // Extract player name (formats: "12:34 - Name: action" or "Name: action")
                    var m = System.Text.RegularExpressions.Regex.Match(line, "^(?:[0-9:]+\\s*-\\s*)?([^:]+):");
                    if (!m.Success) continue;
                    var player = m.Groups[1].Value.Trim();
                    if (!streetInv.ContainsKey(player)) streetInv[player] = 0;

                    var lower = line.ToLower();
                    if (lower.Contains("folds"))
                    {
                        foldedPlayers.Add(player);
                        continue;
                    }

                    var mm = System.Text.RegularExpressions.Regex.Match(lower, "posts\\s+\\w+\\s+(\\d+)");
                    if (mm.Success)
                    {
                        streetInv[player] = double.Parse(mm.Groups[1].Value);
                        continue;
                    }

                    mm = System.Text.RegularExpressions.Regex.Match(lower, "raises\\s+to\\s+(\\d+)");
                    if (mm.Success)
                    {
                        streetInv[player] = double.Parse(mm.Groups[1].Value);
                        continue;
                    }

                    mm = System.Text.RegularExpressions.Regex.Match(lower, "calls\\s+(\\d+)");
                    if (mm.Success)
                    {
                        streetInv[player] += double.Parse(mm.Groups[1].Value);
                        continue;
                    }

                    mm = System.Text.RegularExpressions.Regex.Match(lower, "bets\\s+(\\d+)");
                    if (mm.Success)
                    {
                        streetInv[player] = double.Parse(mm.Groups[1].Value);
                        continue;
                    }

                    mm = System.Text.RegularExpressions.Regex.Match(lower, "(\\d+)\\s+and\\s+is\\s+all-in");
                    if (mm.Success)
                    {
                        var amt = double.Parse(mm.Groups[1].Value);
                        if (lower.Contains("raises to")) streetInv[player] = amt;
                        else streetInv[player] += amt;
                    }
                }

                // Merge streetInv into totals
                foreach (var kv in streetInv)
                {
                    if (!totalPerPlayer.ContainsKey(kv.Key)) totalPerPlayer[kv.Key] = 0;
                    totalPerPlayer[kv.Key] += kv.Value;
                }
            }

            // Hero name required to compute effective investment
            var heroName = hand.HeroName;
            if (string.IsNullOrEmpty(heroName)) return null;

            var heroInv = totalPerPlayer.GetValueOrDefault(heroName, 0.0);

            var opponentInvs = totalPerPlayer.Where(kv => !kv.Key.Equals(heroName, StringComparison.OrdinalIgnoreCase) && !foldedPlayers.Contains(kv.Key) && kv.Value > 0).Select(kv => kv.Value).ToList();
            if (!opponentInvs.Any()) return heroInv;

            var minOpponent = opponentInvs.Min();
            return Math.Min(heroInv, minOpponent);
        }
        catch (Exception e)
        {
            _logger.LogWarning($"ParseEffectiveInvestment error: {e.Message}");
            return null;
        }
    }
}

public class HandAnalytics
{
    public string? HandId { get; set; }
    public double? EvChips { get; set; }
    public double? NetWonAdjusted { get; set; }
    public double? EquityPreflop { get; set; }
    public double? EquityFlop { get; set; }
    public double? EquityTurn { get; set; }
    public double? EquityRiver { get; set; }
    public double? ChipsWonShowdown { get; set; }
    public double? ChipsWonNoShowdown { get; set; }
    public double? CevContribution { get; set; }
}
