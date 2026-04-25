package spintracker.tests

import spintracker.data.Database
import spintracker.parsers.BetclicParser
import spintracker.services.ImportService

fun main() {
    println("=== SpinTracker Import Test ===\n")

    val testDir = "C:/Users/flore/Desktop/spintracker/backend/bin/Debug/net8.0/exemple-data/Betclic"
    println("Test directory: $testDir")

    val f1 = java.io.File("$testDir/21793509_ExportHH_2026-1-2.txt")
    val f2 = java.io.File("$testDir/21793509_ExportHH_2026-1-3.txt")
    println("File 1 exists: ${f1.exists()}")
    println("File 2 exists: ${f2.exists()}")

    println("Creating database...")
    val tempDb = java.io.File.createTempFile("spintest", ".db")
    tempDb.deleteOnExit()
    val db = Database(tempDb.absolutePath)
    println("Database created.")

    val importService = ImportService(db)
    println("Import service created.")

    println("\nTesting Import... (this may take a while)")
    val startTime = System.currentTimeMillis()

    // First test basic file reading
    println("  Reading files...")
    val file1 = java.io.File("$testDir/21793509_ExportHH_2026-1-2.txt")
    val file2 = java.io.File("$testDir/21793509_ExportHH_2026-1-3.txt")
    val content1 = file1.readText()
    val content2 = file2.readText()
    println("  Read ${content1.length} + ${content2.length} chars")

    // Quick test parse
    println("  Testing parser...")
    val parser = BetclicParser()
    val parseResult = parser.parseFile(content1)
    println("  Parsed ${parseResult.hands.size} hands from file 1")

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

    // Debug first few hands
    println("\n  --- Hand Debug (First 50 hands) ---")
    parseResult.hands.take(50).forEach { hand ->
        val hero = hand.players.find { it.isHero }
        val profit = (hero?.winnings ?: 0.0) - (hero?.investment ?: 0.0)
        if (profit != 0.0) {
           println("  Hand ${hand.id}: Profit=$profit, Showdown=${hand.wentToShowdown}")
        }
    }
    println("  -----------------------------------\n")

    println("\nTesting Dashboard Stats...")
    val stats = db.getDashboardStats(null)

    println("  Total Hands: ${stats.totalHands}")
    println("  Total Tournaments: ${stats.totalTournaments}")
    println("  Total Profit: ${stats.totalProfit} chips")
    println("  Total EV: ${stats.totalEv} chips")
    println("  Avg Chips EV: ${stats.avgChipsEv}")
    println("  Tournaments Won: ${stats.tournamentsWon}")
    println("  Win Rate: ${stats.winRate}")
    println("  Chips With Showdown: ${stats.chipsWonWithShowdown}")
    println("  Chips Without Showdown: ${stats.chipsWonWithoutShowdown}")
    
    println("  CEV by Position:")
    stats.cevByPosition.forEach { (pos, ev) ->
        println("    $pos: $ev")
    }

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
    
    val expectedCev = mapOf(
        "HeadsUp SB" to 9748.88,
        "HeadsUp BB" to 6305.85,
        "Button 3W" to 7167.3,
        "3Way Small Blind" to 1354.18,
        "3Way BigBlinds" to 1209.07
    )
    
    expectedCev.forEach { (pos, expected) ->
        val actual = stats.cevByPosition[pos] ?: 0.0
        if (Math.abs(actual - expected) > 1.0) {
            throw AssertionError("Expected $expected EV for $pos, got $actual")
        }
    }
    
    println("  Dashboard test PASSED")

    println("\n=== All tests passed! ===")
}