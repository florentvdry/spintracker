using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Runtime.CompilerServices;
using SpinTrackerBackend.Interfaces;
using SpinTrackerBackend;

namespace SpinTrackerBackend.Engines;

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
                                var (hScore, vScore) = PokerStove.PokerStoveHandEvaluator.EvaluateHeroVsVillain5(hc1, hc2, vc1, vc2, c1, c2, c3, c4, c5);
                                
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
            var pairCount = (availCount * (availCount - 1)) / 2;
            var pairs = new (int, int)[pairCount];
            int idx = 0;
            for (int i1 = 0; i1 < availCount - 1; i1++)
                for (int i2 = i1 + 1; i2 < availCount; i2++)
                    pairs[idx++] = (available[i1], available[i2]);

            Parallel.For(0, pairCount, new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount }, () =>
                (0L, 0L, 0L), (i, loopState, localAcc) =>
            {
                var (c1, c2) = pairs[i];
                var (hScore, vScore) = PokerStove.PokerStoveHandEvaluator.EvaluateHeroVsVillain5(hc1, hc2, vc1, vc2, b1, b2, b3, c1, c2);
                
                if (hScore > vScore) localAcc.Item1++;
                else if (vScore > hScore) localAcc.Item2++;
                else localAcc.Item3++;
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
        else if (cardsNeeded == 1)
        {
            Parallel.For(0, availCount, new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount }, () =>
                (0L, 0L, 0L), (i, loopState, localAcc) =>
            {
                int c1 = available[i];
                var (hScore, vScore) = PokerStove.PokerStoveHandEvaluator.EvaluateHeroVsVillain5(hc1, hc2, vc1, vc2, b1, b2, b3, b4, c1);
                
                if (hScore > vScore) localAcc.Item1++;
                else if (vScore > hScore) localAcc.Item2++;
                else localAcc.Item3++;
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
        else if (cardsNeeded == 0)
        {
            var (hScore, vScore) = PokerStove.PokerStoveHandEvaluator.EvaluateHeroVsVillain(hc1, hc2, vc1, vc2, b1, b2, b3, b4, b5);
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
                                
                                int hScore = PokerStove.PokerStoveHandEvaluator.EvaluateHandOnBoard5(hc1, hc2, c1, c2, c3, c4, c5);
                                int bestVillain = 0;
                                int villainWinners = 0;
                                
                                foreach(var vh in vHandsInts)
                                {
                                    int s = PokerStove.PokerStoveHandEvaluator.EvaluateHandOnBoard5(vh.Item1, vh.Item2, c1, c2, c3, c4, c5);
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
            var pairCount = (availCount * (availCount - 1)) / 2;
            var pairs = new (int, int)[pairCount];
            int idx = 0;
            for (int i1 = 0; i1 < availCount - 1; i1++)
                for (int i2 = i1 + 1; i2 < availCount; i2++)
                    pairs[idx++] = (available[i1], available[i2]);

            Parallel.For(0, pairCount, new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount }, () =>
                (0.0, 0L, 0L, 0L), (i, loopState, localAcc) =>
            {
                var (c1, c2) = pairs[i];
                int hScore = PokerStove.PokerStoveHandEvaluator.EvaluateHandOnBoard5(hc1, hc2, b1, b2, b3, c1, c2);
                int bestVillain = 0;
                int villainWinners = 0;
                foreach (var vh in vHandsInts)
                {
                    int s = PokerStove.PokerStoveHandEvaluator.EvaluateHandOnBoard5(vh.Item1, vh.Item2, b1, b2, b3, c1, c2);
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
        else if (cardsNeeded == 1)
        {
            Parallel.For(0, availCount, new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount }, () =>
                (0.0, 0L, 0L, 0L), (i, loopState, localAcc) =>
            {
                int c1 = available[i];
                int hScore = PokerStove.PokerStoveHandEvaluator.EvaluateHandOnBoard5(hc1, hc2, b1, b2, b3, b4, c1);
                int bestVillain = 0;
                int villainWinners = 0;
                foreach (var vh in vHandsInts)
                {
                    int s = PokerStove.PokerStoveHandEvaluator.EvaluateHandOnBoard5(vh.Item1, vh.Item2, b1, b2, b3, b4, c1);
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
        else if (cardsNeeded == 0)
        {
            int hScore = PokerStove.PokerStoveHandEvaluator.EvaluateHandOnBoard(hc1, hc2, b1, b2, b3, b4, b5);
            int bestVillain = 0;
            int villainWinners = 0;
            foreach (var vh in vHandsInts)
            {
                int s = PokerStove.PokerStoveHandEvaluator.EvaluateHandOnBoard(vh.Item1, vh.Item2, b1, b2, b3, b4, b5);
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
