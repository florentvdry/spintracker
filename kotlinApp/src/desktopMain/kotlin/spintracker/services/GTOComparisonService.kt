package spintracker.services

import spintracker.models.BoardTexture
import spintracker.models.Hand

data class GTOComparison(
    val playerAction: String,
    val gtoRecommendation: String,
    val deviationScore: Double,
    val explanation: String
)

object GTOComparisonService {
    
    fun compare(hand: Hand, street: String): GTOComparison {
        val handStrength = calculateHandStrength(hand, street)
        val positionFactor = getPositionFactor(hand.heroPosition, hand.playerCount)
        val stackDepth = getStackDepth(hand)
        val boardTexture = getBoardTexture(hand, street)
        
        val gtoAction = determineGTOAction(handStrength, positionFactor, stackDepth, boardTexture, street)
        val playerAction = inferPlayerAction(hand, street)
        val deviationScore = calculateDeviation(playerAction, gtoAction, handStrength)
        val explanation = buildExplanation(handStrength, positionFactor, stackDepth, boardTexture, gtoAction)
        
        return GTOComparison(
            playerAction = playerAction,
            gtoRecommendation = gtoAction,
            deviationScore = deviationScore,
            explanation = explanation
        )
    }
    
    private fun calculateHandStrength(hand: Hand, street: String): Double {
        val holeCards = extractHoleCards(hand)
        if (holeCards.isEmpty()) return 0.5
        
        val baseStrength = evaluateHoleCards(holeCards)
        val boardStrength = evaluateBoardConnection(hand, street, holeCards)
        
        return (baseStrength * 0.6 + boardStrength * 0.4).coerceIn(0.0, 1.0)
    }
    
    private fun extractHoleCards(hand: Hand): String {
        val rawContent = hand.rawContent
        val regex = """\[(\w{2,4})\]""".toRegex()
        return regex.find(rawContent)?.groupValues?.get(1) ?: ""
    }
    
    private fun evaluateHoleCards(holeCards: String): Double {
        if (holeCards.length < 2) return 0.5
        
        val rank1 = getRankValue(holeCards[0])
        val rank2 = getRankValue(holeCards[1])
        val suited = holeCards.contains("s", ignoreCase = true)
        val paired = rank1 == rank2
        
        var strength = (rank1 + rank2) / 28.0
        
        if (paired) strength += 0.3
        if (suited) strength += 0.05
        if (kotlin.math.abs(rank1 - rank2) == 1) strength += 0.05
        
        return strength.coerceIn(0.0, 1.0)
    }
    
    private fun evaluateBoardConnection(hand: Hand, street: String, holeCards: String): Double {
        val board = when (street.lowercase()) {
            "flop" -> hand.flop
            "turn" -> hand.turn
            "river" -> hand.river
            else -> null
        } ?: return 0.5
        
        val boardCards = Card.parse(board)
        val holeCardList = Card.parse(holeCards)
        
        if (boardCards.isEmpty() || holeCardList.isEmpty()) return 0.5
        
        val allCards = holeCardList + boardCards
        val evalResult = HandEvaluator.evaluate(allCards)
        
        return when (evalResult.rank) {
            HandEvaluator.HandRank.HIGH_CARD -> 0.2
            HandEvaluator.HandRank.PAIR -> 0.4
            HandEvaluator.HandRank.TWO_PAIR -> 0.6
            HandEvaluator.HandRank.THREE_OF_A_KIND -> 0.75
            HandEvaluator.HandRank.STRAIGHT -> 0.85
            HandEvaluator.HandRank.FLUSH -> 0.9
            HandEvaluator.HandRank.FULL_HOUSE -> 0.95
            HandEvaluator.HandRank.FOUR_OF_A_KIND -> 0.98
            HandEvaluator.HandRank.STRAIGHT_FLUSH -> 1.0
        }
    }
    
    private fun getPositionFactor(heroPosition: Int, playerCount: Int): Double {
        if (playerCount <= 1) return 0.5
        
        val positionNormalized = (heroPosition - 1).toDouble() / (playerCount - 1).toDouble()
        
        return when {
            positionNormalized >= 0.75 -> 1.0
            positionNormalized >= 0.5 -> 0.75
            positionNormalized >= 0.25 -> 0.5
            else -> 0.25
        }
    }
    
    private fun getStackDepth(hand: Hand): Double {
        val bb = hand.bigBlind
        if (bb <= 0) return 1.0
        
        val effectiveStack = 100.0
        val stackInBB = effectiveStack / bb
        
        return when {
            stackInBB <= 10 -> 0.2
            stackInBB <= 20 -> 0.4
            stackInBB <= 50 -> 0.6
            stackInBB <= 100 -> 0.8
            else -> 1.0
        }
    }
    
    private fun getBoardTexture(hand: Hand, street: String): BoardTexture {
        val board = when (street.lowercase()) {
            "flop" -> hand.flop
            "turn" -> hand.turn
            "river" -> hand.river
            else -> null
        } ?: return BoardTexture.DRY
        
        return BoardTextureService.classify(board)
    }
    
