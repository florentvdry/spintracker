package spintracker.services

import spintracker.data.Database
import spintracker.models.BoardAnalysis
import spintracker.models.BoardTexture
import kotlin.math.abs

object BoardTextureService {

    fun classify(flop: String): BoardTexture {
        val cards = Card.parse(flop)
        if (cards.size != 3) return BoardTexture.DRY

        val isMonotone = isMonotoneBoard(cards)
        val isPaired = isPairedBoard(cards)
        val isRainbow = isRainbowBoard(cards)
        val hasStraightDraw = hasStraightDraw(cards)

        return when {
            isMonotone || isPaired -> BoardTexture.DRY
            isRainbow && !hasStraightDraw -> BoardTexture.DRY
            isRainbow && hasStraightDraw -> BoardTexture.MIXED
            hasStraightDraw -> BoardTexture.WET
            else -> BoardTexture.MIXED
        }
    }

    fun analyzeHands(database: Database, playerId: Long): List<BoardAnalysis> {
        val hands = database.getHandsByPlayer(playerId)
        val handResults = hands.filter { it.flop != null }
            .groupBy { classify(it.flop!!) }

        return BoardTexture.entries.map { texture ->
            val textureHands = handResults[texture] ?: emptyList()
            val textureCards = textureHands.mapNotNull { it.flop }.distinctBy { it }
            val firstFlop = textureCards.firstOrNull() ?: ""

            BoardAnalysis(
                texture = texture,
                isMonotone = if (firstFlop.isNotEmpty()) isMonotoneBoard(Card.parse(firstFlop)) else false,
                isPaired = if (firstFlop.isNotEmpty()) isPairedBoard(Card.parse(firstFlop)) else false,
                isRainbow = if (firstFlop.isNotEmpty()) isRainbowBoard(Card.parse(firstFlop)) else false,
                hasStraightDraw = if (firstFlop.isNotEmpty()) hasStraightDraw(Card.parse(firstFlop)) else false,
                profitByTexture = textureHands.sumOf { it.result },
                handsPlayed = textureHands.size
            )
        }
    }

    private fun isMonotoneBoard(cards: List<Card>): Boolean {
        return cards.all { it.suit == cards[0].suit }
    }

    private fun isPairedBoard(cards: List<Card>): Boolean {
        return cards.groupingBy { it.rank }.eachCount().any { it.value > 1 }
    }

    private fun isRainbowBoard(cards: List<Card>): Boolean {
        return cards.distinctBy { it.suit }.size == 3
    }

    private fun hasStraightDraw(cards: List<Card>): Boolean {
        val ranks = cards.map { it.rankValue }.sorted()
        if (ranks.size != 3) return false

        val gaps = listOf(abs(ranks[1] - ranks[0]), abs(ranks[2] - ranks[1]))
        val sumGaps = gaps.sum()

        return when {
            sumGaps <= 4 -> true
            gaps[0] == 1 || gaps[1] == 1 -> true
            abs(ranks[2] - ranks[0]) == 4 -> true
            else -> false
        }
    }
}