package spintracker.data

import java.sql.DriverManager

class StatsCacheRepository(private val connectionString: String) {
    
    data class CachedStats(
        val playerId: Long,
        val vpip: Double,
        val pfr: Double,
        val threeBet: Double,
        val cbetFlop: Double,
        val cbetTurn: Double,
        val cbetRiver: Double,
        val handsCount: Int,
        val lastUpdated: String
    )
    
    fun getStats(playerId: Long): CachedStats? {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement("""
                SELECT player_id, vpip, pfr, three_bet, cbet_flop, cbet_turn, cbet_river, 
                       hands_count, last_updated
                FROM player_stats_cache
                WHERE player_id = ?
            """)
            stmt.setLong(1, playerId)
            val rs = stmt.executeQuery()
            return if (rs.next()) {
                CachedStats(
                    playerId = rs.getLong(1),
                    vpip = rs.getDouble(2),
                    pfr = rs.getDouble(3),
                    threeBet = rs.getDouble(4),
                    cbetFlop = rs.getDouble(5),
                    cbetTurn = rs.getDouble(6),
                    cbetRiver = rs.getDouble(7),
                    handsCount = rs.getInt(8),
                    lastUpdated = rs.getString(9) ?: ""
                )
            } else null
        } finally {
            conn.close()
        }
    }
    
    fun updateStats(
        playerId: Long,
        vpip: Double,
        pfr: Double,
        threeBet: Double,
        cbetFlop: Double,
        cbetTurn: Double,
        cbetRiver: Double,
        handsCount: Int
    ) {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement("""
                INSERT OR REPLACE INTO player_stats_cache 
                (player_id, vpip, pfr, three_bet, cbet_flop, cbet_turn, cbet_river, hands_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """)
            stmt.setLong(1, playerId)
            stmt.setDouble(2, vpip)
            stmt.setDouble(3, pfr)
            stmt.setDouble(4, threeBet)
            stmt.setDouble(5, cbetFlop)
            stmt.setDouble(6, cbetTurn)
            stmt.setDouble(7, cbetRiver)
            stmt.setInt(8, handsCount)
            stmt.executeUpdate()
        } finally {
            conn.close()
        }
    }
    
    fun refreshAllStats(database: Database) {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val rs = conn.createStatement().executeQuery("""
                SELECT 
                    player_id,
                    COUNT(*) as total_hands,
                    SUM(CASE WHEN flg_vpip = 1 THEN 1 ELSE 0 END) as vpip_hands,
                    SUM(CASE WHEN flg_pfr = 1 THEN 1 ELSE 0 END) as pfr_hands,
                    SUM(CASE WHEN flg_3bet = 1 THEN 1 ELSE 0 END) as three_bet_hands,
                    SUM(CASE WHEN flg_cbet_flop = 1 THEN 1 ELSE 0 END) as cbet_flop_hands,
                    SUM(CASE WHEN flg_cbet_turn = 1 THEN 1 ELSE 0 END) as cbet_turn_hands,
                    SUM(CASE WHEN flg_cbet_river = 1 THEN 1 ELSE 0 END) as cbet_river_hands
                FROM player_hands
                GROUP BY player_id
            """)
            
            while (rs.next()) {
                val playerId = rs.getLong(1)
                val total = rs.getInt(2)
                if (total > 0) {
                    updateStats(
                        playerId = playerId,
                        vpip = rs.getInt(3).toDouble() / total * 100.0,
                        pfr = rs.getInt(4).toDouble() / total * 100.0,
                        threeBet = rs.getInt(5).toDouble() / total * 100.0,
                        cbetFlop = rs.getInt(6).toDouble() / total * 100.0,
                        cbetTurn = rs.getInt(7).toDouble() / total * 100.0,
                        cbetRiver = rs.getInt(8).toDouble() / total * 100.0,
                        handsCount = total
                    )
                }
            }
        } finally {
            conn.close()
        }
    }
    
    fun clearCache(playerId: Long) {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement("DELETE FROM player_stats_cache WHERE player_id = ?")
            stmt.setLong(1, playerId)
            stmt.executeUpdate()
        } finally {
            conn.close()
        }
    }
    
    fun clearAllCache() {
        val conn = DriverManager.getConnection(connectionString)
        try {
            conn.createStatement().execute("DELETE FROM player_stats_cache")
        } finally {
            conn.close()
        }
    }
}
