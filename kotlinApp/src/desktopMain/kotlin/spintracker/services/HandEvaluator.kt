package spintracker.services

import lt.solisnumus.poker.evaluator.Evaluator

object HandEvaluator {
    
    enum class HandRank {
        HIGH_CARD, PAIR, TWO_PAIR, THREE_OF_A_KIND, STRAIGHT, FLUSH, FULL_HOUSE, FOUR_OF_A_KIND, STRAIGHT_FLUSH
    }
    
    data class EvaluationResult(
        val rank: HandRank,
        val score: Int,
        val description: String
    )
    
    private fun externalRankToRank(rank: Int): HandRank = when (rank) {
        in 1..1277 -> HandRank.STRAIGHT_FLUSH
        in 1278..2860 -> HandRank.FOUR_OF_A_KIND
        in 2861..3325 -> HandRank.FULL_HOUSE
        in 3326..3729 -> HandRank.FLUSH
        in 3730..5855 -> HandRank.STRAIGHT
        in 5856..6183 -> HandRank.THREE_OF_A_KIND
        in 6184..6642 -> HandRank.TWO_PAIR
        in 6643..7462 -> HandRank.PAIR
        else -> HandRank.HIGH_CARD
    }
    
    private fun externalToScore(externalRank: Int): Int = 7463 - externalRank
    
    private fun getDescription(rank: Int): String {
        val handRank = externalRankToRank(rank)
        return when (handRank) {
            HandRank.STRAIGHT_FLUSH -> {
                val high = when {
                    rank <= 10 -> rank + 4
                    else -> 14
                }
                "${rankToString(high)} High Straight Flush"
            }
            HandRank.FOUR_OF_A_KIND -> "Four of a Kind"
            HandRank.FULL_HOUSE -> "Full House"
            HandRank.FLUSH -> "Flush"
            HandRank.STRAIGHT -> "Straight"
            HandRank.THREE_OF_A_KIND -> "Three of a Kind"
            HandRank.TWO_PAIR -> "Two Pair"
            HandRank.PAIR -> "Pair"
            HandRank.HIGH_CARD -> "High Card"
        }
    }
    
    private fun rankToString(rank: Int): String = when(rank) {
        14 -> "Ace"; 13 -> "King"; 12 -> "Queen"; 11 -> "Jack"; 10 -> "Ten"
        else -> rank.toString()
    }
    
    fun evaluate(cards: List<Card>): EvaluationResult {
        if (cards.size < 5) return EvaluationResult(HandRank.HIGH_CARD, 0, "Unknown")
        
        val cardInts = cards.map { it.cardInt }
        
        val externalRank = when (cardInts.size) {
            7 -> Evaluator.getValue(cardInts[0], cardInts[1], cardInts[2], cardInts[3], cardInts[4], cardInts[5], cardInts[6])
            6 -> Evaluator.getValue(cardInts[0], cardInts[1], cardInts[2], cardInts[3], cardInts[4], cardInts[5], 0)
            5 -> Evaluator.getValue(cardInts[0], cardInts[1], cardInts[2], cardInts[3], cardInts[4], 0, 0)
            else -> return EvaluationResult(HandRank.HIGH_CARD, 0, "Unknown")
        }
        
        val rank = externalRankToRank(externalRank.toInt())
        val score = externalToScore(externalRank.toInt())
        val desc = getDescription(externalRank.toInt())
        
        return EvaluationResult(rank, score, desc)
    }
    
    fun rankToValue(rank: Char): Int {
        return when (rank.uppercaseChar()) {
            '2' -> 2; '3' -> 3; '4' -> 4; '5' -> 5; '6' -> 6; '7' -> 7
            '8' -> 8; '9' -> 9; 'T' -> 10; 'J' -> 11; 'Q' -> 12; 'K' -> 13; 'A' -> 14
            else -> 0
        }
    }
}

data class Card(val rank: Char, val suit: Char) {
    val rankValue: Int get() = HandEvaluator.rankToValue(rank)
    
    // Card encoding matching the Java evaluator's expected format:
    // Cards are grouped by rank position (0-12 = rank 2-A) * 4 suits
    // card = rankPosition * 4 + suitIndex
    // suitIndex: c=0, d=1, h=2, s=3
    val cardInt: Int get() {
        val r = HandEvaluator.rankToValue(rank) - 2  // 0-12 for 2-A
        val s = when (suit.lowercaseChar()) {
            'c' -> 0; 'd' -> 1; 'h' -> 2; 's' -> 3
            else -> 0
        }
        return r * 4 + s  // Different from divide-by-13 encoding!
    }
    
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Card) return false
        return rank.uppercaseChar() == other.rank.uppercaseChar() && suit.lowercaseChar() == other.suit.lowercaseChar()
    }
    
    override fun hashCode(): Int {
        return rank.uppercaseChar().hashCode() * 31 + suit.lowercaseChar().hashCode()
    }
    
    companion object {
        private val validRanks = setOf('2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A')
        private val validSuits = setOf('h', 'd', 'c', 's')
        
        fun parse(s: String): List<Card> {
            val cards = mutableListOf<Card>()
            if (s.isBlank()) return cards
            
            var cleaned = s.replace("[", "").replace("]", "").replace("|", " ")
            
            if (!cleaned.contains(" ") && cleaned.length >= 4) {
                var i = 0
                while (i + 1 < cleaned.length) {
                    val rank = cleaned[i].uppercaseChar()
                    val suit = cleaned[i + 1].lowercaseChar()
                    if (rank in validRanks && suit in validSuits) {
                        cards.add(Card(rank, suit))
                    }
                    i += 2
                }
                return cards
            }
            
            val parts = cleaned.split(" ").filter { it.length >= 2 }
            for (part in parts) {
                if (part.length >= 2) {
                    val rank = part[0].uppercaseChar()
                    val suit = part[1].lowercaseChar()
                    if (rank in validRanks && suit in validSuits) {
                        cards.add(Card(rank, suit))
                    }
                }
            }
            return cards
        }
    }
}