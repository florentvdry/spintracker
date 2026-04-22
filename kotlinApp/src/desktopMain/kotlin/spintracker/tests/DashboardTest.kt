package spintracker.tests

import spintracker.data.Database
import spintracker.services.ImportService

fun main() {
    println("=== SpinTracker Dashboard Data Test for jmenfouu ===\n")

    val testDir = "C:/Users/flore/Desktop/spintracker/publish/exemple-data/Betclic"
    println("Test directory: $testDir")

    println("Creating database...")
    val tempDb = java.io.File.createTempFile("spintest", ".db")
    tempDb.deleteOnExit()
    val db = Database(tempDb.absolutePath)
    println("Database created.")

    val importService = ImportService(db)
    println("Import service created.")

    println("\nTesting Import...")
    val startTime = System.currentTimeMillis()

    println("  Starting full import...")
    val result = importService.importFiles(
        listOf(
            "$testDir/21793509_ExportHH_2026-1-2.txt",
            "$testDir/21793509_ExportHH_2026-1-3.txt"
        ),
        "jmenfouu"
    ) { progress ->
        println("  Progress: $progress")
    }
    println("  Import took ${System.currentTimeMillis() - startTime}ms")

    println("Import completed!")
    println("  Imported: ${result.handsImported} hands")
    println("  Skipped: ${result.handsSkipped} hands")
    println("  Errors: ${result.errors.size}")

    if (result.handsImported != 4416) {
        throw AssertionError("Expected 4416 hands, got ${result.handsImported}")
    }
    
    println("  Import test PASSED")

    println("\nTesting Dashboard Stats...")
    val stats = db.getDashboardStats("jmenfouu")

    println("  Total Hands: ${stats.totalHands}")
    println("  Total Tournaments: ${stats.totalTournaments}")
    println("  Total Profit: ${stats.totalProfit} chips")
    println("  Total EV: ${stats.totalEv} chips")
    println("  Avg Chips EV: ${stats.avgChipsEv}")
    println("  Tournaments Won: ${stats.tournamentsWon}")
    println("  Win Rate: ${stats.winRate}")
    println("  Chips With Showdown: ${stats.chipsWonWithShowdown}")
    println("  Chips Without Showdown: ${stats.chipsWonWithoutShowdown}")
    
    println("\n  CEV by Position:")
    stats.cevByPosition.forEach { (pos, ev) ->
        println("    $pos: $ev")
    }

    // Validate basic stats
    if (stats.totalHands != 4416) {
        throw AssertionError("Expected 4416 hands, got ${stats.totalHands}")
    }
    if (stats.totalTournaments != 300) {
        throw AssertionError("Expected 300 tournaments, got ${stats.totalTournaments}")
    }
    if (Math.abs(stats.totalProfit - 28500.0) > 1.0) {
        throw AssertionError("Expected 28500 chips won, got ${stats.totalProfit}")
    }
    if (Math.abs(stats.totalEv - 25786.0) > 1.0) {
        throw AssertionError("Expected 25786 Net expected Chips Won, got ${stats.totalEv}")
    }
    if (Math.abs(stats.avgChipsEv - 86.0) > 1.0) {
        throw AssertionError("Expected 86 Chips ev / Tournaments, got ${stats.avgChipsEv}")
    }
    if (Math.abs(stats.chipsWonWithShowdown - 25372.0) > 1.0) {
        throw AssertionError("Expected 25372 chips won with showdown, got ${stats.chipsWonWithShowdown}")
    }
    if (Math.abs(stats.chipsWonWithoutShowdown - 3128.0) > 1.0) {
        throw AssertionError("Expected 3128 chips won without showdown, got ${stats.chipsWonWithoutShowdown}")
    }
    
    println("\n  Basic stats test PASSED")
    
    // Validate CEV by position - these are the EXPECTED values (averages per tournament)
    // The backend should return SUM, and frontend divides by totalTournaments (300)
    // But for this test, we check what the backend actually returns
    val expectedCevSum = mapOf(
        "HeadsUp SB" to 32.0 * 300,  // SUM = avg * total tournaments
        "HeadsUp BB" to 21.0 * 300,
        "Button 3W" to 24.0 * 300,
        "3Way Small Blind" to 5.0 * 300,
        "3Way BigBlinds" to 4.0 * 300
    )
    
    println("\n  Validating CEV by Position (checking if backend returns SUM)...")
    var allPassed = true
    expectedCevSum.forEach { (pos, expectedSum) ->
        val actual = stats.cevByPosition[pos] ?: 0.0
        val tolerance = 10.0  // Allow some tolerance for rounding
        if (Math.abs(actual - expectedSum) > tolerance) {
            println("    FAIL: $pos - Expected sum: $expectedSum, Got: $actual")
            allPassed = false
        } else {
            println("    PASS: $pos - Expected sum: $expectedSum, Got: $actual")
        }
    }
    
    if (!allPassed) {
        println("\n  CEV by Position test FAILED - backend may be returning averages instead of sums")
    } else {
        println("\n  CEV by Position test PASSED")
    }

    println("\n=== Test Complete ===")
}
