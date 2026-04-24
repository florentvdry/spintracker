package spintracker.services

import java.sql.DriverManager
import spintracker.data.Database

data class Leak(
    val type: String,
    val description: String,
    val impact: Double,
    val recommendation: String
)

object LeakDetectionService {

    private const val MIN_SAMPLE_SIZE = 100

    fun detectLeaks(playerId: Long, heroName: String, database: Database): List<Leak> {
        val leaks = mutableListOf<Leak>()
        val conn = database.getConnection()

        try {
            val overallStats = getOverallStats(playerId, conn)
            if (overallStats.totalHands < MIN_SAMPLE_SIZE) {
                return leaks
            }

            val cBetDefenseStats = getCBetDefenseStats(playerId, conn)
            if (cBetDefenseStats.foldToCbetRate > 70.0 && cBetDefenseStats.totalOpps > 50) {
                leaks.add(
                    Leak(
                        type = "Overfolding to c-bets",
                        description = "You're folding to c-bets ${cBetDefenseStats.foldToCbetRate.toInt()}% (typical: 45-55%)",
                        impact = estimateFoldToCbetLoss(cBetDefenseStats),
                        recommendation = "Call more with suited connectors, pairs, and gutshots. Defend wider from big blind."
                    )
                )
            }

            val threeBetStats = getThreeBetStats(playerId, conn)
            if (threeBetStats.threeBetRate < 8.0 && threeBetStats.position == "BTN") {
                leaks.add(
                    Leak(
                        type = "Not 3-betting enough from BTN",
                        description = "You're 3-betting ${threeBetStats.threeBetRate.toInt()}% from BTN (typical: 10-15%)",
                        impact = estimateThreeBetLoss(threeBetStats),
                        recommendation = "3-bet more with suited connectors, broadways, and small pairs. Steal more antes."
                    )
                )
            }

            val LimpStats = getLimpStats(playerId, conn)
            if (LimpStats.limpRate > 20.0) {
                leaks.add(
                    Leak(
                        type = "Too much limping",
                        description = "You're limping ${LimpStats.limpRate.toInt()}% of hands (typical: <10%)",
                        impact = estimateLimpLoss(LimpStats),
                        recommendation = "Raise or fold. Limping loses you equity by not realizing your hand's potential."
                    )
                )
            }

            val callOpenStats = getCallOpenStats(playerId, conn)
            if (callOpenStats.callOpenRate > 25.0) {
                leaks.add(
                    Leak(
                        type = "Calling too wide vs opens",
                        description = "You're calling opens ${callOpenStats.callOpenRate.toInt()}% (typical: 15-20%)",
                        impact = estimateCallOpenLoss(callOpenStats),
                        recommendation = "3-bet or fold more. Calling loses value vs potential 3-bet Bluffers."
                    )
                )
            }

        } finally {
            conn.close()
        }

        return leaks
    }

    private data class OverallStats(val totalHands: Int = 0, val vpip: Double = 0.0)
    private data class CBetDefenseStats(val foldToCbetRate: Double = 0.0, val totalOpps: Int = 0)
    private data class ThreeBetStats(val threeBetRate: Double = 0.0, val position: String = "")
    private data class LimpStats(val limpRate: Double = 0.0)
    private data class CallOpenStats(val callOpenRate: Double = 0.0)

    private fun getOverallStats(playerId: Long, conn: java.sql.Connection): OverallStats {
        val stmt = conn.prepareStatement("""
            SELECT COUNT(*) as total_hands,
                   AVG(CASE WHEN flg_vpip = 1 THEN 100.0 ELSE 0.0 END) as vpip
            FROM player_hands
            WHERE player_id = ?
        """)
        stmt.setLong(1, playerId)
        val rs = stmt.executeQuery()
        return if (rs.next()) {
            OverallStats(
                totalHands = rs.getInt(1),
                vpip = rs.getDouble(2)
            )
        } else {
            OverallStats()
        }
    }

