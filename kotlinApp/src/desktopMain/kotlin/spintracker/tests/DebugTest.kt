package spintracker.tests

import spintracker.data.Database
import spintracker.services.ImportService

fun main() {
    val testDir = "C:/Users/flore/Desktop/spintracker/publish/exemple-data/Betclic"
    val tempDb = java.io.File.createTempFile("spintest", ".db")
    tempDb.deleteOnExit()
    val db = Database(tempDb.absolutePath)

    val importService = ImportService(db)
    
    println("Starting import...")
    
    // Just do profit without EV calc
    val result = importService.importFiles(
        listOf(
            "$testDir/21793509_ExportHH_2026-1-2.txt",
            "$testDir/21793509_ExportHH_2026-1-3.txt"
        ),
        "jmenfouu"
    ) { }
    
    println("Imported: ${result.handsImported} hands")
    
    // Get stats
    val stats = db.getDashboardStats(null)
    println("Total Profit: ${stats.totalProfit}")
    println("Total EV: ${stats.totalEv}")
    println("Tournaments: ${stats.totalTournaments}")
}
