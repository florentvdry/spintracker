package spintracker.data.migrations

import spintracker.data.Database
import java.sql.Connection

abstract class StatsBackfillService(protected val database: Database) {
    
    abstract val configKey: String
    abstract val description: String
    
    fun isCompleted(): Boolean {
        val conn = database.getConnection()
        try {
            val rs = conn.prepareStatement(
                "SELECT value FROM config WHERE key = ?"
            ).apply { setString(1, configKey) }.executeQuery()
            return rs.next() && rs.getString(1) == "true"
        } finally {
            conn.close()
        }
    }
    
    fun markCompleted() {
        database.useTransaction { conn ->
            conn.prepareStatement(
                "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)"
            ).apply {
                setString(1, configKey)
                setString(2, "true")
                executeUpdate()
            }.close()
        }
    }
    
    fun getHandsNeedingBackfill(columnName: String): List<Pair<Long, String>> {
        val conn = database.getConnection()
        val hands = mutableListOf<Pair<Long, String>>()
        try {
            val sql = """
                SELECT DISTINCT ph.hand_id, hh.history
                FROM player_hands ph
                JOIN hand_histories hh ON ph.hand_id = hh.hand_id
                WHERE ph.$columnName IS NULL 
                   OR ph.$columnName = 0
                LIMIT 1000
            """
            val rs = conn.createStatement().executeQuery(sql)
            while (rs.next()) {
                hands.add(rs.getLong(1) to rs.getString(2))
            }
            return hands
        } finally {
            conn.close()
        }
    }
    
    abstract fun runBackfill()
}
