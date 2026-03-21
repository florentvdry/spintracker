namespace SpinTrackerBackend.Engines.PokerStove;

using Card = HoldemPoker.Cards.Card;
using HoldEmHandEvaluator = HoldemPoker.Evaluator.HoldemHandEvaluator;

public static class PokerStoveHandEvaluator
{
    private const int MaxRanking = 7463;
    private static readonly ThreadLocal<Card[]> s_cardBuffer = new(() => new Card[7]);

    [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.AggressiveInlining)]
    public static int Evaluate7Cards(int c1, int c2, int c3, int c4, int c5, int c6, int c7)
    {
        var buffer = s_cardBuffer.Value!;
        buffer[0] = (byte)c1;
        buffer[1] = (byte)c2;
        buffer[2] = (byte)c3;
        buffer[3] = (byte)c4;
        buffer[4] = (byte)c5;
        buffer[5] = (byte)c6;
        buffer[6] = (byte)c7;

        int ranking = HoldEmHandEvaluator.GetHandRanking(buffer);
        return MaxRanking - ranking;
    }

    public static (int heroScore, int villainScore) EvaluateHeroVsVillain(
        int hc1, int hc2, int vc1, int vc2, 
        int b1, int b2, int b3, int b4, int b5)
    {
        var buffer = s_cardBuffer.Value!;
        byte cb1 = (byte)b1, cb2 = (byte)b2, cb3 = (byte)b3, cb4 = (byte)b4, cb5 = (byte)b5;
        byte h1 = (byte)hc1, h2 = (byte)hc2, v1 = (byte)vc1, v2 = (byte)vc2;

        buffer[2] = cb1;
        buffer[3] = cb2;
        buffer[4] = cb3;
        buffer[5] = cb4;
        buffer[6] = cb5;

        buffer[0] = h1;
        buffer[1] = h2;
        int heroRanking = HoldEmHandEvaluator.GetHandRanking(buffer);
        int heroScore = MaxRanking - heroRanking;

        buffer[0] = v1;
        buffer[1] = v2;
        int villainRanking = HoldEmHandEvaluator.GetHandRanking(buffer);
        int villainScore = MaxRanking - villainRanking;

        return (heroScore, villainScore);
    }

    public static (int heroScore, int villainScore) EvaluateHeroVsVillain5(
        int hc1, int hc2, int vc1, int vc2, 
        int c1, int c2, int c3, int c4, int c5)
    {
        var buffer = s_cardBuffer.Value!;
        
        buffer[2] = (byte)c1;
        buffer[3] = (byte)c2;
        buffer[4] = (byte)c3;
        buffer[5] = (byte)c4;
        buffer[6] = (byte)c5;

        buffer[0] = (byte)hc1;
        buffer[1] = (byte)hc2;
        int heroRanking = HoldEmHandEvaluator.GetHandRanking(buffer);
        int heroScore = MaxRanking - heroRanking;

        buffer[0] = (byte)vc1;
        buffer[1] = (byte)vc2;
        int villainRanking = HoldEmHandEvaluator.GetHandRanking(buffer);
        int villainScore = MaxRanking - villainRanking;

        return (heroScore, villainScore);
    }

    [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.AggressiveInlining)]
    public static int EvaluateHandOnBoard5(int h1, int h2, int c1, int c2, int c3, int c4, int c5)
    {
        var buffer = s_cardBuffer.Value!;
        buffer[0] = (byte)h1;
        buffer[1] = (byte)h2;
        buffer[2] = (byte)c1;
        buffer[3] = (byte)c2;
        buffer[4] = (byte)c3;
        buffer[5] = (byte)c4;
        buffer[6] = (byte)c5;
        return MaxRanking - HoldEmHandEvaluator.GetHandRanking(buffer);
    }

    [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.AggressiveInlining)]
    public static int EvaluateHandOnBoard(int h1, int h2, int b1, int b2, int b3, int b4, int b5)
    {
        var buffer = s_cardBuffer.Value!;
        buffer[0] = (byte)h1;
        buffer[1] = (byte)h2;
        buffer[2] = (byte)b1;
        buffer[3] = (byte)b2;
        buffer[4] = (byte)b3;
        buffer[5] = (byte)b4;
        buffer[6] = (byte)b5;
        return MaxRanking - HoldEmHandEvaluator.GetHandRanking(buffer);
    }
}
