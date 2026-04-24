package spintracker.tests

import spintracker.services.EquityService

fun main() {
    val equityService = EquityService()
    
    println("--- Spot Analysis Test (hand history integration) ---")
    
    // Test case 1: Analyze a specific hand from history
    // Hero has AdKd, villain flops top pair with KsQs on Qh7h2s board
    val spot1 = equityService.analyzeSpot(
        heroCards = "AdKd",
        opponentRange = "KQ,KJs,KTs,QJs,QTs,JTs",
        board = "Qh7h2s",
        deadCards = ""
    )
    println("Spot 1 (% AdKd vs KQ+ on Qh7h2s): ${spot1.win * 100}%")
    assert(spot1.win > 0.4 && spot1.win < 0.8) { "FAIL: Spot 1 should have reasonable equity" }
    
    // Test case 2: Preflop spot with range
    val spot2 = equityService.analyzeSpot(
        heroCards = "AA,KK,QQ,JJ,AKs,AKo",
        opponentRange = "22+,A2s+,K2s+,Q2s+,J2s+,T2s+,92s+,82s+,72s+,62s+,52s+,42s+,32s,A2o+,K2o+,Q2o+,J2o+,T2o+,92o+,82o+,72o+,62o+,52o+,42o+,32o",
        board = "",
        deadCards = ""
    )
    println("Spot 2 (Open raise vs call): ${spot2.win * 100}%")
    assert(spot2.win > 0.5) { "FAIL: Spot 2 premium should have equity edge" }
    
    // Test case 3: Multiway spot
    val spot3 = equityService.analyzeSpotMultiway(
        heroCards = "AhKh",
        villainRanges = listOf("TT+,ATs+,KQs,AJo+,KJo+", "22+,A7s+,KQs,AJo+"),
        board = "AcKd2d",
        deadCards = ""
    )
    println("Spot 3 (3-way): ${spot3.win * 100}%")
    assert(spot3.win > 0 && spot3.win < 1) { "FAIL: Spot 3 should have valid equity" }
    
    println("\nAll spot analysis tests passed!")
}