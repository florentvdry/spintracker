using SpinTrackerBackend.Interfaces;
using SpinTrackerBackend;

namespace SpinTrackerBackend.Engines;

public class EquityCalculator : IEquityCalculator
{
    private readonly ILogger<EquityCalculator> _logger;

    // Thread-safe cache for preflop results
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, EquityResult> _preflopCache 
        = new System.Collections.Concurrent.ConcurrentDictionary<string, EquityResult>();

    public EquityCalculator(ILogger<EquityCalculator> logger)
    {
        _logger = logger;
    }

    public EquityResult Calculate(string heroCards, string villainCards, string board, int iterations, string? deadCards = null)
    {
        try
        {
            var heroCardList = ParseCards(heroCards);
            var boardCards = ParseCards(board);
            var deadCardList = ParseCards(deadCards ?? "");

            // Support multiway villain hands separated by '|'
            if (!string.IsNullOrWhiteSpace(villainCards) && villainCards.Contains('|'))
            {
                // Parse multiple villain hands
                var villainHands = villainCards.Split('|').Select(s => ParseCards(s)).Where(l => l.Count == 2).ToList();
                if (villainHands.Count == 0)
                    throw new ArgumentException("Invalid villain hands provided for multiway calculation");

                // Use exact enumeration for postflop multiway when feasible
                var cardsNeededMulti = 5 - boardCards.Count;
                if (cardsNeededMulti <= 5)
                {
                    return RunExactEnumerationMultiway(heroCardList, villainHands, boardCards, deadCardList);
                }

                // Otherwise fall back to Monte Carlo
                return RunMonteCarloMultiway(heroCardList, villainHands, boardCards, iterations, deadCardList);
            }

            var villainCardList = ParseCards(villainCards);
            if (heroCardList.Count != 2 || villainCardList.Count != 2)
            {
                throw new ArgumentException("Hero and villain must have exactly 2 cards");
            }

            // Use exact enumeration for postflop (flop/turn/river) when feasible,
            // fallback to Monte Carlo when too many unknown cards remain.
            var cardsNeeded = 5 - boardCards.Count;
            
            // Use exact enumeration with parallel processing for preflop (fast + accurate)
            if (cardsNeeded == 5)
            {
                // CACHE CHECK FOR PREFLOP
                if (deadCardList == null || deadCardList.Count == 0)
                {
                    var cacheKey = GetCacheKey(heroCardList, villainCardList);
                    if (_preflopCache.TryGetValue(cacheKey, out var cached))
                    {
                        return cached;
                    }

                    // Use exact enumeration with PLINQ for exact results (parallelized)
                    var result = RunExactEnumerationParallel(heroCardList, villainCardList, boardCards, deadCardList);
                    _preflopCache[cacheKey] = result;
                    return result;
                }

                // With dead cards, use exact enumeration with PLINQ
                return RunExactEnumerationParallel(heroCardList, villainCardList, boardCards, deadCardList);
            }

            // Use fast exact enumeration for postflop (flop/turn/river) - these are fast
            if (cardsNeeded > 0 && cardsNeeded < 5) 
            {
                return RunExactEnumerationFast(heroCardList, villainCardList, boardCards, deadCardList);
            }

            // Monte Carlo simulation for cases with >2 unknown cards (if we ever support that?)
            // Or fallback if something goes wrong.
            return RunMonteCarlo(heroCardList, villainCardList, boardCards, iterations, deadCardList);
        }
        catch (Exception e)
        {
            _logger.LogError($"Equity calculation error: {e.Message}");
            throw;
        }
    }

    private string GetCacheKey(List<Card> hero, List<Card> villain)
    {
        // Normalize cards within hand for consistent key
        // We use the string representation for simplicity
        var h = hero.OrderBy(c => c.Rank).ThenBy(c => c.Suit).Select(c => c.ToString());
        var v = villain.OrderBy(c => c.Rank).ThenBy(c => c.Suit).Select(c => c.ToString());
        return $"{string.Join("", h)}|{string.Join("", v)}";
    }

