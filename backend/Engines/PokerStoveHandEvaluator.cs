namespace SpinTrackerBackend.Engines.PokerStove;

using Card = HoldemPoker.Cards.Card;
using HoldEmHandEvaluator = HoldemPoker.Evaluator.HoldemHandEvaluator;

public static class PokerStoveHandEvaluator
{
    private const int MaxRanking = 7463;
    private static readonly ThreadLocal<Card[]> s_cardBuffer = new(() => new Card[7]);

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
}
