namespace PokerTrackerBackend;

public class EquityCalculator
{
    private readonly ILogger<EquityCalculator> _logger;

    public EquityCalculator(ILogger<EquityCalculator> logger)
    {
        _logger = logger;
    }

    public EquityResult Calculate(string heroCards, string villainCards, string board, int iterations)
    {
        try
        {
            var heroCardList = ParseCards(heroCards);
            var boardCards = ParseCards(board);

            // Support multiway villain hands separated by '|'
            if (!string.IsNullOrWhiteSpace(villainCards) && villainCards.Contains('|'))
            {
                // Parse multiple villain hands
                var villainHands = villainCards.Split('|').Select(s => ParseCards(s)).Where(l => l.Count == 2).ToList();
                if (villainHands.Count == 0)
                    throw new ArgumentException("Invalid villain hands provided for multiway calculation");

                // Use exact enumeration for postflop multiway when feasible
                var cardsNeededMulti = 5 - boardCards.Count;
                if (cardsNeededMulti <= 2)
                {
                    return RunExactEnumerationMultiway(heroCardList, villainHands, boardCards);
                }

                // Otherwise fall back to Monte Carlo
                return RunMonteCarloMultiway(heroCardList, villainHands, boardCards, iterations);
            }

            var villainCardList = ParseCards(villainCards);
            if (heroCardList.Count != 2 || villainCardList.Count != 2)
            {
                throw new ArgumentException("Hero and villain must have exactly 2 cards");
            }

            // Use exact enumeration for postflop (flop/turn/river) when feasible,
            // fallback to Monte Carlo when too many unknown cards remain.
            var cardsNeeded = 5 - boardCards.Count;
            if (cardsNeeded <= 3) // Changed from 2 to 3 for more accuracy
            {
                return RunExactEnumeration(heroCardList, villainCardList, boardCards);
            }

            // Monte Carlo simulation for cases with >2 unknown cards or multiway fallthrough
            return RunMonteCarlo(heroCardList, villainCardList, boardCards, iterations);
        }
        catch (Exception e)
        {
            _logger.LogError($"Equity calculation error: {e.Message}");
            throw;
        }
    }