    private fun determineGTOAction(
        handStrength: Double,
        positionFactor: Double,
        stackDepth: Double,
        boardTexture: BoardTexture,
        street: String
    ): String {
        val aggressionScore = calculateAggressionScore(handStrength, positionFactor, stackDepth, boardTexture)
        
        return when (street.lowercase()) {
            "preflop" -> determinePreflopAction(handStrength, positionFactor)
            "flop", "turn", "river" -> determinePostflopAction(aggressionScore, boardTexture, positionFactor)
            else -> "check"
        }
    }
    
    private fun calculateAggressionScore(
        handStrength: Double,
        positionFactor: Double,
        stackDepth: Double,
        boardTexture: BoardTexture
    ): Double {
        var score = handStrength * 0.4 + positionFactor * 0.25 + stackDepth * 0.15
        
        score += when (boardTexture) {
            BoardTexture.DRY -> 0.1
            BoardTexture.MIXED -> 0.0
            BoardTexture.WET -> -0.1
        }
        
        return score.coerceIn(0.0, 1.0)
    }
    
    private fun determinePreflopAction(handStrength: Double, positionFactor: Double): String {
        val combinedScore = handStrength * 0.7 + positionFactor * 0.3
        
        return when {
            combinedScore >= 0.85 -> "raise"
            combinedScore >= 0.70 -> "raise"
            combinedScore >= 0.55 -> "call"
            combinedScore >= 0.40 -> "call"
            else -> "fold"
        }
    }
    
    private fun determinePostflopAction(
        aggressionScore: Double,
        boardTexture: BoardTexture,
        positionFactor: Double
    ): String {
        val combinedScore = aggressionScore * 0.6 + positionFactor * 0.25 + when (boardTexture) {
            BoardTexture.DRY -> 0.15
            BoardTexture.MIXED -> 0.05
            BoardTexture.WET -> -0.05
        }
        
        return when {
            combinedScore >= 0.75 -> "bet"
            combinedScore >= 0.55 -> "bet"
            combinedScore >= 0.40 -> "check"
            combinedScore >= 0.25 -> "check"
            else -> "fold"
        }
    }
    
    private fun inferPlayerAction(hand: Hand, street: String): String {
        val result = hand.result
        val wentToShowdown = hand.wentToShowdown
        
        return when {
            result > 0 && wentToShowdown -> "call"
            result > 0 && !wentToShowdown -> "bet"
            result < 0 -> "fold"
            else -> "check"
        }
    }
    
    private fun calculateDeviation(playerAction: String, gtoAction: String, handStrength: Double): Double {
        if (playerAction == gtoAction) return 0.0
        if (playerAction == "unknown") return 0.5
        
        val actionValues = mapOf(
            "fold" to 0.0,
            "check" to 0.33,
            "call" to 0.66,
            "bet" to 0.85,
            "raise" to 1.0
        )
        
        val playerValue = actionValues[playerAction.lowercase()] ?: 0.5
        val gtoValue = actionValues[gtoAction.lowercase()] ?: 0.5
        
        var deviation = kotlin.math.abs(playerValue - gtoValue)
        
        if (playerAction.lowercase() == "fold" && gtoAction.lowercase() in listOf("bet", "raise")) {
            deviation *= 0.7
        }
        
        if (handStrength > 0.8 && playerAction.lowercase() == "fold") {
            deviation = (deviation + 0.3).coerceAtMost(1.0)
        }
        
        return deviation.coerceIn(0.0, 1.0)
    }
    
    private fun buildExplanation(
        handStrength: Double,
        positionFactor: Double,
        stackDepth: Double,
        boardTexture: BoardTexture,
        gtoAction: String
    ): String {
        val strengthDesc = when {
            handStrength >= 0.8 -> "strong"
            handStrength >= 0.6 -> "moderate"
            handStrength >= 0.4 -> "medium"
            handStrength >= 0.2 -> "weak"
            else -> "very weak"
        }
        
        val positionDesc = when {
            positionFactor >= 0.8 -> "late position"
            positionFactor >= 0.5 -> "middle position"
            else -> "early position"
        }
        
        val textureDesc = when (boardTexture) {
            BoardTexture.DRY -> "dry board"
            BoardTexture.MIXED -> "mixed board"
            BoardTexture.WET -> "wet board"
        }
        
        return "GTO recommends $gtoAction based on $strengthDesc hand strength ($positionDesc) on $textureDesc. " +
               "Stack depth: ${(stackDepth * 100).toInt()}% of 100BB."
    }
    
    private fun getRankValue(rank: Char): Int {
        return when (rank.uppercaseChar()) {
            'A' -> 14
            'K' -> 13
            'Q' -> 12
            'J' -> 11
            'T' -> 10
            '9' -> 9
            '8' -> 8
            '7' -> 7
            '6' -> 6
            '5' -> 5
            '4' -> 4
            '3' -> 3
            '2' -> 2
            else -> 0
        }
    }
}
