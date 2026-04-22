package lt.solisnumus.poker.evaluator;

import java.util.regex.Pattern;

public class Runner {
    private final static int ITERATIONS = 20;
    private final static Pattern NUMBER = Pattern.compile("\\d+");

    public static void main(String[] args) {
        runEvaluation(getIterationCount(args));
    }

    private static void runEvaluation(int times) {
        for (int i = 0; i < times; i++) {
            long startTime = System.currentTimeMillis();
            long checksum = evaluateCombinations();
            System.out.println("Checksum: " + checksum + " Time: " + (System.currentTimeMillis() - startTime));
        }
    }

    private static long evaluateCombinations() {
        long checksum = 0;
        for (int i1 = 0; i1 < 52; i1++)
            for (int i2 = i1 + 1; i2 < 52; i2++)
                for (int i3 = i2 + 1; i3 < 52; i3++)
                    for (int i4 = i3 + 1; i4 < 52; i4++)
                        for (int i5 = i4 + 1; i5 < 52; i5++)
                            for (int i6 = i5 + 1; i6 < 52; i6++)
                                for (int i7 = i6 + 1; i7 < 52; i7++)
                                    checksum += Evaluator.getValue(i1, i2, i3, i4, i5, i6, i7);
        return checksum;
    }

    private static int getIterationCount(String[] args) {
        return args.length != 0 && NUMBER.matcher(args[0]).matches() ? Integer.parseInt(args[0]) : ITERATIONS;
    }
}
