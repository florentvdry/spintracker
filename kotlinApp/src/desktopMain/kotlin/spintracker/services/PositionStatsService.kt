package spintracker.services

import java.sql.DriverManager

data class PositionStats(
    val position: String,
    val steal3bet: Double = 0.0,
    val foldToCbet: Double = 0.0,
    val call4bet: Double = 0.0,
    val call5bet: Double = 0.0,
    val wtsd: Double = 0.0,
    val w$sd: Double = 0.0,
    val totalHands: Int = 0
)

class PositionStatsService(private val connectionString: String) {

    fun calculateForPlayer(playerId: Long, position: String): PositionStats {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement("""
                SELECT 
                    COUNT(*) as total_hands,
                    SUM(CASE WHEN flg_3bet = 1 AND position IN ('BTN', 'CO', 'HJ') THEN 1 ELSE 0 END) as steal_3bet,
                    SUM(CASE WHEN flg_cbet_flop_def_opp = 1 THEN 1 ELSE 0 END) as cbet_def_opp,
                    SUM(CASE WHEN flg_cbet_flop_def_opp = 1 AND went_to_showdown = 0 AND position NOT IN (SELECT aggressor_position FROM player_hands WHERE hand_id = player_hands.hand_id AND flg_is_aggressor = 1) THEN 1 ELSE 0 END) as fold_to_cbet,
                    SUM(CASE WHEN preflop_action LIKE '%calls%' THEN 1 ELSE 0 END) as calls,
                    SUM(CASE WHEN preflop_action LIKE '%4-bet%' OR preflop_action LIKE '%calls%' THEN 1 ELSE 0 END) as call_4bet,
                    SUM(CASE WHEN preflop_action LIKE '%5-bet%' OR preflop_action LIKE '%calls%' THEN 1 ELSE 0 END) as call_5bet,
                    SUM(CASE WHEN went_to_showdown = 1 THEN 1 ELSE 0 END) as wtsd,
                    SUM(CASE WHEN went_to_showdown = 1 AND won_at_showdown = 1 THEN 1 ELSE 0 END) as w$sd
                FROM player_hands
                WHERE player_id = ? AND position = ?
            """)
            stmt.setLong(1, playerId)
            stmt.setString(2, position)
            val rs = stmt.executeQuery()

            return if (rs.next()) {
                val total = rs.getInt(1)
                val steal3bet = if (total > 0) rs.getDouble(2) / total * 100.0 else 0.0
                val foldToCbet = if (rs.getInt(3) > 0) rs.getInt(5).toDouble() / rs.getInt(3) * 100.0 else 0.0
                val wtsd = if (total > 0) rs.getDouble(8) / total * 100.0 else 0.0
                val w$sd = if (rs.getInt(8) > 0) rs.getDouble(9) / rs.getInt(8) * 100.0 else 0.0

                PositionStats(
                    position = position,
                    steal3bet = steal3bet,
                    foldToCbet = foldToCbet,
                    call4bet = if (total > 0) rs.getDouble(6) / total * 100.0 else 0.0,
                    call5bet = if (total > 0) rs.getDouble(7) / total * 100.0 else 0.0,
                    wtsd = wtsd,
                    w$sd = w$sd,
                    totalHands = total
                )
            } else {
                PositionStats(position = position)
            }
        } finally {
            conn.close()
        }
    }

    fun calculateAllPositionsForPlayer(playerId: Long): Map<String, PositionStats> {
        val positions = listOf("BTN", "SB", "BB", "CO", "HJ", "UTG")
        return positions.associateWith { pos ->
            calculateForPlayer(playerId, pos)
        }
    }
}