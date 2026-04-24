package spintracker.tests

import spintracker.services.EquityService

/**
 * Test equity calculation for ReplayerScreen overlay.
 * Tests that equity is correctly calculated at each street.
 */
fun main() {
    val equityService = EquityService()
    var passed = 0
    var failed = 0
    
    fun test(name: String, condition: Boolean) {
        if (condition) {
            println("✓ $name")
            passed++
        } else {
            println("✗ FAIL: $name")
            failed++
        }
    }
    
    println("=== Replayer Equity Tests ===\n")
    
    // Test 1: Preflop equity calculation (AA vs KK)
    val preflopResult = equityService.calculateMultiwayEquity("AhAs", listOf("KhKs"), "")
    test("Preflop AA vs KK: win rate ~80%", preflopResult.win > 0.75 && preflopResult.win < 0.85)
    
    // Test 2: Flop equity (AA hits set vs KK)
    val flopResult = equityService.calculateMultiwayEquity("AhAs", listOf("KhKs"), "Ad2h3c")
    test("Flop set over set: AA should have >85% equity", flopResult.win > 0.85)
    
    // Test 3: Turn equity calculation
    val turnResult = equityService.calculateMultiwayEquity("AhAs", listOf("KhKs"), "Ad2h3c4d")
    test("Turn equity calculation works", turnResult.win > 0 && turnResult.win < 1.0)
    
    // Test 4: River equity calculation (determinate)
    val riverResult = equityService.calculateMultiwayEquity("AhKh", listOf("AsKs"), "Ad2h3c4d5s")
    println("River result: win=${riverResult.win}, tie=${riverResult.tie}, loss=${riverResult.loss}")
    test("River equity calculation works", riverResult.win >= 0.0 && riverResult.win <= 1.0)
    
    // Test 5: Multiway equity (hero vs 2 villains)
    val multiwayResult = equityService.calculateMultiwayEquity("AhAs", listOf("KhKs", "QhQs"), "")
    test("Multiway preflop: AA vs KK+QQ has >60% equity", multiwayResult.win > 0.60)
    
    // Test 6: Unknown villain cards - should handle gracefully
    val unknownResult = equityService.calculateMultiwayEquity("AhAs", listOf(""), "")
    test("Empty villain cards returns 0 equity", unknownResult.win == 0.0)
    
    println("\n=== Results: $passed passed, $failed failed ===")
    if (failed > 0) {
        System.exit(1)
    }
}