    private EquityResult RunExactEnumerationFast(List<Card> heroCards, List<Card> villainCards, List<Card> boardCards, List<Card>? deadCards = null)
    {
        // Convert to ints
        int hc1 = GetCardInt(heroCards[0]);
        int hc2 = GetCardInt(heroCards[1]);
        int vc1 = GetCardInt(villainCards[0]);
        int vc2 = GetCardInt(villainCards[1]);
        
        int b1 = -1, b2 = -1, b3 = -1, b4 = -1, b5 = -1;
        int boardCount = boardCards.Count;
        if (boardCount >= 1) b1 = GetCardInt(boardCards[0]);
        if (boardCount >= 2) b2 = GetCardInt(boardCards[1]);
        if (boardCount >= 3) b3 = GetCardInt(boardCards[2]);
        if (boardCount >= 4) b4 = GetCardInt(boardCards[3]);
        if (boardCount >= 5) b5 = GetCardInt(boardCards[4]); 

        var usedMask = (1UL << hc1) | (1UL << hc2) | (1UL << vc1) | (1UL << vc2);
        if (b1 != -1) usedMask |= (1UL << b1);
        if (b2 != -1) usedMask |= (1UL << b2);
        if (b3 != -1) usedMask |= (1UL << b3);
        if (b4 != -1) usedMask |= (1UL << b4);
        if (b5 != -1) usedMask |= (1UL << b5);

        if (deadCards != null)
        {
            foreach (var c in deadCards) usedMask |= (1UL << GetCardInt(c));
        }

        // Pre-calculate available cards
        // Using an array for fast iteration
        int[] available = new int[52];
        int availCount = 0;
        for (int i = 0; i < 52; i++)
        {
            if ((usedMask & (1UL << i)) == 0)
            {
                available[availCount++] = i;
            }
        }

        long heroWins = 0;
        long villainWins = 0;
        long ties = 0;

        int cardsNeeded = 5 - boardCount;
        
        // Unrolled loops for performance
        if (cardsNeeded == 5) // Preflop
        {
            for (int i1 = 0; i1 < availCount - 4; i1++)
            {
                int c1 = available[i1];
                for (int i2 = i1 + 1; i2 < availCount - 3; i2++)
                {
                    int c2 = available[i2];
                    for (int i3 = i2 + 1; i3 < availCount - 2; i3++)
                    {
                        int c3 = available[i3];
                        for (int i4 = i3 + 1; i4 < availCount - 1; i4++)
                        {
                            int c4 = available[i4];
                            for (int i5 = i4 + 1; i5 < availCount; i5++)
                            {
                                int c5 = available[i5];
                                
                                int hScore = Evaluate7(hc1, hc2, c1, c2, c3, c4, c5);
                                int vScore = Evaluate7(vc1, vc2, c1, c2, c3, c4, c5);
                                
                                if (hScore > vScore) heroWins++;
                                else if (vScore > hScore) villainWins++;
                                else ties++;
                            }
                        }
                    }
                }
            }
        }
        else if (cardsNeeded == 2) // Flop
        {
             for (int i1 = 0; i1 < availCount - 1; i1++)
            {
                int c1 = available[i1];
                for (int i2 = i1 + 1; i2 < availCount; i2++)
                {
                    int c2 = available[i2];
                    
                    int hScore = Evaluate7(hc1, hc2, b1, b2, b3, c1, c2);
                    int vScore = Evaluate7(vc1, vc2, b1, b2, b3, c1, c2);
                    
                    if (hScore > vScore) heroWins++;
                    else if (vScore > hScore) villainWins++;
                    else ties++;
                }
            }
        }
        else if (cardsNeeded == 1) // Turn
        {
             for (int i1 = 0; i1 < availCount; i1++)
            {
                int c1 = available[i1];
                
                int hScore = Evaluate7(hc1, hc2, b1, b2, b3, b4, c1);
                int vScore = Evaluate7(vc1, vc2, b1, b2, b3, b4, c1);
                
                if (hScore > vScore) heroWins++;
                else if (vScore > hScore) villainWins++;
                else ties++;
            }
        }
        else if (cardsNeeded == 0) // River
        {
            int hScore = Evaluate7(hc1, hc2, b1, b2, b3, b4, b5);
            int vScore = Evaluate7(vc1, vc2, b1, b2, b3, b4, b5);
            if (hScore > vScore) heroWins++;
            else if (vScore > hScore) villainWins++;
            else ties++;
        }
        else
        {
            // Generic fallback using slow method if weird case
            return RunExactEnumerationFast(heroCards, villainCards, boardCards, null);
        }

        var total = (double)(heroWins + villainWins + ties);
        return new EquityResult
        {
            HeroEquity = ((heroWins + (ties * 0.5)) / total) * 100.0,
            VillainEquity = ((villainWins + (ties * 0.5)) / total) * 100.0,
            TieEquity = (ties / total) * 100.0
        };
    }

