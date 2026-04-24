package spintracker.services

import spintracker.models.*
import spintracker.parsers.ParsedHand
import spintracker.parsers.ParsedPlayer
import java.util.regex.Pattern
import kotlin.math.max
import kotlin.math.min

class AnalyticsService(private val equityService: EquityService) {
    
    data class HandAnalytics(
        val handId: String,
        val playerName: String,
        val evChips: Double?,
        val cevContribution: Double
    )
    
    /**
     * Calculates analytics for a parsed hand, focusing on EV for all-in situations.
     * Ported from .NET AnalyticsCalculator.cs
     */
    fun calculateHandAnalytics(hand: ParsedHand, heroName: String): HandAnalytics? {
        val hero = hand.players.find { it.name == heroName || it.isHero } ?: return null
        
        val heroProfit = hero.winnings - hero.investment
        val isShowdown = hero.wentToShowdown
        
        val heroAllIn = hero.isAllIn
        var villainAllIn = false
        var hasVillainCards = false
        var anyAllIn = heroAllIn
        
        for (p in hand.players) {
            if (!p.isHero) {
                if (p.isAllIn) villainAllIn = true
                if (p.cards != null) hasVillainCards = true
            }
            if (p.isAllIn) anyAllIn = true
        }
        
        val isRiverAllIn = hand.allInStreet?.uppercase() == "RIVER"
        val shouldCalculateEv = isShowdown && anyAllIn && hasVillainCards && !isRiverAllIn
        
        var evChips: Double? = null
        var cevContribution = 0.0
        
        if (shouldCalculateEv && !hasSideAction(hand)) {
            try {
                // Multiway logic
                val heroCards = hero.cards ?: return null
                
                // Filter active players (Hero + Villains with cards who didn't fold)
                val activePlayers = hand.players.filter { it.cards != null && !it.folded }
                
                if (activePlayers.none { it.name == hero.name }) {
                    // Hero folded or has no cards recorded
                    return HandAnalytics(hand.id, hero.name, null, 0.0)
                }
                
                // Sort active players by investment (asc)
                val sortedPlayers = activePlayers.sortedBy { it.investment }
                
                var totalEv = 0.0
                var contestedInvestment = 0.0
                var currentLevel = 0.0
                
                val board = getBoardAtAllIn(hand)
                
                val success = run sliceLoop@{
                    for (i in sortedPlayers.indices) {
                        val p = sortedPlayers[i]
                        val investment = p.investment
                        
                        if (investment <= currentLevel) continue
                        
                        val step = investment - currentLevel
                        
                        // Calculate Pot for this step (Side Pot or Main Pot slice)
                        var stepPot = 0.0
                        for (player in hand.players) {
                            // Every player contributes to this step up to their investment cap
                            val contribution = max(0.0, min(step, player.investment - currentLevel))
                            stepPot += contribution
                        }
                        
                        if (stepPot <= 0.01) continue
                        
                        // Who competes for this pot?
                        // All activePlayers with Investment >= investment
                        val competingPlayers = sortedPlayers.subList(i, sortedPlayers.size)
                        
                        // Check if Hero is competing in this slice
                        val heroInSlice = competingPlayers.any { it.name == hero.name }
                        if (heroInSlice) {
                            val villainsInSlice = competingPlayers.filter { it.name != hero.name }
                            
                            if (villainsInSlice.isEmpty()) {
                                // Uncontested side pot slice (Hero vs folded dead money)
                                // If any folder contributed voluntarily, skip EV for the whole hand
                                val hasVoluntaryFolder = hand.players.any { p2 ->
                                    p2.name != hero.name && p2.investment > currentLevel && hasVoluntaryAction(p2, hand)
                                }
                                if (hasVoluntaryFolder) return@sliceLoop false
                            } else {
                                val villainCardsList = villainsInSlice.mapNotNull { it.cards }
                                val deadCardsList = hand.players
                                    .filter { it.cards != null && it.name != hero.name && !competingPlayers.contains(it) }
                                    .mapNotNull { it.cards }
                                
                                val equityResult = equityService.calculateMultiwayEquity(
                                    heroCards, 
                                    villainCardsList, 
                                    board, 
                                    deadCardsList.joinToString(" ")
                                )
                                
                                totalEv += equityResult.win * stepPot
                                contestedInvestment += step
                            }
                        }
                        
                        currentLevel = investment
                    }
                    true
                }

                if (success) {
                    evChips = Math.round((totalEv - contestedInvestment) * 100.0) / 100.0
                    cevContribution = Math.round((evChips!! - (hero.winnings - hero.investment)) * 100.0) / 100.0
                } else {
                    evChips = null
                    cevContribution = 0.0
                }
                
            } catch (e: Exception) {
                // Fallback to null (actual profit)
                evChips = null
                cevContribution = 0.0
            }
        }
        
        return HandAnalytics(
            handId = hand.id,
            playerName = hero.name,
            evChips = evChips,
            cevContribution = cevContribution
        )
    }
    
    private fun hasVoluntaryAction(player: ParsedPlayer, hand: ParsedHand): Boolean {
        // Blinds are not voluntary
        // We need to check if they called, bet or raised
        val actions = listOf(hand.preflopAction, hand.flopAction, hand.turnAction, hand.riverAction)
        for (actionText in actions) {
            val lines = actionText.split("\n")
            for (line in lines) {
                if (line.contains(player.name, ignoreCase = true)) {
                    val lower = line.lowercase()
                    if (lower.contains("calls") || lower.contains("bets") || lower.contains("raises")) {
                        return true
                    }
                }
            }
        }
        return false
    }

    private fun hasSideAction(hand: ParsedHand): Boolean {
        val allInStreet = hand.allInStreet ?: return false
        
        val streetsToCheck = when (allInStreet.uppercase()) {
            "PREFLOP", "HOLE_CARDS" -> listOf(hand.flopAction, hand.turnAction, hand.riverAction)
            "FLOP" -> listOf(hand.turnAction, hand.riverAction)
            "TURN" -> listOf(hand.riverAction)
            else -> emptyList()
        }
        
        for (actionText in streetsToCheck) {
            if (actionText != null && hasPlayerAction(actionText)) {
                return true
            }
        }
        
        return false
    }

    private fun hasPlayerAction(actionText: String): Boolean {
        val lower = actionText.lowercase()
        return lower.contains("bets") || 
               lower.contains("calls") || 
               lower.contains("raises") || 
               lower.contains("checks")
    }

    private fun getBoardAtAllIn(hand: ParsedHand): String {
        val street = hand.allInStreet ?: return ""
        
        return when (street.uppercase()) {
            "PREFLOP", "HOLE_CARDS" -> ""
            "FLOP" -> hand.flop ?: ""
            "TURN" -> listOfNotNull(hand.flop, hand.turn).joinToString(" ")
            "RIVER" -> listOfNotNull(hand.flop, hand.turn, hand.river).joinToString(" ")
            else -> ""
        }
    }
}
