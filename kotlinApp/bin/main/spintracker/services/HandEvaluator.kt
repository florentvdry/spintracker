package spintracker.services

/**
 * Simple Poker Hand Evaluator for Texas Hold'em
 * Implementation of a basic 7-card evaluator
 */
object HandEvaluator {
    
    enum class HandRank {
        HIGH_CARD, PAIR, TWO_PAIR, THREE_OF_A_KIND, STRAIGHT, FLUSH, FULL_HOUSE, FOUR_OF_A_KIND, STRAIGHT_FLUSH
    }
    
    data class EvaluationResult(
        val rank: HandRank,
        val score: Int, // Higher is better
        val description: String
    )
    
    /**
     * Evaluates a 7-card hand (2 hole cards + 5 board cards)
     * returns a score where higher is better
     */
    fun evaluate(cards: List<Card>): EvaluationResult {
        if (cards.size < 5) return EvaluationResult(HandRank.HIGH_CARD, 0, "Unknown")
        
        // Count ranks and suits using fixed-size arrays to avoid allocations
        val rankCounts = IntArray(15) // index 2-14
        val suitCounts = IntArray(4) // h=0, d=1, c=2, s=3
        
        for (card in cards) {
            rankCounts[card.rankValue]++
            suitCounts[suitToIndex(card.suit)]++
        }
        
        // 1. Flush check
        var flushSuitIdx = -1
        for (i in 0..3) {
            if (suitCounts[i] >= 5) {
                flushSuitIdx = i
                break
            }
        }
        
        if (flushSuitIdx != -1) {
            val flushSuit = indexToSuit(flushSuitIdx)
            // Get flush ranks in descending order
            val flushRanks = IntArray(suitCounts[flushSuitIdx])
            var idx = 0
            for (card in cards) {
                if (card.suit == flushSuit) {
                    flushRanks[idx++] = card.rankValue
                }
            }
            flushRanks.sort() // ascending
            
            // Straight Flush check
            val sf = findStraightInRanks(flushRanks)
            if (sf != null) {
                return EvaluationResult(HandRank.STRAIGHT_FLUSH, 8000000 + sf, "Straight Flush")
            }
            
            // Just a Flush
            val score = 5000000 + (flushRanks[idx-1] shl 16) + (flushRanks[idx-2] shl 12) + (flushRanks[idx-3] shl 8) + (flushRanks[idx-4] shl 4) + flushRanks[idx-5]
            return EvaluationResult(HandRank.FLUSH, score, "Flush")
        }
        
        // 2. Rank-based hands
        var quadRank = -1
        var tripsRank = -1
        var pair1Rank = -1
        var pair2Rank = -1
        
        for (r in 14 downTo 2) {
            val count = rankCounts[r]
            when (count) {
                4 -> quadRank = r
                3 -> if (tripsRank == -1) tripsRank = r else if (pair1Rank == -1) pair1Rank = r
                2 -> if (pair1Rank == -1) pair1Rank = r else if (pair2Rank == -1) pair2Rank = r
            }
        }
        
        // Four of a Kind
        if (quadRank != -1) {
            var kicker = 0
            for (r in 14 downTo 2) {
                if (r != quadRank && rankCounts[r] > 0) {
                    kicker = r
                    break
                }
            }
            return EvaluationResult(HandRank.FOUR_OF_A_KIND, 7000000 + (quadRank shl 4) + kicker, "Four of a Kind")
        }
        
        // Full House
        if (tripsRank != -1 && pair1Rank != -1) {
            return EvaluationResult(HandRank.FULL_HOUSE, 6000000 + (tripsRank shl 4) + pair1Rank, "Full House")
        }
        
        // Straight check
        val distinctRanks = IntArray(15) // reuse or count unique
        var uniqueCount = 0
        for (r in 14 downTo 2) {
            if (rankCounts[r] > 0) distinctRanks[uniqueCount++] = r
        }
        // distinctRanks is already sorted descending from the loop above, but findStraightInRanks expects ascending or handled
        val straight = findStraightInSortedDistinctRanksDescending(distinctRanks, uniqueCount)
        if (straight != null) {
            return EvaluationResult(HandRank.STRAIGHT, 4000000 + straight, "Straight")
        }
        
        // Three of a Kind
        if (tripsRank != -1) {
            val kickers = IntArray(2)
            var kCount = 0
            for (r in 14 downTo 2) {
                if (r != tripsRank && rankCounts[r] > 0) {
                    repeat(rankCounts[r]) {
                        if (kCount < 2) kickers[kCount++] = r
                    }
                }
            }
            val score = 3000000 + (tripsRank shl 8) + (kickers[0] shl 4) + kickers[1]
            return EvaluationResult(HandRank.THREE_OF_A_KIND, score, "Three of a Kind")
        }
        
        // Two Pair
        if (pair1Rank != -1 && pair2Rank != -1) {
            var kicker = 0
            for (r in 14 downTo 2) {
                if (r != pair1Rank && r != pair2Rank && rankCounts[r] > 0) {
                    kicker = r
                    break
                }
            }
            val score = 2000000 + (pair1Rank shl 8) + (pair2Rank shl 4) + kicker
            return EvaluationResult(HandRank.TWO_PAIR, score, "Two Pair")
        }
        
        // Pair
        if (pair1Rank != -1) {
            val kickers = IntArray(3)
            var kCount = 0
            for (r in 14 downTo 2) {
                if (r != pair1Rank && rankCounts[r] > 0) {
                    repeat(rankCounts[r]) {
                        if (kCount < 3) kickers[kCount++] = r
                    }
                }
            }
            val score = 1000000 + (pair1Rank shl 12) + (kickers[0] shl 8) + (kickers[1] shl 4) + kickers[2]
            return EvaluationResult(HandRank.PAIR, score, "Pair")
        }
        
        // High Card
        val kickers = IntArray(5)
        var kCount = 0
        for (r in 14 downTo 2) {
            if (rankCounts[r] > 0) {
                repeat(rankCounts[r]) {
                    if (kCount < 5) kickers[kCount++] = r
                }
            }
        }
        val score = (kickers[0] shl 16) + (kickers[1] shl 12) + (kickers[2] shl 8) + (kickers[3] shl 4) + kickers[4]
        return EvaluationResult(HandRank.HIGH_CARD, score, "High Card")
    }
    
