package spintracker.services

import spintracker.models.PlayerStats

enum class PlayerType { FISH, REG, TAG, LAG, NIT, WHALE, MANIAC }

object PlayerTypingService {
    fun classify(stats: PlayerStats): PlayerType {
        if (stats.handsPlayed < 50) return PlayerType.REG
        
        return when {
            stats.vpip < 0.15 -> PlayerType.NIT
            stats.vpip > 0.50 -> PlayerType.MANIAC
            stats.vpip > 0.35 -> PlayerType.LAG
            stats.pfr > 0.15 -> PlayerType.TAG
            stats.vpip < 0.25 -> PlayerType.REG
            else -> PlayerType.FISH
        }
    }
}