import java.sql.DriverManager

fun main() {
    val url = "jdbc:postgresql://localhost:5432/PT4_2026_01_02_024559"
    val user = "postgres"
    val password = "dbpass"
    
    try {
        Class.forName("org.postgresql.Driver")
        val conn = DriverManager.getConnection(url, user, password)
        println("Connected successfully!")
        
        // Get all tables
        val meta = conn.metaData
        val tables = meta.getTables(null, null, "%", arrayOf("TABLE"))
        
        println("\n=== TABLES ===")
        while (tables.next()) {
            val tableName = tables.getString("TABLE_NAME")
            println(tableName)
        }
        tables.close()
        
        // Get detailed schema for each table
        val tableList = meta.getTables(null, null, "%", arrayOf("TABLE"))
        while (tableList.next()) {
            val tableName = tableList.getString("TABLE_NAME")
            if (tableName.startsWith("pg_") || tableName.startsWith("sql_")) continue
            
            println("\n=== TABLE: $tableName ===")
            
            // Get columns
            val columns = meta.getColumns(null, null, tableName, "%")
            while (columns.next()) {
                val colName = columns.getString("COLUMN_NAME")
                val colType = columns.getString("TYPE_NAME")
                val colSize = columns.getInt("COLUMN_SIZE")
                val nullable = columns.getInt("NULLABLE") == 1
                val defaultVal = columns.getString("COLUMN_DEF")
                println("  $colName: $colType(${if(colSize>0) colSize else ""}) ${if(!nullable) "NOT NULL" else ""} ${if(defaultVal!=null) "DEFAULT $defaultVal" else ""}")
            }
            columns.close()
            
            // Get primary keys
            val pkeys = meta.getPrimaryKeys(null, null, tableName)
            val pkCols = mutableListOf<String>()
            while (pkeys.next()) {
                pkCols.add(pkeys.getString("COLUMN_NAME"))
            }
            pkeys.close()
            if (pkCols.isNotEmpty()) {
                println("  PRIMARY KEY: (${pkCols.joinToString(", ")})")
            }
            
            // Get indexes
            val indexes = meta.getIndexInfo(null, null, tableName, false, false)
            val indexMap = mutableMapOf<String, MutableList<String>>()
            while (indexes.next()) {
                val indexName = indexes.getString("INDEX_NAME")
                val colName = indexes.getString("COLUMN_NAME")
                if (indexName != null && colName != null) {
                    indexMap.getOrPut(indexName) { mutableListOf() }.add(colName)
                }
            }
            indexes.close()
            indexMap.forEach { (name, cols) ->
                println("  INDEX $name: (${cols.joinToString(", ")})")
            }
        }
        tableList.close()
        
        conn.close()
    } catch (e: Exception) {
        println("Error: ${e.message}")
        e.printStackTrace()
    }
}
