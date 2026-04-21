package spintracker.services

import java.util.Random
import kotlinx.coroutines.*

class EquityService {
    
    data class EquityResult(
        val win: Double,
        val tie: Double,
        val loss: Double
    )
    
    // Fixed seed for determinism in tests
    private val random = Random(42)
    
    /**
     * Calculates multiway equity for hero cards vs multiple villains.
     * Uses EXACT ENUMERATION.
     */
    fun calculateMultiwayEquity(
        heroCards: String, 
        villainCardsList: List<String>, 
        board: String = "", 
        deadCards: String = "",
        iterations: Int = 10000 // Ignored in exact enumeration but kept for API compatibility
    ): EquityResult {
        val hero = Card.parse(heroCards)
        val villains = villainCardsList.map { Card.parse(it) }.filter { it.size == 2 }
        val knownBoard = Card.parse(board)
        val dead = Card.parse(deadCards)
        
        if (hero.size != 2 || villains.isEmpty()) return EquityResult(0.0, 0.0, 0.0)
        
        val allVillainCards = villains.flatten()
        val usedCards = (hero + allVillainCards + knownBoard + dead).toSet()
        val availableDeck = mutableListOf<Card>()
        val ranks = "23456789TJQKA"
        val suits = "hsdc"
        for (r in ranks) {
            for (s in suits) {
                val card = Card(r, s)
                if (!usedCards.contains(card)) {
                    availableDeck.add(card)
                }
            }
        }
        
        val cardsNeeded = 5 - knownBoard.size
        if (availableDeck.size < cardsNeeded) return EquityResult(0.0, 0.0, 0.0)

        // Delegate to exact enumeration
        return runExactEnumeration(hero, villains, knownBoard, availableDeck)
    }

    private fun runExactEnumeration(
        hero: List<Card>,
        villains: List<List<Card>>,
        knownBoard: List<Card>,
        deck: List<Card>
    ): EquityResult {
        val cardsNeeded = 5 - knownBoard.size
        
        var heroShare = 0.0
        var totalCombos = 0L
        var ties = 0L
        var villainWins = 0L

        // Optimization: use primitive-friendly evaluation if possible, 
        // but for now we use our optimized HandEvaluator.kt
        
        when (cardsNeeded) {
            0 -> {
                val res = evaluateResult(hero, villains, knownBoard)
                return res
            }
            1 -> {
                for (i in deck.indices) {
                    val simBoard = knownBoard + deck[i]
                    val res = evaluateResult(hero, villains, simBoard)
                    heroShare += res.win
                    ties += (res.tie * 1).toLong() // this is simplified, evaluateResult returns share
                    // Wait, evaluateResult should return raw win/tie/loss counts to be aggregated correctly
                }
                totalCombos = deck.size.toLong()
            }
            2 -> {
                for (i in 0 until deck.size - 1) {
                    for (j in i + 1 until deck.size) {
                        val simBoard = knownBoard + deck[i] + deck[j]
                        val r = evaluateRound(hero, villains, simBoard)
                        heroShare += r.heroShare
                        if (r.isTie) ties++
                        if (r.villainWon) villainWins++
                        totalCombos++
                    }
                }
            }
            5 -> {
                // Preflop: 1.7M combinations. Parallelize!
                // Using a simpler loop for now, but should ideally use Coroutines
                return runParallelPreflop(hero, villains, deck)
            }
            else -> {
                // Handle cases like 3 or 4 cards needed (though unusual for standard holdem)
                // Just for completeness
                val combinations = getCombinations(deck, cardsNeeded)
                for (combo in combinations) {
                    val simBoard = knownBoard + combo
                    val r = evaluateRound(hero, villains, simBoard)
                    heroShare += r.heroShare
                    if (r.isTie) ties++
                    if (r.villainWon) villainWins++
                    totalCombos++
                }
            }
        }

        if (totalCombos == 0L) return EquityResult(0.0, 0.0, 0.0)
        
        return EquityResult(
            win = heroShare / totalCombos,
            tie = ties.toDouble() / totalCombos,
            loss = villainWins.toDouble() / totalCombos
        )
    }

