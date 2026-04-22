package lt.solisnumus.poker.evaluator;

public class Card {
    private final short STEP = 4;
    private final short[] suitMask = {3825, 3790, 3310, 12014};
    private final short[] suitValues = {1, 2, 4, 8, 16, 32, 64, 128, 240, 464, 896, 1728, 3328};
    private final int[] faceValues = {0, 1, 5, 22, 98, 453, 2031, 8698, 22854, 83661, 262349, 636345, 1479181};

    public final long suit;
    public final int value;
    public final short mask;
    public final long hash;

    public Card(final int card) {
        suit = suitValues[card / STEP];
        value = faceValues[card / STEP];
        mask = suitMask[card % STEP];
        hash = suit << (card % STEP) * 16;
    }
}
