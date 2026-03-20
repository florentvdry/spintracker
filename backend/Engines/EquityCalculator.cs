using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Runtime.CompilerServices;
using SpinTrackerBackend.Interfaces;
using SpinTrackerBackend;

namespace SpinTrackerBackend.Engines;

public static class HandEvaluator
{
    private static readonly int[] StraightTable = new int[8192];
    private static readonly int[] HighCardTable = new int[8192];

    static HandEvaluator()
    {
        for (int i = 0; i < 8192; i++)
        {
            StraightTable[i] = ComputeStraightHighCardFromMask(i);
            HighCardTable[i] = ComputeHighCardScoreFromMask(i);
        }
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static int Evaluate7Cards(int c1, int c2, int c3, int c4, int c5, int c6, int c7)
    {
        return Evaluate7(c1, c2, c3, c4, c5, c6, c7);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    internal static int Evaluate7(int c1, int c2, int c3, int c4, int c5, int c6, int c7)
    {
        int r1 = c1 >> 2; int s1 = c1 & 3;
        int r2 = c2 >> 2; int s2 = c2 & 3;
        int r3 = c3 >> 2; int s3 = c3 & 3;
        int r4 = c4 >> 2; int s4 = c4 & 3;
        int r5 = c5 >> 2; int s5 = c5 & 3;
        int r6 = c6 >> 2; int s6 = c6 & 3;
        int r7 = c7 >> 2; int s7 = c7 & 3;

        // Fast suit counting using bitwise (4 bits per suit)
        int suitCounts = (1 << (s1 << 2)) + (1 << (s2 << 2)) + (1 << (s3 << 2)) + (1 << (s4 << 2)) + (1 << (s5 << 2)) + (1 << (s6 << 2)) + (1 << (s7 << 2));
        
        int flushSuit = -1;
        if (((suitCounts + 0x3333) & 0x8888) != 0)
        {
            if ((suitCounts & 0xF) >= 5) flushSuit = 0;
            else if (((suitCounts >> 4) & 0xF) >= 5) flushSuit = 1;
            else if (((suitCounts >> 8) & 0xF) >= 5) flushSuit = 2;
            else flushSuit = 3;
        }

        if (flushSuit != -1)
        {
            int mask = 0;
            if (s1 == flushSuit) mask |= (1 << r1);
            if (s2 == flushSuit) mask |= (1 << r2);
            if (s3 == flushSuit) mask |= (1 << r3);
            if (s4 == flushSuit) mask |= (1 << r4);
            if (s5 == flushSuit) mask |= (1 << r5);
            if (s6 == flushSuit) mask |= (1 << r6);
            if (s7 == flushSuit) mask |= (1 << r7);

            int sfScore = StraightTable[mask];
            if (sfScore > 0) return 8000000 + sfScore;

            return 5000000 + HighCardTable[mask];
        }

        int rankMask = (1 << r1) | (1 << r2) | (1 << r3) | (1 << r4) | (1 << r5) | (1 << r6) | (1 << r7);
        
        Span<int> counts = stackalloc int[13];
        counts[r1]++; counts[r2]++; counts[r3]++; counts[r4]++; counts[r5]++; counts[r6]++; counts[r7]++;
        
        int quads = -1, trips = -1, pairs1 = -1, pairs2 = -1;
        
        for (int i = 12; i >= 0; i--)
        {
            int c = counts[i];
            if (c == 4) quads = i;
            else if (c == 3) 
            {
                if (trips == -1) trips = i;
                else if (pairs1 == -1) pairs1 = i;
            }
            else if (c == 2)
            {
                if (pairs1 == -1) pairs1 = i;
                else if (pairs2 == -1) pairs2 = i;
            }
        }

        if (quads != -1)
        {
            int kicker = 0;
            for (int i = 12; i >= 0; i--) if (i != quads && counts[i] > 0) { kicker = i; break; }
            return 7000000 + quads * 15 + kicker;
        }

        if (trips != -1 && (pairs1 != -1 || pairs2 != -1))
        {
            return 6000000 + trips * 15 + pairs1;
        }

        int stScore = StraightTable[rankMask];
        if (stScore > 0) return 4000000 + stScore;

        if (trips != -1)
        {
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
            int kicker = 0;
            for (int i = 12; i >= 0; i--) if (i != pairs1 && i != pairs2 && counts[i] > 0) { kicker = i; break; }
            return 2000000 + pairs1 * 225 + pairs2 * 15 + kicker;
        }

        if (pairs1 != -1)
        {
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

        return HighCardTable[rankMask];
    }

    private static int ComputeStraightHighCardFromMask(int mask)
    {
        if ((mask & 0x1F00) == 0x1F00) return 14;
        if ((mask & 0x0F80) == 0x0F80) return 13;
        if ((mask & 0x07C0) == 0x07C0) return 12;
        if ((mask & 0x03E0) == 0x03E0) return 11;
        if ((mask & 0x01F0) == 0x01F0) return 10;
        if ((mask & 0x00F8) == 0x00F8) return 9;
        if ((mask & 0x007C) == 0x007C) return 8;
        if ((mask & 0x003E) == 0x003E) return 7;
        if ((mask & 0x001F) == 0x001F) return 6;
        if ((mask & 0x100F) == 0x100F) return 5;
        return 0;
    }

    private static int ComputeHighCardScoreFromMask(int mask)
    {
        int score = 0;
        int mult = 1;
        
        int c1 = -1, c2 = -1, c3 = -1, c4 = -1, c5 = -1;
        
        for (int i = 12; i >= 0; i--)
        {
            if ((mask & (1 << i)) != 0)
            {
                int val = i + 2;
                if (c1 == -1) c1 = val;
                else if (c2 == -1) c2 = val;
                else if (c3 == -1) c3 = val;
                else if (c4 == -1) c4 = val;
                else if (c5 == -1) { c5 = val; break; }
            }
        }
        
        if (c5 != -1) { score += c5 * mult; mult *= 15; }
        if (c4 != -1) { score += c4 * mult; mult *= 15; }
        if (c3 != -1) { score += c3 * mult; mult *= 15; }
        if (c2 != -1) { score += c2 * mult; mult *= 15; }
        if (c1 != -1) { score += c1 * mult; mult *= 15; }
        
        return score;
    }
}

public class EquityCalculator : IEquityCalculator
{
    private readonly ILogger<EquityCalculator> _logger;

    public EquityCalculator(ILogger<EquityCalculator> logger)
    {
        _logger = logger;
    }

    public EquityResult Calculate(string heroCards, string villainCards, string board, string? deadCards = null)
    {
        try
        {
            var heroCardList = ParseCards(heroCards);
            var boardCards = ParseCards(board);
            var deadCardList = ParseCards(deadCards ?? "");

            if (!string.IsNullOrWhiteSpace(villainCards) && villainCards.Contains('|'))
            {
                var villainHands = villainCards.Split('|').Select(s => ParseCards(s)).Where(l => l.Count == 2).ToList();
                if (villainHands.Count == 0)
                    throw new ArgumentException("Invalid villain hands provided for multiway calculation");

                return RunExactEnumerationMultiway(heroCardList, villainHands, boardCards, deadCardList);
            }

            var villainCardList = ParseCards(villainCards);
            if (heroCardList.Count != 2 || villainCardList.Count != 2)
            {
                throw new ArgumentException("Hero and villain must have exactly 2 cards");
            }

            return RunExactEnumeration(heroCardList, villainCardList, boardCards, deadCardList);
        }
        catch (Exception e)
        {
            _logger.LogError($"Equity calculation error: {e.Message}");
            throw;
        }
    }

    private EquityResult RunExactEnumeration(List<Card> heroCards, List<Card> villainCards, List<Card> boardCards, List<Card>? deadCards = null)
    {
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

        ulong usedMask = (1UL << hc1) | (1UL << hc2) | (1UL << vc1) | (1UL << vc2);
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
            if ((usedMask & (1UL << i)) == 0)
            {
                available[availCount++] = i;
            }
        }

        long heroWins = 0;
        long villainWins = 0;
        long ties = 0;

        int cardsNeeded = 5 - boardCount;

        if (cardsNeeded == 5)
        {
            Parallel.For(0, availCount - 4, new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount }, () =>
                (0L, 0L, 0L), (i1, loopState, localAcc) =>
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
                                int hScore = HandEvaluator.Evaluate7Cards(hc1, hc2, c1, c2, c3, c4, c5);
                                int vScore = HandEvaluator.Evaluate7Cards(vc1, vc2, c1, c2, c3, c4, c5);
                                
                                if (hScore > vScore) localAcc.Item1++;
                                else if (vScore > hScore) localAcc.Item2++;
                                else localAcc.Item3++;
                            }
                        }
                    }
                }
                return localAcc;
            }, localAcc =>
            {
                lock (_syncLock)
                {
                    heroWins += localAcc.Item1;
                    villainWins += localAcc.Item2;
                    ties += localAcc.Item3;
                }
            });
        }
        else if (cardsNeeded == 2)
        {
            for (int i1 = 0; i1 < availCount - 1; i1++)
            {
                int c1 = available[i1];
                for (int i2 = i1 + 1; i2 < availCount; i2++)
                {
                    int c2 = available[i2];
                    
                    int hScore = HandEvaluator.Evaluate7Cards(hc1, hc2, b1, b2, b3, c1, c2);
                    int vScore = HandEvaluator.Evaluate7Cards(vc1, vc2, b1, b2, b3, c1, c2);
                    
                    if (hScore > vScore) heroWins++;
                    else if (vScore > hScore) villainWins++;
                    else ties++;
                }
            }
        }
        else if (cardsNeeded == 1)
        {
            for (int i1 = 0; i1 < availCount; i1++)
            {
                int c1 = available[i1];
                
                int hScore = HandEvaluator.Evaluate7Cards(hc1, hc2, b1, b2, b3, b4, c1);
                int vScore = HandEvaluator.Evaluate7Cards(vc1, vc2, b1, b2, b3, b4, c1);
                
                if (hScore > vScore) heroWins++;
                else if (vScore > hScore) villainWins++;
                else ties++;
            }
        }
        else if (cardsNeeded == 0)
        {
            int hScore = HandEvaluator.Evaluate7Cards(hc1, hc2, b1, b2, b3, b4, b5);
            int vScore = HandEvaluator.Evaluate7Cards(vc1, vc2, b1, b2, b3, b4, b5);
            if (hScore > vScore) heroWins++;
            else if (vScore > hScore) villainWins++;
            else ties++;
        }

        var total = (double)(heroWins + villainWins + ties);
        return new EquityResult
        {
            HeroEquity = ((heroWins + (ties * 0.5)) / total) * 100.0,
            VillainEquity = ((villainWins + (ties * 0.5)) / total) * 100.0,
            TieEquity = (ties / total) * 100.0
        };
    }

    private EquityResult RunExactEnumerationMultiway(List<Card> heroCards, List<List<Card>> villainHands, List<Card> boardCards, List<Card>? deadCards = null)
    {
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

        ulong usedMask = (1UL << hc1) | (1UL << hc2);
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
            Parallel.For(0, availCount - 4, new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount }, () =>
                (0.0, 0L, 0L, 0L), (i1, loopState, localAcc) =>
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
                                
                                int hScore = HandEvaluator.Evaluate7Cards(hc1, hc2, c1, c2, c3, c4, c5);
                                int bestVillain = 0;
                                int villainWinners = 0;
                                
                                foreach(var vh in vHandsInts)
                                {
                                    int s = HandEvaluator.Evaluate7Cards(vh.Item1, vh.Item2, c1, c2, c3, c4, c5);
                                    if (s > bestVillain) 
                                    {
                                        bestVillain = s;
                                        villainWinners = 1;
                                    }
                                    else if (s == bestVillain) villainWinners++;
                                }
                                
                                if (hScore > bestVillain) 
                                {
                                    localAcc.Item2++;
                                    localAcc.Item1 += 1.0;
                                }
                                else if (hScore == bestVillain) 
                                {
                                    localAcc.Item3++;
                                    localAcc.Item1 += 1.0 / (villainWinners + 1);
                                }
                                else localAcc.Item4++;
                            }
                        }
                    }
                }
                return localAcc;
            }, localAcc =>
            {
                lock (_syncLock)
                {
                    heroShare += localAcc.Item1;
                    heroWins += localAcc.Item2;
                    ties += localAcc.Item3;
                    villainWins += localAcc.Item4;
                }
            });
        }
        else if (cardsNeeded == 2)
        {
            for (int i1 = 0; i1 < availCount - 1; i1++)
            {
                int c1 = available[i1];
                for (int i2 = i1 + 1; i2 < availCount; i2++)
                {
                    int c2 = available[i2];
                    
                    int hScore = HandEvaluator.Evaluate7Cards(hc1, hc2, b1, b2, b3, c1, c2);
                    int bestVillain = 0;
                    int villainWinners = 0;
                    foreach (var vh in vHandsInts)
                    {
                        int s = HandEvaluator.Evaluate7Cards(vh.Item1, vh.Item2, b1, b2, b3, c1, c2);
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
                
                int hScore = HandEvaluator.Evaluate7Cards(hc1, hc2, b1, b2, b3, b4, c1);
                int bestVillain = 0;
                int villainWinners = 0;
                foreach (var vh in vHandsInts)
                {
                    int s = HandEvaluator.Evaluate7Cards(vh.Item1, vh.Item2, b1, b2, b3, b4, c1);
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
            int hScore = HandEvaluator.Evaluate7Cards(hc1, hc2, b1, b2, b3, b4, b5);
            int bestVillain = 0;
            int villainWinners = 0;
            foreach (var vh in vHandsInts)
            {
                int s = HandEvaluator.Evaluate7Cards(vh.Item1, vh.Item2, b1, b2, b3, b4, b5);
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

    private static readonly object _syncLock = new object();

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
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