    private fun getCBetDefenseStats(playerId: Long, conn: java.sql.Connection): CBetDefenseStats {
        val stmt = conn.prepareStatement("""
            SELECT 
                COUNT(*) as cbet_opps,
                SUM(CASE WHEN flg_cbet_flop_def_opp = 1 AND went_to_showdown = 0 
                        AND position NOT IN (SELECT position FROM player_hands ph2 
                                           WHERE ph2.hand_id = player_hands.hand_id AND flg_is_aggressor = 1)
                        THEN 1 ELSE 0 END) as folds
            FROM player_hands
            WHERE player_id = ? AND flg_cbet_flop_def_opp = 1
        """)
        stmt.setLong(1, playerId)
        val rs = stmt.executeQuery()
        return if (rs.next()) {
            val total = rs.getInt(1)
            val folds = rs.getInt(2)
            val rate = if (total > 0) folds.toDouble() / total * 100.0 else 0.0
            CBetDefenseStats(foldToCbetRate = rate, totalOpps = total)
        } else {
            CBetDefenseStats()
        }
    }

    private fun getThreeBetStats(playerId: Long, conn: java.sql.Connection): ThreeBetStats {
        val stmt = conn.prepareStatement("""
            SELECT position,
                   COUNT(*) as total_opps,
                   SUM(CASE WHEN flg_3bet = 1 THEN 1 ELSE 0 END) as three_bets
            FROM player_hands
            WHERE player_id = ? AND position = 'BTN' AND flg_open_opp = 1
            GROUP BY position
        """)
        stmt.setLong(1, playerId)
        val rs = stmt.executeQuery()
        return if (rs.next()) {
            val total = rs.getInt(2)
            val threeBets = rs.getInt(3)
            val rate = if (total > 0) threeBets.toDouble() / total * 100.0 else 0.0
            ThreeBetStats(threeBetRate = rate, position = "BTN")
        } else {
            ThreeBetStats(position = "BTN")
        }
    }

    private fun getLimpStats(playerId: Long, conn: java.sql.Connection): LimpStats {
        val stmt = conn.prepareStatement("""
            SELECT 
                COUNT(*) as total_hands,
                SUM(CASE WHEN flg_limp = 1 OR flg_limp_behind = 1 THEN 1 ELSE 0 END) as limps
            FROM player_hands
            WHERE player_id = ? AND flg_vpip = 1
        """)
        stmt.setLong(1, playerId)
        val rs = stmt.executeQuery()
        return if (rs.next()) {
            val total = rs.getInt(1)
            val limps = rs.getInt(2)
            val rate = if (total > 0) limps.toDouble() / total * 100.0 else 0.0
            LimpStats(limpRate = rate)
        } else {
            LimpStats()
        }
    }

    private fun getCallOpenStats(playerId: Long, conn: java.sql.Connection): CallOpenStats {
        val stmt = conn.prepareStatement("""
            SELECT 
                COUNT(*) as total_opps,
                SUM(CASE WHEN preflop_action LIKE '%calls%' THEN 1 ELSE 0 END) as calls
            FROM player_hands
            WHERE player_id = ? 
              AND preflop_action LIKE '%raises%' = 0
              AND flg_vpip = 1
              AND flg_pfr = 0
        """)
        stmt.setLong(1, playerId)
        val rs = stmt.executeQuery()
        return if (rs.next()) {
            val total = rs.getInt(1)
            val calls = rs.getInt(2)
            val rate = if (total > 0) calls.toDouble() / total * 100.0 else 0.0
            CallOpenStats(callOpenRate = rate)
        } else {
            CallOpenStats()
        }
    }

    private fun estimateFoldToCbetLoss(stats: CBetDefenseStats): Double {
        val overFold = (stats.foldToCbetRate - 50.0).coerceAtLeast(0.0)
        return overFold * stats.totalOpps * 0.5
    }

    private fun estimateThreeBetLoss(stats: ThreeBetStats): Double {
        val underRaise = (10.0 - stats.threeBetRate).coerceAtLeast(0.0)
        return underRaise * 10.0
    }

    private fun estimateLimpLoss(stats: LimpStats): Double {
        val overLimp = (stats.limpRate - 10.0).coerceAtLeast(0.0)
        return overLimp * 5.0
    }

    private fun estimateCallOpenLoss(stats: CallOpenStats): Double {
        val overCall = (stats.callOpenRate - 15.0).coerceAtLeast(0.0)
        return overCall * 8.0
    }
}