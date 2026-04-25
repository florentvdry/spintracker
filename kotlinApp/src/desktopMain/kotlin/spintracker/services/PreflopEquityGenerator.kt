package spintracker.services

import spintracker.data.Database

/**
 * Generates and populates the preflop equity lookup table.
 * This is a one-time operation performed during app installation.
 * 
 * Generates all unique preflop matchups:
 * - 169 unique hand types (pairs, suited, offsuit)
 * - HU: 169 × 1,225 = ~207k combinations
 * - 3-way: 169 × 1,225 × 1,081 normalized = ~100k combinations
 * 
 * Total: ~300k rows, takes ~30-60 minutes to generate
 */
object PreflopEquityGenerator {
    
    private val equityService = EquityService()
    private val ranks = "23456789TJQKA"
    private val suits = "hsdc"
    
    data class HandType(
        val normalized: String,      // "AKs", "TT", "97o"
        val exampleCards: String,    // "AhKh", "TdTc", "9h7d"
        val isPair: Boolean,
        val isSuited: Boolean
    )
    
    /**
     * Generate all 169 unique hand types
     */
    private fun generateAllHandTypes(): List<HandType> {
        val handTypes = mutableListOf<HandType>()
        
        // Pairs (13 types)
        for (r in ranks) {
            handTypes.add(HandType(
                normalized = "$r$r",
                exampleCards = "${r}${suits[0]}${r}${suits[1]}",
                isPair = true,
                isSuited = false
            ))
        }
        
        // Non-pairs (13 × 12 = 156 types, split into suited/offsuit)
        for (i in ranks.indices) {
            for (j in 0 until i) {
                val highRank = ranks[i]
                val lowRank = ranks[j]
                
                // Suited
                handTypes.add(HandType(
                    normalized = "${highRank}${lowRank}s",
                    exampleCards = "${highRank}${suits[0]}${lowRank}${suits[0]}",
                    isPair = false,
                    isSuited = true
                ))
                
                // Offsuit
                handTypes.add(HandType(
                    normalized = "${highRank}${lowRank}o",
                    exampleCards = "${highRank}${suits[0]}${lowRank}${suits[1]}",
                    isPair = false,
                    isSuited = false
                ))
            }
        }
        
        return handTypes
    }
    
    /**
     * Get remaining cards after removing specific cards
     */
    private fun getRemainingCards(removedCards: List<Card>): List<Card> {
        val removed = removedCards.toSet()
        val remaining = mutableListOf<Card>()
        
        for (r in ranks) {
            for (s in suits) {
                val card = Card(r, s)
                if (card !in removed) {
                    remaining.add(card)
                }
            }
        }
        
        return remaining
    }
    
    /**
     * Get all possible hand types from remaining cards
     */
    private fun getHandTypesFromCards(remainingCards: List<Card>): List<HandType> {
        val handTypes = mutableSetOf<String>()
        val result = mutableListOf<HandType>()
        
        // Pairs
        for (r in ranks) {
            val cardsOfRank = remainingCards.filter { it.rank == r }
            if (cardsOfRank.size >= 2) {
                val normalized = "$r$r"
                if (normalized !in handTypes) {
                    handTypes.add(normalized)
                    result.add(HandType(
                        normalized = normalized,
                        exampleCards = "${cardsOfRank[0].rank}${cardsOfRank[0].suit}${cardsOfRank[1].rank}${cardsOfRank[1].suit}",
                        isPair = true,
                        isSuited = false
                    ))
                }
            }
        }
        
        // Non-pairs
        for (i in ranks.indices) {
            for (j in 0 until i) {
                val highRank = ranks[i]
                val lowRank = ranks[j]
                
                val highCards = remainingCards.filter { it.rank == highRank }
                val lowCards = remainingCards.filter { it.rank == lowRank }
                
                if (highCards.isNotEmpty() && lowCards.isNotEmpty()) {
                    // Check if suited is possible
                    for (s in suits) {
                        val hasHighSuited = highCards.any { it.suit == s }
                        val hasLowSuited = lowCards.any { it.suit == s }
                        if (hasHighSuited && hasLowSuited) {
                            val normalized = "${highRank}${lowRank}s"
                            if (normalized !in handTypes) {
                                handTypes.add(normalized)
                                result.add(HandType(
                                    normalized = normalized,
                                    exampleCards = "${highRank}${s}${lowRank}${s}",
                                    isPair = false,
                                    isSuited = true
                                ))
                            }
                            break
                        }
                    }
                    
                    // Check if offsuit is possible
                    for (s1 in suits) {
                        val hasHigh = highCards.any { it.suit == s1 }
                        if (!hasHigh) continue
                        
                        for (s2 in suits) {
                            if (s1 == s2) continue
                            val hasLowOffsuit = lowCards.any { it.suit == s2 }
                            if (hasLowOffsuit) {
                                val normalized = "${highRank}${lowRank}o"
                                if (normalized !in handTypes) {
                                    handTypes.add(normalized)
                                    result.add(HandType(
                                        normalized = normalized,
                                        exampleCards = "${highRank}${s1}${lowRank}${s2}",
                                        isPair = false,
                                        isSuited = false
                                    ))
                                }
                                break
                            }
                        }
                        if ("${highRank}${lowRank}o" in handTypes) break
                    }
                }
            }
        }
        
        return result
    }
    
