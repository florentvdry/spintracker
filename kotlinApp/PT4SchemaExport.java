import java.sql.*;

public class PT4SchemaExport {
    public static void main(String[] args) {
        String url = "jdbc:postgresql://localhost:5432/PT4_2026_01_02_024559";
        String user = "postgres";
        String password = "dbpass";
        
        try {
            Class.forName("org.postgresql.Driver");
            Connection conn = DriverManager.getConnection(url, user, password);
            System.out.println("Connected successfully!");
            
            DatabaseMetaData meta = conn.getMetaData();
            
            // Get all tables
            System.out.println("\n=== TABLES ===");
            ResultSet tables = meta.getTables(null, null, "%", new String[]{"TABLE"});
            while (tables.next()) {
                System.out.println(tables.getString("TABLE_NAME"));
            }
            tables.close();
            
            // Get detailed schema
            ResultSet tableList = meta.getTables(null, null, "%", new String[]{"TABLE"});
            while (tableList.next()) {
                String tableName = tableList.getString("TABLE_NAME");
                if (tableName.startsWith("pg_") || tableName.startsWith("sql_")) continue;
                
                System.out.println("\n=== TABLE: " + tableName + " ===");
                
                // Columns
                ResultSet columns = meta.getColumns(null, null, tableName, "%");
                while (columns.next()) {
                    String colName = columns.getString("COLUMN_NAME");
                    String colType = columns.getString("TYPE_NAME");
                    int colSize = columns.getInt("COLUMN_SIZE");
                    boolean nullable = columns.getInt("NULLABLE") == DatabaseMetaData.columnNullable;
                    String defaultVal = columns.getString("COLUMN_DEF");
                    System.out.println("  " + colName + ": " + colType + 
                        (colSize > 0 ? "(" + colSize + ")" : "") + 
                        (nullable ? "" : " NOT NULL") + 
                        (defaultVal != null ? " DEFAULT " + defaultVal : ""));
                }
                columns.close();
                
                // Primary keys
                ResultSet pkeys = meta.getPrimaryKeys(null, null, tableName);
                StringBuilder pkCols = new StringBuilder();
                while (pkeys.next()) {
                    if (pkCols.length() > 0) pkCols.append(", ");
                    pkCols.append(pkeys.getString("COLUMN_NAME"));
                }
                pkeys.close();
                if (pkCols.length() > 0) {
                    System.out.println("  PRIMARY KEY: (" + pkCols + ")");
                }
                
                // Indexes
                ResultSet indexes = meta.getIndexInfo(null, null, tableName, false, false);
                java.util.Map<String, StringBuilder> indexMap = new java.util.HashMap<>();
                while (indexes.next()) {
                    String indexName = indexes.getString("INDEX_NAME");
                    String colName = indexes.getString("COLUMN_NAME");
                    if (indexName != null && colName != null) {
                        indexMap.computeIfAbsent(indexName, k -> new StringBuilder()).append(colName).append(", ");
                    }
                }
                indexes.close();
                for (java.util.Map.Entry<String, StringBuilder> entry : indexMap.entrySet()) {
                    String cols = entry.getValue().toString();
                    if (cols.endsWith(", ")) cols = cols.substring(0, cols.length() - 2);
                    System.out.println("  INDEX " + entry.getKey() + ": (" + cols + ")");
                }
            }
            tableList.close();
            conn.close();
        } catch (Exception e) {
            System.out.println("Error: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