    // Fast Evaluator Implementation using Bitmasks and no allocations
    // Card int representation: 0-51. Rank 0=2, 12=A. Suit 0-3.
    // Card = Rank * 4 + Suit

    private static int GetCardInt(Card c)
    {
        int rank = c.Rank switch
        {
            '2' => 0, '3' => 1, '4' => 2, '5' => 3, '6' => 4, '7' => 5, '8' => 6, '9' => 7,
            'T' => 8, 'J' => 9, 'Q' => 10, 'K' => 11, 'A' => 12,
            _ => 0
        };
        int suit = c.Suit switch { 'h' => 0, 'd' => 1, 'c' => 2, 's' => 3, _ => 0 };
        return rank * 4 + suit;
    }

    private static int Evaluate7(int c1, int c2, int c3, int c4, int c5, int c6, int c7)
    {
        // Extract ranks and suits
        int r1 = c1 >> 2; int s1 = c1 & 3;
        int r2 = c2 >> 2; int s2 = c2 & 3;
        int r3 = c3 >> 2; int s3 = c3 & 3;
        int r4 = c4 >> 2; int s4 = c4 & 3;
        int r5 = c5 >> 2; int s5 = c5 & 3;
        int r6 = c6 >> 2; int s6 = c6 & 3;
        int r7 = c7 >> 2; int s7 = c7 & 3;

        // Check Flush
        int sc0 = 0, sc1 = 0, sc2 = 0, sc3 = 0;
        if (s1 == 0) sc0++; else if (s1 == 1) sc1++; else if (s1 == 2) sc2++; else sc3++;
        if (s2 == 0) sc0++; else if (s2 == 1) sc1++; else if (s2 == 2) sc2++; else sc3++;
        if (s3 == 0) sc0++; else if (s3 == 1) sc1++; else if (s3 == 2) sc2++; else sc3++;
        if (s4 == 0) sc0++; else if (s4 == 1) sc1++; else if (s4 == 2) sc2++; else sc3++;
        if (s5 == 0) sc0++; else if (s5 == 1) sc1++; else if (s5 == 2) sc2++; else sc3++;
        if (s6 == 0) sc0++; else if (s6 == 1) sc1++; else if (s6 == 2) sc2++; else sc3++;
        if (s7 == 0) sc0++; else if (s7 == 1) sc1++; else if (s7 == 2) sc2++; else sc3++;

        int flushSuit = -1;
        if (sc0 >= 5) flushSuit = 0;
        else if (sc1 >= 5) flushSuit = 1;
        else if (sc2 >= 5) flushSuit = 2;
        else if (sc3 >= 5) flushSuit = 3;

        if (flushSuit != -1)
        {
            // Collect flush cards ranks
            int mask = 0;
            if (s1 == flushSuit) mask |= (1 << r1);
            if (s2 == flushSuit) mask |= (1 << r2);
            if (s3 == flushSuit) mask |= (1 << r3);
            if (s4 == flushSuit) mask |= (1 << r4);
            if (s5 == flushSuit) mask |= (1 << r5);
            if (s6 == flushSuit) mask |= (1 << r6);
            if (s7 == flushSuit) mask |= (1 << r7);

            // Check Straight Flush
            int sfScore = GetStraightHighCardFromMask(mask);
            if (sfScore > 0) return 8000000 + sfScore;

            // Flush score
            return 5000000 + GetHighCardScoreFromMask(mask);
        }

        // Rank Counts & Bitmask
        int rankMask = (1 << r1) | (1 << r2) | (1 << r3) | (1 << r4) | (1 << r5) | (1 << r6) | (1 << r7);
        
        // Count ranks manually
        int[] counts = new int[13];
        counts[r1]++; counts[r2]++; counts[r3]++; counts[r4]++; counts[r5]++; counts[r6]++; counts[r7]++;
        
        int quads = -1, trips = -1, pairs1 = -1, pairs2 = -1;
        
        for (int i = 12; i >= 0; i--)
        {
            int c = counts[i];
            if (c == 4) quads = i;
            else if (c == 3) 
            {
                if (trips == -1) trips = i;
                else if (pairs1 == -1) pairs1 = i; // Second trips counts as pair for FH
            }
            else if (c == 2)
            {
                if (pairs1 == -1) pairs1 = i;
                else if (pairs2 == -1) pairs2 = i;
            }
        }

        if (quads != -1)
        {
            // 4 of a kind. Kicker is highest other card.
            int kicker = 0;
            for (int i = 12; i >= 0; i--) if (i != quads && counts[i] > 0) { kicker = i; break; }
            return 7000000 + quads * 15 + kicker;
        }

        if (trips != -1 && (pairs1 != -1 || pairs2 != -1))
        {
            // Full House. Trips + Pair.
            int pair = pairs1; // pairs1 is highest pair or second trips
            return 6000000 + trips * 15 + pair;
        }

        // Straight
        int stScore = GetStraightHighCardFromMask(rankMask);
        if (stScore > 0) return 4000000 + stScore;

        if (trips != -1)
        {
            // Three of a kind
            // Get 2 kickers
            int k1 = -1, k2 = -1;
            for (int i = 12; i >= 0; i--)
            {
                if (i != trips && counts[i] > 0)
                {
                    if (k1 == -1) k1 = i;
                    else if (k2 == -1) { k2 = i; break; }
                }
            }
            return 3000000 + trips * 225 + k1 * 15 + k2;
        }

        if (pairs1 != -1 && pairs2 != -1)
        {
            // Two Pair
            // Kicker
            int kicker = 0;
            for (int i = 12; i >= 0; i--) if (i != pairs1 && i != pairs2 && counts[i] > 0) { kicker = i; break; }
            return 2000000 + pairs1 * 225 + pairs2 * 15 + kicker;
        }

        if (pairs1 != -1)
        {
            // One Pair
            int k1 = -1, k2 = -1, k3 = -1;
            for (int i = 12; i >= 0; i--)
            {
                if (i != pairs1 && counts[i] > 0)
                {
                    if (k1 == -1) k1 = i;
                    else if (k2 == -1) k2 = i;
                    else if (k3 == -1) { k3 = i; break; }
                }
            }
            return 1000000 + pairs1 * 3375 + k1 * 225 + k2 * 15 + k3;
        }

        // High Card
        return GetHighCardScoreFromMask(rankMask);
    }

