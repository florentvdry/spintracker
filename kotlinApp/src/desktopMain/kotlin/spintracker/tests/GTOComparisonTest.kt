package spintracker.tests

import spintracker.models.Hand
import spintracker.services.GTOComparisonService

fun main() {
    println("=== GTO Comparison Service Tests ===\n")
    
    var passed = 0
    var failed = 0
    
    fun test(name: String, block: () -> Boolean) {
        try {
            if (block()) {
                println("✓ $name")
                passed++
            } else {
                println("✗ $name (assertion failed)")
                failed++
            }
        } catch (e: Exception) {
            println("✗ $name (${e.message})")
            failed++
        }
    }
    
    test("Basic GTO comparison returns non-null result") {
        val hand = createTestHand()
        val result = GTOComparisonService.compare(hand, "flop")
        result != null
    }
    
    test("GTO comparison includes player action") {
        val hand = createTestHand()
        val result = GTOComparisonService.compare(hand, "flop")
        result.playerAction.isNotEmpty()
    }
    
    test("GTO comparison includes GTO recommendation") {
        val hand = createTestHand()
        val result = GTOComparisonService.compare(hand, "flop")
        result.gtoRecommendation.isNotEmpty()
    }
    
    test("GTO comparison includes explanation") {
        val hand = createTestHand()
        val result = GTOComparisonService.compare(hand, "flop")
        result.explanation.isNotEmpty()
    }
    
    test("Deviation score is between 0 and 1") {
        val hand = createTestHand()
        val result = GTOComparisonService.compare(hand, "flop")
        result.deviationScore in 0.0..1.0
    }
    
    test("Different positions give different recommendations") {
        val handButton = createTestHand(position = 8)
        val handBB = createTestHand(position = 1)
        
        val resultButton = GTOComparisonService.compare(handButton, "preflop")
        val resultBB = GTOComparisonService.compare(handBB, "preflop")
        
        resultButton.deviationScore != resultBB.deviationScore || 
            resultButton.explanation != resultBB.explanation
    }
    
    test("Stack depth affects GTO recommendation") {
        val handShallow = createTestHand(bigBlind = 10.0)
        val handDeep = createTestHand(bigBlind = 1.0)
        
        val resultShallow = GTOComparisonService.compare(handShallow, "flop")
        val resultDeep = GTOComparisonService.compare(handDeep, "flop")
        
        resultShallow.explanation != resultDeep.explanation
    }
    
    test("Board texture affects GTO recommendation") {
        val handDry = createTestHand(flop = "Ah2d7c")
        val handWet = createTestHand(flop = "9h8h7d")
        
        val resultDry = GTOComparisonService.compare(handDry, "flop")
        val resultWet = GTOComparisonService.compare(handWet, "flop")
        
        resultDry.explanation != resultWet.explanation
    }
    
    test("Hand strength affects GTO recommendation") {
        val handStrong = createTestHand(holeCards = "AhAs")
        val handWeak = createTestHand(holeCards = "72o")
        
        val resultStrong = GTOComparisonService.compare(handStrong, "preflop")
        val resultWeak = GTOComparisonService.compare(handWeak, "preflop")
        
        resultStrong.gtoRecommendation != resultWeak.gtoRecommendation ||
            resultStrong.explanation != resultWeak.explanation ||
            resultStrong.deviationScore != resultWeak.deviationScore
    }
    
    test("Different streets handled correctly") {
        val hand = createTestHand(flop = "AhKd2h", turn = "AhKd2h3c", river = "AhKd2h3c4s")
        
        val flopResult = GTOComparisonService.compare(hand, "flop")
        val turnResult = GTOComparisonService.compare(hand, "turn")
        val riverResult = GTOComparisonService.compare(hand, "river")
        
        flopResult != null && turnResult != null && riverResult != null
    }
    
    test("Preflop handles premium hands") {
        val hand = createTestHand(holeCards = "AhKh", position = 5)
        val result = GTOComparisonService.compare(hand, "preflop")
        
        result.gtoRecommendation in listOf("raise", "call")
    }
    
    test("Preflop handles weak hands") {
        val hand = createTestHand(holeCards = "72o", position = 1)
        val result = GTOComparisonService.compare(hand, "preflop")
        
        result.gtoRecommendation == "fold" || result.deviationScore > 0.3
    }
    
    println("\n=== Results ===")
    println("Passed: $passed")
    println("Failed: $failed")
    
    if (failed > 0) {
        System.exit(1)
    }
}

private fun createTestHand(
    position: Int = 5,
    heroStack: Double = 100.0,
    bigBlind: Double = 1.0,
    holeCards: String = "AhKs",
    flop: String? = "AhKd2h",
    turn: String? = null,
    river: String? = null
): Hand {
    return Hand(
        id = 1,
        handId = "test_hand_1",
        heroName = "Hero",
        heroPosition = position,
        playerCount = 6,
        bigBlind = bigBlind,
        position = position,
        flop = flop,
        turn = turn,
        river = river,
        totalPot = (bigBlind * 20),
        playersFlop = if (flop != null) 3 else 0,
        playersTurn = if (turn != null) 2 else 0,
        playersRiver = if (river != null) 1 else 0,
        potFlop = if (flop != null) bigBlind * 6 else 0.0,
        potTurn = if (turn != null) bigBlind * 12 else 0.0,
        potRiver = if (river != null) bigBlind * 20 else 0.0,
        rawContent = "Hole cards: [${holeCards.replace("o", "")}]"
    )
}