    /**
     * Generate example cards for a hand type from remaining cards
     */
    private fun getExampleCardsForType(handType: HandType, remainingCards: List<Card>): String? {
        if (handType.isPair) {
            val rank = handType.normalized[0]
            val cards = remainingCards.filter { it.rank == rank }
            if (cards.size >= 2) {
                return "${cards[0].rank}${cards[0].suit}${cards[1].rank}${cards[1].suit}"
            }
        } else {
            val highRank = handType.normalized[0]
            val lowRank = handType.normalized[1]
            val suited = handType.isSuited
            
            val highCards = remainingCards.filter { it.rank == highRank }
            val lowCards = remainingCards.filter { it.rank == lowRank }
            
            if (suited) {
                for (s in suits) {
                    val hasHigh = highCards.any { it.suit == s }
                    val hasLow = lowCards.any { it.suit == s }
                    if (hasHigh && hasLow) {
                        return "${highRank}${s}${lowRank}${s}"
                    }
                }
            } else {
                for (s1 in suits) {
                    val hasHigh = highCards.any { it.suit == s1 }
                    if (!hasHigh) continue
                    
                    for (s2 in suits) {
                        if (s1 == s2) continue
                        val hasLow = lowCards.any { it.suit == s2 }
                        if (hasLow) {
                            return "${highRank}${s1}${lowRank}${s2}"
                        }
                    }
                }
            }
        }
        return null
    }
    