    private static int GetStraightHighCardFromMask(int mask)
    {
        // Check for 5 consecutive bits (ranks 0..12)
        // A(12) ... 2(0)
        
        // AKQJT: 1111100000000 -> 0x1F00
        if ((mask & 0x1F00) == 0x1F00) return 14; // A high
        if ((mask & 0x0F80) == 0x0F80) return 13; // K high
        if ((mask & 0x07C0) == 0x07C0) return 12; // Q high
        if ((mask & 0x03E0) == 0x03E0) return 11; // J high
        if ((mask & 0x01F0) == 0x01F0) return 10; // T high
        if ((mask & 0x00F8) == 0x00F8) return 9;  // 9 high
        if ((mask & 0x007C) == 0x007C) return 8;  // 8 high
        if ((mask & 0x003E) == 0x003E) return 7;  // 7 high
        if ((mask & 0x001F) == 0x001F) return 6;  // 6 high
        
        // Wheel: A,2,3,4,5 -> Bits 12, 0, 1, 2, 3 -> 0x100F
        if ((mask & 0x100F) == 0x100F) return 5;  // 5 high
        
        return 0;
    }

    private static int GetHighCardScoreFromMask(int mask)
    {
        int score = 0;
        int mult = 1;
        
        // Iterate rank 0..12, we want top 5
        // We iterate 12 down to 0
        
        // We need to process lowest of top 5 first for the multiplier logic:
        // score += rank * 1
        // score += next_rank * 15
        // ...
        // So we collect top 5, then iterate reverse
        
        // Optimized collection:
        int c1 = -1, c2 = -1, c3 = -1, c4 = -1, c5 = -1;
        
        for (int i = 12; i >= 0; i--)
        {
            if ((mask & (1 << i)) != 0)
            {
                int val = i + 2; // Rank Value
                if (c1 == -1) c1 = val;
                else if (c2 == -1) c2 = val;
                else if (c3 == -1) c3 = val;
                else if (c4 == -1) c4 = val;
                else if (c5 == -1) { c5 = val; break; }
            }
        }
        
        // Calculate: lowest * 1 + ...
        if (c5 != -1) { score += c5 * mult; mult *= 15; }
        if (c4 != -1) { score += c4 * mult; mult *= 15; }
        if (c3 != -1) { score += c3 * mult; mult *= 15; }
        if (c2 != -1) { score += c2 * mult; mult *= 15; }
        if (c1 != -1) { score += c1 * mult; mult *= 15; }
        
        return score;
    }