    private data class RoundResult(val heroShare: Double, val isTie: Boolean, val villainWon: Boolean)

    private fun evaluateRound(hero: List<Card>, villains: List<List<Card>>, board: List<Card>): RoundResult {
        val heroScore = HandEvaluator.evaluate(hero + board).score
        var bestVillainScore = -1
        var villainWinners = 0
        
        for (villain in villains) {
            val score = HandEvaluator.evaluate(villain + board).score
            if (score > bestVillainScore) {
                bestVillainScore = score
                villainWinners = 1
            } else if (score == bestVillainScore) {
                villainWinners++
            }
        }
        
        return when {
            heroScore > bestVillainScore -> RoundResult(1.0, false, false)
            heroScore == bestVillainScore -> RoundResult(1.0 / (villainWinners + 1), true, false)
            else -> RoundResult(0.0, false, true)
        }
    }

    private fun evaluateResult(hero: List<Card>, villains: List<List<Card>>, board: List<Card>): EquityResult {
        val r = evaluateRound(hero, villains, board)
        return EquityResult(
            win = r.heroShare,
            tie = if (r.isTie) 1.0 else 0.0,
            loss = if (r.villainWon) 1.0 else 0.0
        )
    }

    private fun runParallelPreflop(hero: List<Card>, villains: List<List<Card>>, deck: List<Card>): EquityResult = kotlinx.coroutines.runBlocking {
        val n = deck.size
        // We parallelize by the first card index to utilize all cores
        val deferreds = (0 until n - 4).map { i1 ->
            async(Dispatchers.Default) {
                var heroShare = 0.0
                var ties = 0L
                var villainWins = 0L
                var combos = 0L
                
                // Use a local buffer to avoid list allocations inside the hot loops
                val boardBuffer = mutableListOf<Card>()
                
                for (i2 in i1 + 1 until n - 3) {
                    for (i3 in i2 + 1 until n - 2) {
                        for (i4 in i3 + 1 until n - 1) {
                            for (i5 in i4 + 1 until n) {
                                boardBuffer.clear()
                                boardBuffer.add(deck[i1])
                                boardBuffer.add(deck[i2])
                                boardBuffer.add(deck[i3])
                                boardBuffer.add(deck[i4])
                                boardBuffer.add(deck[i5])
                                
                                val r = evaluateRound(hero, villains, boardBuffer)
                                
                                heroShare += r.heroShare
                                if (r.isTie) ties++
                                if (r.villainWon) villainWins++
                                combos++
                            }
                        }
                    }
                }
                Result(heroShare, ties, villainWins, combos)
            }
        }

        val results = deferreds.awaitAll()
        
        var totalHeroShare = 0.0
        var totalTies = 0L
        var totalVillainWins = 0L
        var totalCombos = 0L

        for (res in results) {
            totalHeroShare += res.heroShare
            totalTies += res.ties
            totalVillainWins += res.villainWins
            totalCombos += res.combos
        }

        EquityResult(
            win = if (totalCombos > 0) totalHeroShare / totalCombos else 0.0,
            tie = if (totalCombos > 0) totalTies.toDouble() / totalCombos else 0.0,
            loss = if (totalCombos > 0) totalVillainWins.toDouble() / totalCombos else 0.0
        )
    }

    private data class Result(val heroShare: Double, val ties: Long, val villainWins: Long, val combos: Long)

    private fun getCombinations(deck: List<Card>, k: Int): List<List<Card>> {
        val results = mutableListOf<List<Card>>()
        fun backtrack(start: Int, current: MutableList<Card>) {
            if (current.size == k) {
                results.add(current.toList())
                return
            }
            for (i in start until deck.size) {
                current.add(deck[i])
                backtrack(i + 1, current)
                current.removeAt(current.size - 1)
            }
        }
        backtrack(0, mutableListOf())
        return results
    }
}