    /**
     * Main generation method - populates the preflop equity lookup table
     */
    fun generateAndSave(database: Database, onProgress: ((Int, Int, String) -> Unit)? = null) {
        val allHandTypes = generateAllHandTypes()
        println("Generated ${allHandTypes.size} hand types")
        
        var count = 0
        var totalEstimated = 300000  // Approximate
        
        database.useTransaction { conn ->
            val insertStmt = conn.prepareStatement(
                "INSERT OR REPLACE INTO preflop_equity_lookup (hero_hand, villain1_hand, villain2_hand, hero_equity, tie_equity) VALUES (?, ?, ?, ?, ?)"
            )
            
            // Generate HU scenarios
            println("Generating heads-up scenarios...")
            for ((heroIndex, hero) in allHandTypes.withIndex()) {
                val heroCards = Card.parse(hero.exampleCards)
                val remainingAfterHero = getRemainingCards(heroCards)
                val villainHands = getHandTypesFromCards(remainingAfterHero)
                
                for (villain in villainHands) {
                    val villainCardsStr = getExampleCardsForType(villain, remainingAfterHero)
                        ?: continue
                    
                    val result = equityService.calculateMultiwayEquity(
                        hero.exampleCards,
                        listOf(villain.exampleCards)
                    )
                    
                    insertStmt.setString(1, hero.normalized)
                    insertStmt.setString(2, villain.normalized)
                    insertStmt.setNull(3, java.sql.Types.VARCHAR)
                    insertStmt.setDouble(4, result.win)
                    insertStmt.setDouble(5, result.tie)
                    insertStmt.addBatch()
                    count++
                    
                    if (count % 5000 == 0) {
                        insertStmt.executeBatch()
                        onProgress?.invoke(count, totalEstimated, "HU: $count scenarios")
                        println("Generated $count HU scenarios...")
                    }
                }
                
                if (heroIndex % 20 == 0) {
                    onProgress?.invoke(count, totalEstimated, "HU: ${heroIndex + 1}/${allHandTypes.size} hands")
                }
            }
            
            // Generate 3-way scenarios (normalized - villain hands sorted)
            println("Generating 3-way scenarios...")
            for ((heroIndex, hero) in allHandTypes.withIndex()) {
                val heroCards = Card.parse(hero.exampleCards)
                val remainingAfterHero = getRemainingCards(heroCards)
                val villain1Hands = getHandTypesFromCards(remainingAfterHero)
                
                for (villain1 in villain1Hands) {
                    val v1CardsStr = getExampleCardsForType(villain1, remainingAfterHero)
                        ?: continue
                    val v1Cards = Card.parse(v1CardsStr)
                    
                    val remainingAfterV1 = getRemainingCards(heroCards + v1Cards)
                    val villain2Hands = getHandTypesFromCards(remainingAfterV1)
                    
                    // Only generate where villain2 >= villain1 (normalization to avoid duplicates)
                    val startIndex = villain2Hands.indexOfFirst { 
                        it.normalized >= villain1.normalized 
                    }.takeIf { it != -1 } ?: 0
                    
                    for (villain2 in villain2Hands.drop(startIndex)) {
                        val v2CardsStr = getExampleCardsForType(villain2, remainingAfterV1)
                            ?: continue
                        
                        val result = equityService.calculateMultiwayEquity(
                            hero.exampleCards,
                            listOf(villain1.exampleCards, villain2.exampleCards)
                        )
                        
                        insertStmt.setString(1, hero.normalized)
                        insertStmt.setString(2, villain1.normalized)
                        insertStmt.setString(3, villain2.normalized)
                        insertStmt.setDouble(4, result.win)
                        insertStmt.setDouble(5, result.tie)
                        insertStmt.addBatch()
                        count++
                        
                        if (count % 5000 == 0) {
                            insertStmt.executeBatch()
                            onProgress?.invoke(count, totalEstimated, "3-way: $count scenarios")
                            println("Generated $count total scenarios...")
                        }
                    }
                }
                
                if (heroIndex % 20 == 0) {
                    onProgress?.invoke(count, totalEstimated, "3-way: ${heroIndex + 1}/${allHandTypes.size} hands")
                }
            }
            
            insertStmt.executeBatch()
            insertStmt.close()
            
            println("Generated $count preflop equity scenarios total")
        }
        
        onProgress?.invoke(count, count, "Complete: $count scenarios")
    }
    
    /**
     * Quick generation for testing - only generates a subset
     */
    fun generateQuick(database: Database) {
        val allHandTypes = generateAllHandTypes().take(10)  // Only first 10 hand types
        println("Quick generation with ${allHandTypes.size} hand types...")
        
        var count = 0
        
        database.useTransaction { conn ->
            val insertStmt = conn.prepareStatement(
                "INSERT OR REPLACE INTO preflop_equity_lookup (hero_hand, villain1_hand, villain2_hand, hero_equity, tie_equity) VALUES (?, ?, ?, ?, ?)"
            )
            
            for (hero in allHandTypes) {
                val remainingAfterHero = getRemainingCards(Card.parse(hero.exampleCards))
                val villainHands = getHandTypesFromCards(remainingAfterHero)
                
                for (villain in villainHands.take(20)) {  // Limit villains
                    val result = equityService.calculateMultiwayEquity(
                        hero.exampleCards,
                        listOf(villain.exampleCards)
                    )
                    
                    insertStmt.setString(1, hero.normalized)
                    insertStmt.setString(2, villain.normalized)
                    insertStmt.setNull(3, java.sql.Types.VARCHAR)
                    insertStmt.setDouble(4, result.win)
                    insertStmt.setDouble(5, result.tie)
                    insertStmt.addBatch()
                    count++
                }
            }
            
            insertStmt.executeBatch()
            insertStmt.close()
        }
        
        println("Quick generated $count preflop equity scenarios")
    }
}