    // Keep old RunMonteCarlo for Multiway and Fallback (updated to use fast evaluate?)
    // To avoid rewriting huge logic, I will keep old EvaluateHand for MC or update MC to use Fast.
    // Let's update MC to use Fast Evaluator for consistency.
    
    private EquityResult RunExactEnumerationParallel(List<Card> heroCards, List<Card> villainCards, List<Card> boardCards, List<Card>? deadCards = null)
    {
        // Convert to ints
        int hc1 = GetCardInt(heroCards[0]);
        int hc2 = GetCardInt(heroCards[1]);
        int vc1 = GetCardInt(villainCards[0]);
        int vc2 = GetCardInt(villainCards[1]);

        var usedMask = (1UL << hc1) | (1UL << hc2) | (1UL << vc1) | (1UL << vc2);
        if (deadCards != null)
        {
            foreach (var c in deadCards) usedMask |= (1UL << GetCardInt(c));
        }

        // Pre-calculate available cards
        int[] available = new int[52];
        int availCount = 0;
        for (int i = 0; i < 52; i++)
        {
            if ((usedMask & (1UL << i)) == 0)
            {
                available[availCount++] = i;
            }
        }

        // Generate all 5-card combinations as indices into available[]
        var combinations = new List<(int, int, int, int, int)>();
        for (int i1 = 0; i1 < availCount - 4; i1++)
        {
            for (int i2 = i1 + 1; i2 < availCount - 3; i2++)
            {
                for (int i3 = i2 + 1; i3 < availCount - 2; i3++)
                {
                    for (int i4 = i3 + 1; i4 < availCount - 1; i4++)
                    {
                        for (int i5 = i4 + 1; i5 < availCount; i5++)
                        {
                            combinations.Add((available[i1], available[i2], available[i3], available[i4], available[i5]));
                        }
                    }
                }
            }
        }

        // Parallel enumeration using PLINQ
        var results = combinations.AsParallel()
            .Select(c => {
                int c1 = c.Item1, c2 = c.Item2, c3 = c.Item3, c4 = c.Item4, c5 = c.Item5;
                int hScore = Evaluate7(hc1, hc2, c1, c2, c3, c4, c5);
                int vScore = Evaluate7(vc1, vc2, c1, c2, c3, c4, c5);
                if (hScore > vScore) return (1, 0, 0);
                if (vScore > hScore) return (0, 1, 0);
                return (0, 0, 1);
            })
            .ToList();

        long heroWins = results.Sum(r => r.Item1);
        long villainWins = results.Sum(r => r.Item2);
        long ties = results.Sum(r => r.Item3);

        var total = (double)(heroWins + villainWins + ties);
        return new EquityResult
        {
            HeroEquity = ((heroWins + (ties * 0.5)) / total) * 100.0,
            VillainEquity = ((villainWins + (ties * 0.5)) / total) * 100.0,
            TieEquity = (ties / total) * 100.0
        };
    }

    private EquityResult RunMonteCarlo(List<Card> heroCards, List<Card> villainCards, List<Card> boardCards, int iterations, List<Card>? deadCards = null)
    {
        var deck = CreateDeck();
        var usedCards = new HashSet<Card>(heroCards);
        usedCards.UnionWith(villainCards);
        usedCards.UnionWith(boardCards);
        if (deadCards != null) usedCards.UnionWith(deadCards);

        var availableCards = deck.Where(c => !usedCards.Contains(c)).ToList();
        
        // Convert to ints for fast eval
        int hc1 = GetCardInt(heroCards[0]);
        int hc2 = GetCardInt(heroCards[1]);
        int vc1 = GetCardInt(villainCards[0]);
        int vc2 = GetCardInt(villainCards[1]);
        
        var boardInts = boardCards.Select(GetCardInt).ToList();
        var availInts = availableCards.Select(GetCardInt).ToList();

        var heroWins = 0;
        var villainWins = 0;
        var ties = 0;

        var cardsNeeded = 5 - boardCards.Count;

        for (var i = 0; i < iterations; i++)
        {
            // Shuffle available (Fisher-Yates for first N items)
            // Or just random pick
            // Fast shuffle
            for (int k = 0; k < cardsNeeded; k++)
            {
                int r = Random.Shared.Next(k, availInts.Count);
                (availInts[k], availInts[r]) = (availInts[r], availInts[k]);
            }
            
            // Build hand
            // Board + Randoms
            // We need 7 cards total for Eval
            // Board has B items. Randoms has N items. Total B+N=5.
            // Wait, Evaluate7 needs 7 cards.
            // Hero(2) + Board(B) + Randoms(5-B) = 7.
            
            int c1 = -1, c2 = -1, c3 = -1, c4 = -1, c5 = -1;
            
            // Fill with board first
            int bIdx = 0;
            if (bIdx < boardInts.Count) c1 = boardInts[bIdx++];
            if (bIdx < boardInts.Count) c2 = boardInts[bIdx++];
            if (bIdx < boardInts.Count) c3 = boardInts[bIdx++];
            if (bIdx < boardInts.Count) c4 = boardInts[bIdx++];
            if (bIdx < boardInts.Count) c5 = boardInts[bIdx++];
            
            // Fill rest with randoms
            int rIdx = 0;
            if (c1 == -1) c1 = availInts[rIdx++];
            if (c2 == -1) c2 = availInts[rIdx++];
            if (c3 == -1) c3 = availInts[rIdx++];
            if (c4 == -1) c4 = availInts[rIdx++];
            if (c5 == -1) c5 = availInts[rIdx++];
            
            int hScore = Evaluate7(hc1, hc2, c1, c2, c3, c4, c5);
            int vScore = Evaluate7(vc1, vc2, c1, c2, c3, c4, c5);

            if (hScore > vScore) heroWins++;
            else if (vScore > hScore) villainWins++;
            else ties++;
        }

        var total = (double)iterations;
        return new EquityResult
        {
            HeroEquity = ((heroWins + (ties * 0.5)) / total) * 100.0,
            VillainEquity = ((villainWins + (ties * 0.5)) / total) * 100.0,
            TieEquity = (ties / total) * 100.0
        };
    }

