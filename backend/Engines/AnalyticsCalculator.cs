using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using SpinTrackerBackend.Interfaces;
using SpinTrackerBackend;

namespace SpinTrackerBackend.Engines;

public class AnalyticsCalculator : IAnalyticsCalculator
{
    private readonly IEquityCalculator _equityCalc;
    private readonly ILogger<AnalyticsCalculator> _logger;

    private static readonly System.Text.RegularExpressions.Regex PlayerActionRegex = 
        new(@"^(?:[0-9:]+\s*-\s*)?([^:]+):", System.Text.RegularExpressions.RegexOptions.Compiled);
    
    private static readonly System.Text.RegularExpressions.Regex PostsRegex = 
        new(@"posts\s+\w+\s+(\d+)", System.Text.RegularExpressions.RegexOptions.Compiled | System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    
    private static readonly System.Text.RegularExpressions.Regex RaisesToRegex = 
        new(@"raises\s+to\s+(\d+)", System.Text.RegularExpressions.RegexOptions.Compiled | System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    
    private static readonly System.Text.RegularExpressions.Regex CallsRegex = 
        new(@"calls\s+(\d+)", System.Text.RegularExpressions.RegexOptions.Compiled | System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    
    private static readonly System.Text.RegularExpressions.Regex BetsRegex = 
        new(@"bets\s+(\d+)", System.Text.RegularExpressions.RegexOptions.Compiled | System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    
    private static readonly System.Text.RegularExpressions.Regex AllInRegex = 
        new(@"(\d+)\s+and\s+is\s+all-in", System.Text.RegularExpressions.RegexOptions.Compiled | System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    
    private static readonly ConcurrentDictionary<string, EquityResult> EquityCache = new();
    private const int MaxEquityCacheSize = 50000;
    private static long _cacheHits = 0;
    private static long _cacheMisses = 0;

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private static bool IsNullOrEmptyFast(string? s) => string.IsNullOrEmpty(s);

    public AnalyticsCalculator(IEquityCalculator equityCalc, ILogger<AnalyticsCalculator> logger)
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

        var hero = hand.Players.FirstOrDefault(p => p.IsHero);
        if (hero == null) return analytics;

        analytics.PlayerName = hero.Name;
        var heroProfit = hero.NetProfit;
        var isShowdown = hero.WentToShowdown;

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

        var heroAllIn = hero.IsAllIn;
        bool villainAllIn = false;
        bool hasVillainCards = false;
        int playerCountWithCards = 0;
        bool anyAllIn = heroAllIn;

        foreach (var p in hand.Players)
        {
            if (!p.IsHero)
            {
                if (p.IsAllIn) villainAllIn = true;
                if (!IsNullOrEmptyFast(p.Cards))
                {
                    hasVillainCards = true;
                    playerCountWithCards++;
                }
            }
            if (p.IsAllIn) anyAllIn = true;
        }

        var heroCards = hero.Cards;

        var isRiverAllIn = IsRiverAllIn(hand);

        var shouldCalculateEv = isShowdown && anyAllIn && hasVillainCards && !isRiverAllIn;

        // Enable EV calculation for preflop all-in - exact enumeration is now fast with caching + parallel

        if (shouldCalculateEv)
        {
            double? evChips;

            // If there is post-all-in action (side pots developing on later streets), 
            // PT4 usually falls back to Profit (skips EV). We mimic this.
            if (HasSideAction(hand))
            {
                evChips = null;
            }
            else
            {
                // Use Multiway logic for everything as it handles side pots and dead money correctly
                bool forceProfit = false;
                try
                {
                    evChips = CalculateMultiwayEv(hand);
                }
                catch (VoluntaryFoldException)
                {
                    evChips = null;
                    forceProfit = true;
                }

                // Fallback to legacy simplistic calculation ONLY if Multiway failed (e.g. parser didn't populate Players)
                // AND we are not forcing profit
                if (!evChips.HasValue && !forceProfit)
                {
                    evChips = CalculateAllInEv(hand);
                }
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

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private bool IsRiverAllIn(ParsedHand hand)
    {
        var allInStreet = hand.AllInStreet;
        return !IsNullOrEmptyFast(allInStreet) && 
               allInStreet.Equals("RIVER", StringComparison.OrdinalIgnoreCase);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private bool HasSideAction(ParsedHand hand)
    {
        var allInStreet = hand.AllInStreet;
        if (IsNullOrEmptyFast(allInStreet)) return false;

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

    private bool HasVoluntaryAction(string playerName, ParsedHand hand)
    {
        try
        {
            var actions = new[] { hand.PreflopAction, hand.FlopAction, hand.TurnAction, hand.RiverAction };
            foreach (var streetActions in actions)
            {
                if (string.IsNullOrEmpty(streetActions)) continue;
                var lines = streetActions.Split('\n');
                foreach (var line in lines)
                {
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    var m = PlayerActionRegex.Match(line);
                    if (!m.Success) continue;
                    var p = m.Groups[1].Value.Trim();
                    if (!p.Equals(playerName, StringComparison.OrdinalIgnoreCase)) continue;

                    var lower = line.ToLower();
                    if (lower.Contains("calls") || lower.Contains("bets") || lower.Contains("raises"))
                        return true;
                }
            }
            return false;
        }
        catch
        {
            return false;
        }
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private bool HasPlayerAction(string? actionText)
    {
        if (IsNullOrEmptyFast(actionText)) return false;
        var span = actionText.AsSpan();
        return span.Contains("bets", System.StringComparison.OrdinalIgnoreCase) ||
               span.Contains("calls", System.StringComparison.OrdinalIgnoreCase) ||
               span.Contains("raises", System.StringComparison.OrdinalIgnoreCase) ||
               span.Contains("checks", System.StringComparison.OrdinalIgnoreCase);
    }

    private double? CalculateAllInEv(ParsedHand hand)
    {
        try
        {
            var hero = hand.Players.FirstOrDefault(p => p.IsHero);
            if (hero == null) return null;

            var heroCards = hero.Cards;
            if (IsNullOrEmptyFast(heroCards)) return null;

            var villainCardsBuilder = new System.Text.StringBuilder();
            bool first = true;
            bool hasVillain = false;
            foreach (var p in hand.Players)
            {
                if (!p.IsHero && !IsNullOrEmptyFast(p.Cards))
                {
                    if (!first) villainCardsBuilder.Append('|');
                    villainCardsBuilder.Append(p.Cards);
                    first = false;
                    hasVillain = true;
                }
            }
            if (!hasVillain) return null;

            var villainCards = villainCardsBuilder.ToString();
            var board = GetBoardAtAllIn(hand);

            var equity = GetCachedEquity(heroCards, villainCards, board);
            var totalPot = hand.TotalPot;

            var heroInvestment = hero.Investment > 0 ? hero.Investment : (ParseHeroInvestment(hand) ?? (totalPot / 2.0));
            var ev = (equity.HeroEquity / 100.0) * totalPot - heroInvestment;

            return ev;
        }
        catch (Exception e)
        {
            _logger.LogError($"EV calculation CRITICAL error: {e.Message}");
            return null;
        }
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private EquityResult GetCachedEquity(string heroCards, string villainCards, string board, string? deadCards = null)
    {
        var cacheKey = deadCards != null
            ? $"{heroCards}|{villainCards}|{board}|{deadCards}"
            : $"{heroCards}|{villainCards}|{board}|";

        if (EquityCache.TryGetValue(cacheKey, out var cached))
        {
            System.Threading.Interlocked.Increment(ref _cacheHits);
            return cached;
        }

        System.Threading.Interlocked.Increment(ref _cacheMisses);

        var result = _equityCalc.Calculate(heroCards, villainCards, board, deadCards);

        if (EquityCache.Count >= MaxEquityCacheSize)
        {
            var keysToRemove = EquityCache.Keys.Take(MaxEquityCacheSize / 2).ToList();
            foreach (var key in keysToRemove)
                EquityCache.TryRemove(key, out _);
        }

        EquityCache.TryAdd(cacheKey, result);

        return result;
    }
    
    private double? CalculateMultiwayEv(ParsedHand hand)
    {
        try
        {
            var hero = hand.Players.FirstOrDefault(p => p.IsHero);
            if (hero == null) return null;

            var heroCards = hero.Cards;
            if (string.IsNullOrEmpty(heroCards)) return null;

            // Filter players who have cards (Hero + Villains with known cards)
            // We assume players with known cards are the ones competing for EV (went to showdown or all-in revealed)
            var activePlayers = new List<PlayerInfo>(hand.Players.Count);
            foreach (var p in hand.Players)
                if (!string.IsNullOrEmpty(p.Cards) && !p.Folded) activePlayers.Add(p);
            
            // If we don't have players info (old parser?), fallback to legacy
            if (activePlayers.Count == 0)
            {
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
            double contestedInvestment = 0;
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
                    var villainCardsList = new List<string>(competingPlayers.Count);
                    foreach (var x in competingPlayers)
                        if (!x.IsHero) villainCardsList.Add(x.Cards);
                    
                    if (villainCardsList.Count == 0)
                    {
                        // Uncontested side pot (everyone else folded or lower stack).
                        // PT4 seems to exclude this from EV calculation entirely.
                        // So we do NOT add to totalEv, and we do NOT track the investment for this part.

                        // Check if any folded player contributed voluntarily to this pot.
                        foreach (var player in hand.Players)
                        {
                            if (player.Investment > currentLevel)
                            {
                                if (player.IsHero) continue;
                                
                                bool hasVol = HasVoluntaryAction(player.Name, hand);

                                if (hasVol)
                                {
                                    throw new VoluntaryFoldException();
                                }
                            }
                        }
                    }
                    else
                    {
                        var villainCardsStr = string.Join("|", villainCardsList);
                        
                        // Identify dead cards (players with known cards who are NOT competing in this pot slice)
                        // e.g. players who are All-In for less
                        var deadCardsList = hand.Players
                            .Where(p => !string.IsNullOrEmpty(p.Cards) && !p.IsHero && !competingPlayers.Contains(p))
                            .Select(p => p.Cards);
                        
                        var deadCardsStr = string.Join(" ", deadCardsList);

                        var equityResult = GetCachedEquity(heroCards, villainCardsStr, board, deadCardsStr);
                        double heroEq = equityResult.HeroEquity / 100.0;
                        
                        totalEv += heroEq * stepPot;
                        
                        // Track Hero's investment that was used for this contested pot
                        // Hero contributed 'step' to this pot
                        contestedInvestment += step;
                    }
                }
                
                currentLevel = investment;
            }
            
            return Math.Round(totalEv - contestedInvestment, 2);
        }
        catch (VoluntaryFoldException)
        {
            throw;
        }
        catch (Exception e)
        {
            _logger.LogWarning($"Multiway Split Pot EV calculation error: {e.Message}");
            return null;
        }
    }
    
    public static void ClearEquityCache()
    {
        EquityCache.Clear();
        System.Threading.Interlocked.Exchange(ref _cacheHits, 0);
        System.Threading.Interlocked.Exchange(ref _cacheMisses, 0);
    }
    
    public static (long hits, long misses, int size) GetEquityCacheStats()
    {
        return (_cacheHits, _cacheMisses, EquityCache.Count);
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
                var m = PlayerActionRegex.Match(line);
                if (!m.Success) continue;
                var player = m.Groups[1].Value.Trim();
                if (!streetInv.ContainsKey(player)) streetInv[player] = 0;
                
                var mm = PostsRegex.Match(line);
                if (mm.Success) { streetInv[player] = double.Parse(mm.Groups[1].Value); continue; }
                
                mm = RaisesToRegex.Match(line);
                if (mm.Success) { streetInv[player] = double.Parse(mm.Groups[1].Value); continue; }
                
                mm = CallsRegex.Match(line);
                if (mm.Success) { streetInv[player] += double.Parse(mm.Groups[1].Value); continue; }
                
                mm = BetsRegex.Match(line);
                if (mm.Success) { streetInv[player] = double.Parse(mm.Groups[1].Value); continue; }
                
                mm = AllInRegex.Match(line);
                if (mm.Success)
                {
                    var amt = double.Parse(mm.Groups[1].Value);
                    if (line.Contains("raises to", StringComparison.OrdinalIgnoreCase)) streetInv[player] = amt;
                    else streetInv[player] += amt;
                }
            }
            foreach (var kv in streetInv)
            {
                if (!totalPerPlayer.ContainsKey(kv.Key)) totalPerPlayer[kv.Key] = 0;
                totalPerPlayer[kv.Key] += kv.Value;
            }
        }
        return totalPerPlayer;
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
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
            var hero = hand.Players.FirstOrDefault(p => p.IsHero);
            if (hero == null) return null;
            var heroName = hero.Name;

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

                    // Posts blind/ante (sets street investment)
                    var m = PostsRegex.Match(line);
                    if (m.Success)
                    {
                        streetInvestment = double.Parse(m.Groups[1].Value);
                        continue;
                    }

                    // Raises to X (replaces previous street investment)
                    m = RaisesToRegex.Match(line);
                    if (m.Success)
                    {
                        streetInvestment = double.Parse(m.Groups[1].Value);
                        continue;
                    }

                    // Calls X (adds to street investment)
                    m = CallsRegex.Match(line);
                    if (m.Success)
                    {
                        streetInvestment += double.Parse(m.Groups[1].Value);
                        continue;
                    }

                    // Bets X (sets street investment)
                    m = BetsRegex.Match(line);
                    if (m.Success)
                    {
                        streetInvestment = double.Parse(m.Groups[1].Value);
                        continue;
                    }

                    // All-in (could be raise or call)
                    m = AllInRegex.Match(line);
                    if (m.Success)
                    {
                        var amt = double.Parse(m.Groups[1].Value);
                        if (line.Contains("raises to", StringComparison.OrdinalIgnoreCase))
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
                    var m = PlayerActionRegex.Match(line);
                    if (!m.Success) continue;
                    var player = m.Groups[1].Value.Trim();
                    if (!streetInv.ContainsKey(player)) streetInv[player] = 0;

                    if (line.Contains("folds", StringComparison.OrdinalIgnoreCase))
                    {
                        foldedPlayers.Add(player);
                        continue;
                    }

                    var mm = PostsRegex.Match(line);
                    if (mm.Success)
                    {
                        streetInv[player] = double.Parse(mm.Groups[1].Value);
                        continue;
                    }

                    mm = RaisesToRegex.Match(line);
                    if (mm.Success)
                    {
                        streetInv[player] = double.Parse(mm.Groups[1].Value);
                        continue;
                    }

                    mm = CallsRegex.Match(line);
                    if (mm.Success)
                    {
                        streetInv[player] += double.Parse(mm.Groups[1].Value);
                        continue;
                    }

                    mm = BetsRegex.Match(line);
                    if (mm.Success)
                    {
                        streetInv[player] = double.Parse(mm.Groups[1].Value);
                        continue;
                    }

                    mm = AllInRegex.Match(line);
                    if (mm.Success)
                    {
                        var amt = double.Parse(mm.Groups[1].Value);
                        if (line.Contains("raises to", StringComparison.OrdinalIgnoreCase)) streetInv[player] = amt;
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
            var hero = hand.Players.FirstOrDefault(p => p.IsHero);
            if (hero == null) return null;
            var heroName = hero.Name;

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
