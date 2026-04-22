package lt.solisnumus.poker.evaluator;

import java.io.DataInputStream;

class DataLoader {

    private static DataLoader instance;

    public final short[] flushes;
    public final short[] nonflushes;

    private DataLoader() {
        flushes = loadResource("7-card-flush-lookup.bin", 6849);
        nonflushes = loadResource("7-card-non-flush-lookup.bin", 7825760);
    }

    public static DataLoader getInstance() {
        if(instance == null){
            synchronized (DataLoader.class) {
                if(instance == null){
                    instance = new DataLoader();
                }
            }
        }
        return instance;
    }

    private short[] loadResource(String filename, int size) {
        ClassLoader classloader = Thread.currentThread().getContextClassLoader();
        DataInputStream is = new DataInputStream(classloader.getResourceAsStream(filename));

        short[] lookup = new short[size];
        try {
            for (int i = 0; i < size; i++) {
                lookup[i] = (short) is.readUnsignedShort();
            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        finally {
            try {
              is.close();
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }

        return lookup;
    }
}