    private EquityResult RunMonteCarloMultiway(List<Card> heroCards, List<List<Card>> villainHands, List<Card> boardCards, int iterations, List<Card>? deadCards = null)
    {
        // Keep original slow implementation for Multiway for now, or update it?
        // Multiway is rare and complex. Let's leave it as is but fix EvaluateHand to use Evaluate7 internally?
        // Or just leave the old methods?
        // To save space and cleaner code, I should remove old methods and update this to use Evaluate7.
        
        var deck = CreateDeck();
        var usedCards = new HashSet<Card>(heroCards);
        foreach (var vh in villainHands) usedCards.UnionWith(vh);
        usedCards.UnionWith(boardCards);
        if (deadCards != null) usedCards.UnionWith(deadCards);

        var availableCards = deck.Where(c => !usedCards.Contains(c)).ToList();
        
        int hc1 = GetCardInt(heroCards[0]);
        int hc2 = GetCardInt(heroCards[1]);
        var vHandsInts = villainHands.Select(vh => (GetCardInt(vh[0]), GetCardInt(vh[1]))).ToList();
        var boardInts = boardCards.Select(GetCardInt).ToList();
        var availInts = availableCards.Select(GetCardInt).ToList();

        double heroShare = 0;
        long heroWins = 0;
        long villainWins = 0;
        long ties = 0;

        var cardsNeeded = 5 - boardCards.Count;

        for (var i = 0; i < iterations; i++)
        {
            for (int k = 0; k < cardsNeeded; k++)
            {
                int r = Random.Shared.Next(k, availInts.Count);
                (availInts[k], availInts[r]) = (availInts[r], availInts[k]);
            }
            
            int c1 = -1, c2 = -1, c3 = -1, c4 = -1, c5 = -1;
            int bIdx = 0;
            if (bIdx < boardInts.Count) c1 = boardInts[bIdx++];
            if (bIdx < boardInts.Count) c2 = boardInts[bIdx++];
            if (bIdx < boardInts.Count) c3 = boardInts[bIdx++];
            if (bIdx < boardInts.Count) c4 = boardInts[bIdx++];
            if (bIdx < boardInts.Count) c5 = boardInts[bIdx++];
            int rIdx = 0;
            if (c1 == -1) c1 = availInts[rIdx++];
            if (c2 == -1) c2 = availInts[rIdx++];
            if (c3 == -1) c3 = availInts[rIdx++];
            if (c4 == -1) c4 = availInts[rIdx++];
            if (c5 == -1) c5 = availInts[rIdx++];

            var heroScore = Evaluate7(hc1, hc2, c1, c2, c3, c4, c5);
            var bestVillain = 0;
            var villainWinners = 0;
            foreach (var vh in vHandsInts)
            {
                var s = Evaluate7(vh.Item1, vh.Item2, c1, c2, c3, c4, c5);
                if (s > bestVillain) 
                {
                    bestVillain = s;
                    villainWinners = 1;
                }
                else if (s == bestVillain)
                {
                    villainWinners++;
                }
            }

            if (heroScore > bestVillain) 
            {
                heroWins++;
                heroShare += 1.0;
            }
            else if (heroScore == bestVillain) 
            {
                ties++;
                heroShare += 1.0 / (villainWinners + 1);
            }
            else 
            {
                villainWins++;
            }
        }

        var total = (double)iterations;
        return new EquityResult
        {
            HeroEquity = (heroShare / total) * 100.0,
            VillainEquity = (villainWins / total) * 100.0, // Approximation
            TieEquity = (ties / total) * 100.0
        };
    }