    private EquityResult RunMonteCarlo(List<Card> heroCards, List<Card> villainCards, List<Card> boardCards, int iterations)
    {
        var deck = CreateDeck();
        var usedCards = new HashSet<Card>(heroCards);
        usedCards.UnionWith(villainCards);
        usedCards.UnionWith(boardCards);

        var availableCards = deck.Where(c => !usedCards.Contains(c)).ToList();

        var heroWins = 0;
        var villainWins = 0;
        var ties = 0;

        var cardsNeeded = 5 - boardCards.Count;

        for (var i = 0; i < iterations; i++)
        {
            var simulatedBoard = new List<Card>(boardCards);

            // Draw remaining cards
            var shuffled = availableCards.OrderBy(_ => Random.Shared.Next()).Take(cardsNeeded).ToList();
            simulatedBoard.AddRange(shuffled);

            var heroScore = EvaluateHand(heroCards.Concat(simulatedBoard).ToList());
            var villainScore = EvaluateHand(villainCards.Concat(simulatedBoard).ToList());

            if (heroScore > villainScore) heroWins++;
            else if (villainScore > heroScore) villainWins++;
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

    private EquityResult RunMonteCarloMultiway(List<Card> heroCards, List<List<Card>> villainHands, List<Card> boardCards, int iterations)
    {
        var deck = CreateDeck();
        var usedCards = new HashSet<Card>(heroCards);
        foreach (var vh in villainHands)
            usedCards.UnionWith(vh);
        usedCards.UnionWith(boardCards);

        var availableCards = deck.Where(c => !usedCards.Contains(c)).ToList();

        var heroWins = 0;
        var villainWins = 0;
        var ties = 0;

        var cardsNeeded = 5 - boardCards.Count;

        for (var i = 0; i < iterations; i++)
        {
            var simulatedBoard = new List<Card>(boardCards);

            // Draw remaining cards
            var shuffled = availableCards.OrderBy(_ => Random.Shared.Next()).Take(cardsNeeded).ToList();
            simulatedBoard.AddRange(shuffled);

            var heroScore = EvaluateHand(heroCards.Concat(simulatedBoard).ToList());
            var villainScores = villainHands.Select(vh => EvaluateHand(vh.Concat(simulatedBoard).ToList())).ToList();

            var bestVillain = villainScores.Max();

            if (heroScore > bestVillain) heroWins++;
            else if (heroScore == bestVillain) ties++;
            else villainWins++;
        }

        var total = (double)iterations;
        return new EquityResult
        {
            HeroEquity = ((heroWins + (ties * 0.5)) / total) * 100.0,
            VillainEquity = (villainWins / total) * 100.0,
            TieEquity = (ties / total) * 100.0
        };
    }

    private EquityResult RunExactEnumeration(List<Card> heroCards, List<Card> villainCards, List<Card> boardCards)
    {
        var deck = CreateDeck();
        var usedCards = new HashSet<Card>(heroCards);
        usedCards.UnionWith(villainCards);
        usedCards.UnionWith(boardCards);

        var availableCards = deck.Where(c => !usedCards.Contains(c)).ToList();

        var heroWins = 0L;
        var villainWins = 0L;
        var ties = 0L;

        var cardsNeeded = 5 - boardCards.Count;

        foreach (var combo in GetCombinations(availableCards, cardsNeeded))
        {
            var simulatedBoard = new List<Card>(boardCards);
            simulatedBoard.AddRange(combo);

            var heroScore = EvaluateHand(heroCards.Concat(simulatedBoard).ToList());
            var villainScore = EvaluateHand(villainCards.Concat(simulatedBoard).ToList());

            if (heroScore > villainScore) heroWins++;
            else if (villainScore > heroScore) villainWins++;
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

    private EquityResult RunExactEnumerationMultiway(List<Card> heroCards, List<List<Card>> villainHands, List<Card> boardCards)
    {
        var deck = CreateDeck();
        var usedCards = new HashSet<Card>(heroCards);
        foreach (var vh in villainHands)
            usedCards.UnionWith(vh);
        usedCards.UnionWith(boardCards);

        var availableCards = deck.Where(c => !usedCards.Contains(c)).ToList();

        var heroWins = 0L;
        var villainWins = 0L;
        var ties = 0L;

        var cardsNeeded = 5 - boardCards.Count;

        foreach (var combo in GetCombinations(availableCards, cardsNeeded))
        {
            var simulatedBoard = new List<Card>(boardCards);
            simulatedBoard.AddRange(combo);

            var heroScore = EvaluateHand(heroCards.Concat(simulatedBoard).ToList());
            var villainScores = villainHands.Select(vh => EvaluateHand(vh.Concat(simulatedBoard).ToList())).ToList();

            var bestVillain = villainScores.Max();

            if (heroScore > bestVillain) heroWins++;
            else if (heroScore == bestVillain) ties++;
            else villainWins++;
        }

        var total = (double)(heroWins + villainWins + ties);
        return new EquityResult
        {
            HeroEquity = ((heroWins + (ties * 0.5)) / total) * 100.0,
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

    private int EvaluateHand(List<Card> cards)
    {
        // Hand evaluation that properly ranks hands
        // Returns a score where higher = better hand

        if (cards.Count < 5) return 0;

        var rankValues = new Dictionary<char, int>
        {
            {'A', 14}, {'K', 13}, {'Q', 12}, {'J', 11}, {'T', 10},
            {'9', 9}, {'8', 8}, {'7', 7}, {'6', 6}, {'5', 5},
            {'4', 4}, {'3', 3}, {'2', 2}
        };

        var rankCounts = new Dictionary<char, int>();
        var suitCounts = new Dictionary<char, int>();

        foreach (var card in cards)
        {
            rankCounts[card.Rank] = rankCounts.GetValueOrDefault(card.Rank, 0) + 1;
            suitCounts[card.Suit] = suitCounts.GetValueOrDefault(card.Suit, 0) + 1;
        }

        var isFlush = suitCounts.Values.Any(c => c >= 5);
        var isStraight = CheckStraight(cards);

        // Get ranked counts: list of (rank_value, count) ordered by count desc, then rank desc
        var rankedCounts = rankCounts
            .Select(kv => (RankValue: rankValues.GetValueOrDefault(kv.Key, 0), Count: kv.Value))
            .OrderByDescending(x => x.Count)
            .ThenByDescending(x => x.RankValue)
            .ToList();

        var counts = rankedCounts.Select(x => x.Count).ToList();

        // Build score from rank values in priority order
        // For pairs/trips, the rank of the paired cards matters most
        int GetCompositeScore()
        {
            // Take top 5 rank values weighted by position
            var score = 0;
            var multiplier = 1;
            var topRanks = rankedCounts.Take(5).Select(x => x.RankValue).Reverse().ToList();
            foreach (var r in topRanks)
            {
                score += r * multiplier;
                multiplier *= 15;
            }
            return score;
        }

        // Straight Flush / Royal Flush
        if (isFlush && isStraight) return 8000000 + GetStraightHighCard(cards, rankValues);

        // Four of a kind (rank of quads is rankedCounts[0])
        if (counts.Count > 0 && counts[0] == 4) 
            return 7000000 + rankedCounts[0].RankValue * 15 + rankedCounts[1].RankValue;

        // Full house (rank of trips, then rank of pair)
        if (counts.Count >= 2 && counts[0] == 3 && counts[1] >= 2)
            return 6000000 + rankedCounts[0].RankValue * 15 + rankedCounts[1].RankValue;

        // Flush (compare high cards in flush suit)
        if (isFlush) return 5000000 + GetFlushScore(cards, suitCounts, rankValues);

        // Straight
        if (isStraight) return 4000000 + GetStraightHighCard(cards, rankValues);

        // Three of a kind
        if (counts.Count > 0 && counts[0] == 3) 
            return 3000000 + rankedCounts[0].RankValue * 225 + GetCompositeScore() % 225;

        // Two pair (compare higher pair, then lower pair, then kicker)
        if (counts.Count >= 2 && counts[0] == 2 && counts[1] == 2)
        {
            var pairList = rankedCounts.Where(x => x.Count == 2).OrderByDescending(x => x.RankValue).Take(2).ToList();
            int p1 = pairList[0].RankValue;
            int p2 = pairList[1].RankValue;
            var kickerList = rankedCounts.Where(x => x.RankValue != p1 && x.RankValue != p2)
                                        .OrderByDescending(x => x.RankValue).ToList();
            int kv = kickerList.Count > 0 ? kickerList[0].RankValue : 0;
            return 2000000 + p1 * 225 + p2 * 15 + kv;
        }

        // One pair (pair rank, then kickers)
        if (counts.Count > 0 && counts[0] == 2)
        {
            var pairRank = rankedCounts[0].RankValue;
            var kickers = rankedCounts.Where(x => x.Count == 1 || (x.Count == 2 && x.RankValue != pairRank))
                                     .OrderByDescending(x => x.RankValue).Take(3).ToList();
            var kickerScore = 0;
            var mult = 1;
            for (int i = kickers.Count - 1; i >= 0; i--)
            {
                kickerScore += kickers[i].RankValue * mult;
                mult *= 15;
            }
            return 1000000 + pairRank * 3375 + kickerScore;
        }

        // High card
        return GetCompositeScore();
    }

    private int GetStraightHighCard(List<Card> cards, Dictionary<char, int> rankValues)
    {
        var ranks = cards.Select(c => rankValues.GetValueOrDefault(c.Rank, 0)).Distinct().OrderByDescending(x => x).ToList();
        // Check for wheel (A-2-3-4-5)
        if (ranks.Contains(14) && ranks.Contains(5) && ranks.Contains(4) && ranks.Contains(3) && ranks.Contains(2))
            return 5; // Wheel has 5 as high card
        
        // Find highest straight
        for (int i = 0; i <= ranks.Count - 5; i++)
        {
            if (ranks[i] - ranks[i + 4] == 4)
                return ranks[i];
        }
        return ranks.FirstOrDefault();
    }

    private int GetFlushScore(List<Card> cards, Dictionary<char, int> suitCounts, Dictionary<char, int> rankValues)
    {
        var flushSuit = suitCounts.FirstOrDefault(kv => kv.Value >= 5).Key;
        var flushCards = cards.Where(c => c.Suit == flushSuit)
            .Select(c => rankValues.GetValueOrDefault(c.Rank, 0))
            .OrderByDescending(x => x)
            .Take(5)
            .ToList();
        
        var score = 0;
        var mult = 1;
        for (int i = 4; i >= 0; i--)
        {
            if (i < flushCards.Count)
                score += flushCards[i] * mult;
            mult *= 15;
        }
        return score;
    }

    private bool CheckStraight(List<Card> cards)
    {
        var rankOrder = "AKQJT98765432A"; // A can be low in A-2-3-4-5
        var ranks = cards.Select(c => c.Rank).Distinct().ToHashSet();

        for (var i = 0; i <= rankOrder.Length - 5; i++)
        {
            var straight = rankOrder.Substring(i, 5);
            if (straight.All(r => ranks.Contains(r)))
                return true;
        }

        return false;
    }

    private int GetHighCardValue(List<Card> cards)
    {
        var rankValues = new Dictionary<char, int>
        {
            {'A', 14}, {'K', 13}, {'Q', 12}, {'J', 11}, {'T', 10},
            {'9', 9}, {'8', 8}, {'7', 7}, {'6', 6}, {'5', 5},
            {'4', 4}, {'3', 3}, {'2', 2}
        };

        return cards.Select(c => rankValues.GetValueOrDefault(c.Rank, 0)).OrderByDescending(x => x).FirstOrDefault();
    }

    private static Dictionary<string, double> InitializePreflopEquityTable()
    {
        return new Dictionary<string, double>
        {
            ["AA_KK"] = 81.95,
            ["AA_QQ"] = 82.36,
            ["AA_JJ"] = 82.64,
            ["AA_TT"] = 82.91,
            ["AA_99"] = 83.11,
            ["AA_88"] = 83.28,
            ["AA_77"] = 83.41,
            ["AA_66"] = 83.52,
            ["AA_55"] = 83.0,
            ["AA_44"] = 83.11,
            ["AA_33"] = 83.22,
            ["AA_22"] = 83.33,
            ["KK_QQ"] = 81.52,
            ["KK_JJ"] = 81.84,
            ["KK_TT"] = 82.14,
            ["KK_99"] = 82.39,
            ["KK_88"] = 82.59,
            ["KK_77"] = 82.75,
            ["KK_66"] = 82.88,
            ["KK_55"] = 82.36,
            ["KK_44"] = 82.48,
            ["KK_33"] = 82.6,
            ["KK_22"] = 82.72,
            ["QQ_JJ"] = 81.1,
            ["QQ_TT"] = 81.45,
            ["QQ_99"] = 81.75,
            ["QQ_88"] = 81.99,
            ["QQ_77"] = 82.19,
            ["QQ_66"] = 82.36,
            ["QQ_55"] = 81.84,
            ["QQ_44"] = 81.98,
            ["QQ_33"] = 82.11,
            ["QQ_22"] = 82.24,
            ["JJ_TT"] = 80.65,
            ["JJ_99"] = 81.0,
            ["JJ_88"] = 81.29,
            ["JJ_77"] = 81.53,
            ["JJ_66"] = 81.74,
            ["JJ_55"] = 81.23,
            ["JJ_44"] = 81.39,
            ["JJ_33"] = 81.54,
            ["JJ_22"] = 81.68,
            ["TT_99"] = 80.17,
            ["TT_88"] = 80.51,
            ["TT_77"] = 80.8,
            ["TT_66"] = 81.05,
            ["TT_55"] = 80.55,
            ["TT_44"] = 80.73,
            ["TT_33"] = 80.9,
            ["TT_22"] = 81.05,
            ["99_88"] = 79.63,
            ["99_77"] = 79.99,
            ["99_66"] = 80.3,
            ["99_55"] = 79.81,
            ["99_44"] = 80.02,
            ["99_33"] = 80.21,
            ["99_22"] = 80.38,
            ["88_77"] = 79.05,
            ["88_66"] = 79.42,
            ["88_55"] = 78.95,
            ["88_44"] = 79.18,
            ["88_33"] = 79.39,
            ["88_22"] = 79.58,
            ["77_66"] = 78.42,
            ["77_55"] = 77.97,
            ["77_44"] = 78.22,
            ["77_33"] = 78.45,
            ["77_22"] = 78.66,
            ["66_55"] = 77.73,
            ["66_44"] = 78.0,
            ["66_33"] = 78.25,
            ["66_22"] = 78.48,
            ["55_44"] = 77.06,
            ["55_33"] = 77.34,
            ["55_22"] = 77.59,
            ["44_33"] = 76.35,
            ["44_22"] = 76.63,
            ["33_22"] = 75.6,
            ["AA_AKs"] = 87.23,
            ["AA_AKo"] = 86.69,
            ["AA_AQs"] = 86.47,
            ["AA_AQo"] = 85.89,
            ["AA_AJs"] = 85.74,
            ["AA_AJo"] = 85.12,
            ["AA_ATs"] = 85.0,
            ["AA_ATo"] = 84.33,
            ["KK_AKs"] = 65.99,
            ["KK_AKo"] = 65.29,
            ["KK_AQs"] = 71.42,
            ["KK_AQo"] = 70.63,
            ["KK_KQs"] = 85.89,
            ["KK_KQo"] = 85.28,
            ["KK_KJs"] = 85.1,
            ["KK_KJo"] = 84.43,
            ["QQ_AKs"] = 54.14,
            ["QQ_AKo"] = 53.29,
            ["QQ_AQs"] = 66.13,
            ["QQ_AQo"] = 65.36,
            ["QQ_KQs"] = 65.75,
            ["QQ_KQo"] = 64.95,
            ["QQ_QJs"] = 85.49,
            ["QQ_QJo"] = 84.86,
            ["JJ_AKs"] = 53.8,
            ["JJ_AKo"] = 52.95,
            ["JJ_AQs"] = 54.23,
            ["JJ_AQo"] = 53.37,
            ["JJ_AJs"] = 66.27,
            ["JJ_AJo"] = 65.5,
            ["JJ_KQs"] = 54.54,
            ["JJ_KQo"] = 53.67,
            ["TT_AKs"] = 53.41,
            ["TT_AKo"] = 52.55,
            ["TT_AQs"] = 53.85,
            ["TT_AQo"] = 52.98,
            ["TT_AJs"] = 54.25,
            ["TT_AJo"] = 53.37,
            ["TT_ATs"] = 66.34,
            ["TT_ATo"] = 65.56,
            ["AKs_QQ"] = 45.86,
            ["AKo_QQ"] = 46.71,
            ["AKs_JJ"] = 46.2,
            ["AKo_JJ"] = 47.05,
            ["AKs_TT"] = 46.59,
            ["AKo_TT"] = 47.45,
            ["AKs_99"] = 46.93,
            ["AKo_99"] = 47.8,
            ["AKs_88"] = 47.22,
            ["AKo_88"] = 48.1,
            ["AKs_77"] = 47.46,
            ["AKo_77"] = 48.35,
            ["AKs_66"] = 47.64,
            ["AKo_66"] = 48.54,
            ["AKs_55"] = 47.37,
            ["AKo_55"] = 48.28,
            ["AKs_44"] = 47.52,
            ["AKo_44"] = 48.43,
            ["AKs_33"] = 47.65,
            ["AKo_33"] = 48.57,
            ["AKs_22"] = 47.77,
            ["AKo_22"] = 48.69,
            ["AQs_KK"] = 28.58,
            ["AQo_KK"] = 29.37,
            ["AQs_JJ"] = 45.77,
            ["AQo_JJ"] = 46.63,
            ["AQs_TT"] = 46.15,
            ["AQo_TT"] = 47.02,
            ["AQs_99"] = 46.49,
            ["AQo_99"] = 47.37,
            ["AJs_KK"] = 28.69,
            ["AJo_KK"] = 29.5,
            ["AJs_QQ"] = 29.06,
            ["AJo_QQ"] = 29.88,
            ["AJs_TT"] = 45.75,
            ["AJo_TT"] = 46.63,
            ["AJs_99"] = 46.09,
            ["AJo_99"] = 46.98,
            ["ATs_KK"] = 28.77,
            ["ATo_KK"] = 29.59,
            ["ATs_QQ"] = 29.14,
            ["ATo_QQ"] = 29.98,
            ["ATs_JJ"] = 29.48,
            ["ATo_JJ"] = 30.32,
            ["ATs_99"] = 45.64,
            ["ATo_99"] = 46.53,
            ["A5s_KK"] = 30.38,
            ["A5o_KK"] = 29.56,
            ["A5s_QQ"] = 30.7,
            ["A5o_QQ"] = 29.86,
            ["A5s_JJ"] = 30.97,
            ["A5o_JJ"] = 30.12,
            ["A5s_TT"] = 31.2,
            ["A5o_TT"] = 30.33,
            ["A5s_99"] = 31.41,
            ["A5o_99"] = 30.52,
            ["A5s_88"] = 31.58,
            ["A5o_88"] = 30.68,
            ["A5s_77"] = 31.73,
            ["A5o_77"] = 30.82,
            ["A5s_66"] = 32.04,
            ["A5o_66"] = 31.12,
            ["A4s_KK"] = 29.98,
            ["A4o_KK"] = 29.15,
            ["A4s_QQ"] = 30.3,
            ["A4o_QQ"] = 29.46,
            ["A4s_JJ"] = 30.58,
            ["A4o_JJ"] = 29.73,
            ["A4s_TT"] = 30.83,
            ["A4o_TT"] = 29.96,
            ["A3s_KK"] = 29.6,
            ["A3o_KK"] = 28.77,
            ["A3s_QQ"] = 29.93,
            ["A3o_QQ"] = 29.08,
            ["A3s_JJ"] = 30.21,
            ["A3o_JJ"] = 29.35,
            ["A3s_TT"] = 30.47,
            ["A3o_TT"] = 29.6,
            ["A2s_KK"] = 29.25,
            ["A2o_KK"] = 28.41,
            ["A2s_QQ"] = 29.58,
            ["A2o_QQ"] = 28.73,
            ["A2s_JJ"] = 29.87,
            ["A2o_JJ"] = 29.01,
            ["A2s_TT"] = 30.13,
            ["A2o_TT"] = 29.25,
            ["AKs_AQs"] = 70.51,
            ["AKs_AQo"] = 71.43,
            ["AKo_AQs"] = 69.6,
            ["AKo_AQo"] = 70.52,
            ["AKs_AJs"] = 71.05,
            ["AKs_AJo"] = 71.97,
            ["AKo_AJs"] = 70.15,
            ["AKo_AJo"] = 71.07,
            ["AKs_ATs"] = 71.53,
            ["AKs_ATo"] = 72.46,
            ["AKo_ATs"] = 70.64,
            ["AKo_ATo"] = 71.56,
            ["AQs_AJs"] = 69.78,
            ["AQs_AJo"] = 70.72,
            ["AQo_AJs"] = 68.86,
            ["AQo_AJo"] = 69.8,
            ["AQs_ATs"] = 70.33,
            ["AQs_ATo"] = 71.27,
            ["AQo_ATs"] = 69.42,
            ["AQo_ATo"] = 70.36,
            ["AJs_ATs"] = 69.01,
            ["AJs_ATo"] = 69.96,
            ["AJo_ATs"] = 68.08,
            ["AJo_ATo"] = 69.03,
            ["KQs_KJs"] = 69.3,
            ["KQs_KJo"] = 70.24,
            ["KQo_KJs"] = 68.38,
            ["KQo_KJo"] = 69.32,
            ["KQs_KTs"] = 69.85,
            ["KQs_KTo"] = 70.8,
            ["KQo_KTs"] = 68.93,
            ["KQo_KTo"] = 69.88,
            ["KJs_KTs"] = 68.51,
            ["KJs_KTo"] = 69.48,
            ["KJo_KTs"] = 67.58,
            ["KJo_KTo"] = 68.54,
            ["AKs_KQs"] = 72.12,
            ["AKs_KQo"] = 73.03,
            ["AKo_KQs"] = 71.23,
            ["AKo_KQo"] = 72.14,
            ["AKs_KJs"] = 72.57,
            ["AKs_KJo"] = 73.48,
            ["AKo_KJs"] = 71.68,
            ["AKo_KJo"] = 72.6,
            ["AQs_QJs"] = 71.36,
            ["AQs_QJo"] = 72.29,
            ["AQo_QJs"] = 70.45,
            ["AQo_QJo"] = 71.38,
            ["AJs_JTs"] = 70.51,
            ["AJs_JTo"] = 71.45,
            ["AJo_JTs"] = 69.59,
            ["AJo_JTo"] = 70.53,
            ["KQs_QJs"] = 71.93,
            ["KQs_QJo"] = 72.85,
            ["KQo_QJs"] = 71.03,
            ["KQo_QJo"] = 71.95,
        };
    }
}

public record Card(char Rank, char Suit)
{
    public override string ToString() => $"{Rank}{Suit}";
}

public class EquityResult
{
    public double HeroEquity { get; set; }
    public double VillainEquity { get; set; }
    public double TieEquity { get; set; }
}
