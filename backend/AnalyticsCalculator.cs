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
        var isShowdown = hand.WentToShowdown;

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

            if (isMultiway)
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

            // Use Effective Pot (what Hero is actually eligible for)
            var heroInvestment = ParseHeroInvestment(hand) ?? (totalPot / 2.0);
            var villainCardsSplit = villainCards.Split('|');
            var playersCount = villainCardsSplit.Length + 1;
            
            // For 2-way, the effective pot is simply 2 * min(HeroInv, VillainInv) 
            // plus any "dead money" from folded players.
            // A simpler/robust way: Hero's EV = Equity * TotalPot, 
            // but we must subtract what Hero put PLUS any part of the pot they CANNOT win.
            // Correct formula: EV = (Equity * Hero's Eligible Pot) - Hero Investment
            
            var effectiveInvestment = ParseEffectiveInvestment(hand) ?? heroInvestment;
            // The maximum Hero can win from ONE opponent is their effective investment against that opponent.
            // In 2-way, Eligible Pot = 2 * effectiveInvestment + Dead Money
            // Dead Money = TotalPot - (Sum of all active players' total street investments) 
            // But wait, TotalPot is already the sum. So Eligible Pot = TotalPot - (VillainContribution - HeroContribution) if Villain > Hero.
            
            double eligiblePot = totalPot;
            // If Villain put more than Hero, Hero can't win the excess.
            // If Hero put more than Villain, the excess was an uncalled bet (already handled by parser usually).
            
            var ev = (equity.HeroEquity / 100.0) * eligiblePot - effectiveInvestment;

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
            var villainCardsStr = hand.VillainCards;
            if (string.IsNullOrEmpty(heroCards) || string.IsNullOrEmpty(villainCardsStr))
                return null;

            var board = GetBoardAtAllIn(hand);

            // Let EquityCalculator handle multiway ("|" separated villain hands)
            var equity = _equityCalc.Calculate(heroCards, villainCardsStr, board, 5000);
            var totalEquity = equity.HeroEquity / 100.0;

            var totalPot = hand.TotalPot;
            var heroProfit = hand.HeroProfit;

            if (totalPot == 0)
                return heroProfit;

            var effectiveInvestment = ParseEffectiveInvestment(hand);
            if (!effectiveInvestment.HasValue || effectiveInvestment.Value == 0)
            {
                // Fallback: use pot / num_players
                var playersCount = (villainCardsStr?.Split('|').Count(s => !string.IsNullOrEmpty(s)) ?? 1) + 1;
                effectiveInvestment = totalPot / playersCount;
            }

            // Calculate precise Heroable Pot using villain stacks
            // In Spin & Rush (Betclic), stacks in PLAYERS are starting stacks for the hand.
            // Effective Pot = HeroInvestment + Sum(min(HeroInvestment, VillainStack))
            double effectivePot = effectiveInvestment.Value;
            foreach (var vStack in hand.VillainStacks.Values)
            {
                effectivePot += Math.Min(effectiveInvestment.Value, vStack);
            }
            
            // Limit to actual totalPot (in case of dead money or multiway complexities)
            double actualCappedPot = Math.Min(totalPot, effectivePot);

            var evValue = (totalEquity * actualCappedPot) - effectiveInvestment.Value;
            return Math.Round(evValue, 2);
        }
        catch (Exception e)
        {
            _logger.LogWarning($"Multiway EV calculation error: {e.Message}");
            return null;
        }
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