    private EquityResult RunExactEnumerationMultiway(List<Card> heroCards, List<List<Card>> villainHands, List<Card> boardCards, List<Card>? deadCards = null)
    {
        // Also update this to fast
        int hc1 = GetCardInt(heroCards[0]);
        int hc2 = GetCardInt(heroCards[1]);
        var vHandsInts = villainHands.Select(vh => (GetCardInt(vh[0]), GetCardInt(vh[1]))).ToList();
        
        int b1 = -1, b2 = -1, b3 = -1, b4 = -1, b5 = -1;
        int boardCount = boardCards.Count;
        if (boardCount >= 1) b1 = GetCardInt(boardCards[0]);
        if (boardCount >= 2) b2 = GetCardInt(boardCards[1]);
        if (boardCount >= 3) b3 = GetCardInt(boardCards[2]);
        if (boardCount >= 4) b4 = GetCardInt(boardCards[3]);
        if (boardCount >= 5) b5 = GetCardInt(boardCards[4]);

        var usedMask = (1UL << hc1) | (1UL << hc2);
        foreach (var vh in vHandsInts) usedMask |= (1UL << vh.Item1) | (1UL << vh.Item2);
        if (b1 != -1) usedMask |= (1UL << b1);
        if (b2 != -1) usedMask |= (1UL << b2);
        if (b3 != -1) usedMask |= (1UL << b3);
        if (b4 != -1) usedMask |= (1UL << b4);
        if (b5 != -1) usedMask |= (1UL << b5);

        if (deadCards != null)
        {
            foreach (var c in deadCards) usedMask |= (1UL << GetCardInt(c));
        }

        int[] available = new int[52];
        int availCount = 0;
        for (int i = 0; i < 52; i++)
        {
            if ((usedMask & (1UL << i)) == 0) available[availCount++] = i;
        }

        double heroShare = 0;
        long heroWins = 0;
        long villainWins = 0;
        long ties = 0;

        int cardsNeeded = 5 - boardCount;
        
        if (cardsNeeded == 5)
        {
             for (int i1 = 0; i1 < availCount - 4; i1++)
            {
                int c1 = available[i1];
                for (int i2 = i1 + 1; i2 < availCount - 3; i2++)
                {
                    int c2 = available[i2];
                    for (int i3 = i2 + 1; i3 < availCount - 2; i3++)
                    {
                        int c3 = available[i3];
                        for (int i4 = i3 + 1; i4 < availCount - 1; i4++)
                        {
                            int c4 = available[i4];
                            for (int i5 = i4 + 1; i5 < availCount; i5++)
                            {
                                int c5 = available[i5];
                                
                                int hScore = Evaluate7(hc1, hc2, c1, c2, c3, c4, c5);
                                int bestVillain = 0;
                                int villainWinners = 0;
                                foreach(var vh in vHandsInts)
                                {
                                    int s = Evaluate7(vh.Item1, vh.Item2, c1, c2, c3, c4, c5);
                                    if (s > bestVillain) 
                                    {
                                        bestVillain = s;
                                        villainWinners = 1;
                                    }
                                    else if (s == bestVillain) villainWinners++;
                                }
                                
                                if (hScore > bestVillain) 
                                {
                                    heroWins++;
                                    heroShare += 1.0;
                                }
                                else if (hScore == bestVillain) 
                                {
                                    ties++;
                                    heroShare += 1.0 / (villainWinners + 1);
                                }
                                else villainWins++;
                            }
                        }
                    }
                }
            }
        }
        else if (cardsNeeded == 2)
        {
            for (int i1 = 0; i1 < availCount - 1; i1++)
            {
                int c1 = available[i1];
                for (int i2 = i1 + 1; i2 < availCount; i2++)
                {
                    int c2 = available[i2];
                    
                    int hScore = Evaluate7(hc1, hc2, b1, b2, b3, c1, c2);
                    int bestVillain = 0;
                    int villainWinners = 0;
                    foreach (var vh in vHandsInts)
                    {
                        int s = Evaluate7(vh.Item1, vh.Item2, b1, b2, b3, c1, c2);
                        if (s > bestVillain) 
                        {
                            bestVillain = s;
                            villainWinners = 1;
                        }
                        else if (s == bestVillain) villainWinners++;
                    }
                    
                    if (hScore > bestVillain) 
                    {
                        heroWins++;
                        heroShare += 1.0;
                    }
                    else if (hScore == bestVillain) 
                    {
                        ties++;
                        heroShare += 1.0 / (villainWinners + 1);
                    }
                    else villainWins++;
                }
            }
        }
        else if (cardsNeeded == 1)
        {
             for (int i1 = 0; i1 < availCount; i1++)
            {
                int c1 = available[i1];
                
                int hScore = Evaluate7(hc1, hc2, b1, b2, b3, b4, c1);
                int bestVillain = 0;
                int villainWinners = 0;
                foreach (var vh in vHandsInts)
                {
                    int s = Evaluate7(vh.Item1, vh.Item2, b1, b2, b3, b4, c1);
                    if (s > bestVillain) 
                    {
                        bestVillain = s;
                        villainWinners = 1;
                    }
                    else if (s == bestVillain) villainWinners++;
                }
                
                if (hScore > bestVillain) 
                {
                    heroWins++;
                    heroShare += 1.0;
                }
                else if (hScore == bestVillain) 
                {
                    ties++;
                    heroShare += 1.0 / (villainWinners + 1);
                }
                else villainWins++;
            }
        }
        else if (cardsNeeded == 0)
        {
            int hScore = Evaluate7(hc1, hc2, b1, b2, b3, b4, b5);
            int bestVillain = 0;
            int villainWinners = 0;
            foreach (var vh in vHandsInts)
            {
                int s = Evaluate7(vh.Item1, vh.Item2, b1, b2, b3, b4, b5);
                if (s > bestVillain) 
                {
                    bestVillain = s;
                    villainWinners = 1;
                }
                else if (s == bestVillain) villainWinners++;
            }
            
            if (hScore > bestVillain) 
            {
                heroWins++;
                heroShare += 1.0;
            }
            else if (hScore == bestVillain) 
            {
                ties++;
                heroShare += 1.0 / (villainWinners + 1);
            }
            else villainWins++;
        }

        var total = (double)(heroWins + villainWins + ties);
        return new EquityResult
        {
            HeroEquity = (heroShare / total) * 100.0,
            VillainEquity = (villainWins / total) * 100.0, 
            TieEquity = (ties / total) * 100.0
        };
    }
    