    private fun suitToIndex(suit: Char): Int = when (suit.lowercaseChar()) {
        'h' -> 0
        'd' -> 1
        'c' -> 2
        's' -> 3
        else -> 0
    }
    
    private fun indexToSuit(idx: Int): Char = when (idx) {
        0 -> 'h'
        1 -> 'd'
        2 -> 'c'
        3 -> 's'
        else -> 'h'
    }
    
    private fun findStraightInRanks(ascendingRanks: IntArray): Int? {
        if (ascendingRanks.size < 5) return null
        // Special case for A-2-3-4-5
        if (ascendingRanks.contains(14) && ascendingRanks.contains(2) && 
            ascendingRanks.contains(3) && ascendingRanks.contains(4) && ascendingRanks.contains(5)) {
            return 5
        }
        for (i in ascendingRanks.size - 1 downTo 4) {
            if (ascendingRanks[i] - ascendingRanks[i-4] == 4) return ascendingRanks[i]
            // This is for distinct ranks. If we have duplicates, it's more complex.
            // But for flush ranks, we might have more than 5 cards.
            // Actually, findStraightInRanks is called with distinct ranks in flush or general.
            // Wait, for flush it's distinct ranks anyway (one card of each rank max in a suit).
        }
        // Better loop for potential duplicates (though not possible in flush)
        var count = 1
        for (i in ascendingRanks.size - 1 downTo 1) {
            if (ascendingRanks[i] == ascendingRanks[i-1] + 1) {
                count++
                if (count >= 5) return ascendingRanks[i + count - 2] // fixed logic below
            } else if (ascendingRanks[i] != ascendingRanks[i-1]) {
                count = 1
            }
        }
        return null
    }

    private fun findStraightInSortedDistinctRanksDescending(descRanks: IntArray, count: Int): Int? {
        if (count < 5) return null
        
        // Special case for wheel
        var hasAce = false
        var has2 = false
        var has3 = false
        var has4 = false
        var has5 = false
        for (i in 0 until count) {
            when (descRanks[i]) {
                14 -> hasAce = true
                5 -> has5 = true
                4 -> has4 = true
                3 -> has3 = true
                2 -> has2 = true
            }
        }
        if (hasAce && has2 && has3 && has4 && has5) return 5

        for (i in 0..count - 5) {
            if (descRanks[i] - descRanks[i+4] == 4) return descRanks[i]
        }
        return null
    }

    private fun IntArray.contains(value: Int): Boolean {
        for (i in indices) if (this[i] == value) return true
        return false
    }

    
    fun rankToValue(rank: Char): Int {
        return when (rank.uppercaseChar()) {
            '2' -> 2
            '3' -> 3
            '4' -> 4
            '5' -> 5
            '6' -> 6
            '7' -> 7
            '8' -> 8
            '9' -> 9
            'T' -> 10
            'J' -> 11
            'Q' -> 12
            'K' -> 13
            'A' -> 14
            else -> 0
        }
    }
}

data class Card(val rank: Char, val suit: Char) {
    val rankValue: Int get() = HandEvaluator.rankToValue(rank)
    
    companion object {
        fun parse(s: String): List<Card> {
            val cards = mutableListOf<Card>()
            val cleaned = s.replace("[", "").replace("]", "").replace("|", " ").replace(",", " ")
            val parts = cleaned.split(" ").filter { it.length >= 2 }
            for (part in parts) {
                cards.add(Card(part[0], part[1]))
            }
            return cards
        }
    }
}
