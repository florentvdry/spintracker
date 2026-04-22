package lt.solisnumus.poker.evaluator;

import java.util.stream.IntStream;

public class Evaluator {

    private static final DataLoader data = DataLoader.getInstance();
    private static final short[] flushes = data.flushes;
    private static final short[] nonflushes = data.nonflushes;
    private static final Card[] cards = IntStream.range(0, 52)
                .mapToObj(i -> new Card(i))
                .toArray(size -> new Card[size]);

    public static short getValue(int c1, int c2, int c3, int c4, int c5, int c6, int c7) {
        int flush = (cards[c1].mask + cards[c2].mask + cards[c3].mask + cards[c4].mask + cards[c5].mask + cards[c6].mask + cards[c7].mask) & 0x11110;
        if (flush == 0) {
            return nonflushes[cards[c1].value + cards[c2].value + cards[c3].value + cards[c4].value + cards[c5].value + cards[c6].value + cards[c7].value];
        } else {
            int shift = Integer.numberOfTrailingZeros(flush >> 4) << 2;
            return flushes[(int) (((cards[c1].hash >> shift) + (cards[c2].hash >> shift) + (cards[c3].hash >> shift) + (cards[c4].hash >> shift) + (cards[c5].hash >> shift) + (cards[c6].hash >> shift) + (cards[c7].hash >> shift)) & 0x1FFF)];
        }
    }

    public static short getValue(Card c1, Card c2, Card c3, Card c4, Card c5, Card c6, Card c7) {
        int flush = (c1.mask + c2.mask + c3.mask + c4.mask + c5.mask + c6.mask + c7.mask) & 0x11110;
        if (flush == 0) {
            return nonflushes[c1.value + c2.value + c3.value + c4.value + c5.value + c6.value + c7.value];
        } else {
            int shift = Integer.numberOfTrailingZeros(flush >> 4) << 2;
            return flushes[(int) (((c1.hash >> shift) + (c2.hash >> shift) + (c3.hash >> shift) + (c4.hash >> shift) + (c5.hash >> shift) + (c6.hash >> shift) + (c7.hash >> shift)) & 0x1FFF)];
        }
    }
}