    private IEnumerable<List<Card>> GetCombinations(List<Card> list, int k)
    {
        if (k == 0)
        {
            yield return new List<Card>();
            yield break;
        }

        var n = list.Count;
        if (k > n) yield break;

        var indices = new int[k];
        for (int i = 0; i < k; i++) indices[i] = i;

        while (true)
        {
            var combo = new List<Card>(k);
            for (int i = 0; i < k; i++) combo.Add(list[indices[i]]);
            yield return combo;

            int pos = k - 1;
            while (pos >= 0 && indices[pos] == pos + n - k) pos--;
            if (pos < 0) break;
            indices[pos]++;
            for (int i = pos + 1; i < k; i++) indices[i] = indices[i - 1] + 1;
        }
    }

    private List<Card> CreateDeck()
    {
        var deck = new List<Card>();
        var suits = new[] { 'h', 'd', 'c', 's' };
        var ranks = new[] { 'A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2' };

        foreach (var suit in suits)
        {
            foreach (var rank in ranks)
            {
                deck.Add(new Card(rank, suit));
            }
        }

        return deck;
    }

    private List<Card> ParseCards(string cardsStr)
    {
        if (string.IsNullOrWhiteSpace(cardsStr))
            return new List<Card>();

        var cards = new List<Card>();
        var parts = cardsStr.Trim().Split(new[] { ' ', ',', '-' }, StringSplitOptions.RemoveEmptyEntries);

        foreach (var part in parts)
        {
            if (part.Length >= 2)
            {
                var rank = char.ToUpper(part[0]);
                var suit = char.ToLower(part[1]);
                cards.Add(new Card(rank, suit));
            }
        }

        return cards;
    }
}

public record Card(char Rank, char Suit)
{
    public override string ToString() => $"{Rank}{Suit}";
}
