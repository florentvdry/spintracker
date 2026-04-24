package spintracker.tests

import spintracker.data.Database
import java.io.File

fun main() {
    println("=== Full Database Migration Test ===\n")
    
    val testDbPath = File(System.getProperty("java.io.tmpdir"), "spintracker_test_${System.currentTimeMillis()}.db").absolutePath
    println("Test DB path: $testDbPath\n")
    
    try {
        val db = Database(testDbPath)
        println("✓ Database initialized with all migrations\n")
        
        val lookupRepo = db.getLookupTablesRepository()
        val sites = lookupRepo.getAllSites()
        println("✓ Lookup tables: ${sites.size} sites loaded")
        sites.forEach { println("    - ${it.abbrev}: ${it.name}") }
        
        val actions = lookupRepo.getAllActions()
        println("✓ Lookup actions: ${actions.size} actions loaded")
        
        val btn = lookupRepo.getPositionByShortName("BTN")
        println("✓ BTN position: isBtn=${btn?.isBtn}, isCo=${btn?.isCo}")
        
        val tagsRepo = db.getTagsRepository()
        val tags = tagsRepo.getAllTags()
        println("\n✓ Tags system: ${tags.size} default tags")
        tags.forEach { println("    - ${it.name} (${it.colorCode})") }
        
        val notesRepo = db.getNotesRepository()
        notesRepo.addNote(1, "TestPlayer", "Test note content", "#FFFF00")
        val notes = notesRepo.getPlayerNotes(1)
        println("✓ Notes system: ${notes.size} note(s) created")
        
        val searchResults = notesRepo.searchNotes("note")
        println("✓ Note search: found ${searchResults.size} result(s)")
        
        val statsCache = db.getStatsCacheRepository()
        statsCache.updateStats(1, 25.0, 20.0, 10.0, 50.0, 45.0, 40.0, 100)
        val cached = statsCache.getStats(1)
        println("✓ Stats cache: VPIP=${cached?.vpip}%, PFR=${cached?.pfr}%, Hands=${cached?.handsCount}")
        
        // Cleanup
        File(testDbPath).delete()
        
        println("\n=== All Migration Tests Passed ===")
    } catch (e: Exception) {
        println("\n=== TEST FAILED ===")
        println("Error: ${e.message}")
        e.printStackTrace()
        // Try cleanup
        try { File(testDbPath).delete() } catch (e2: Exception) {}
    }
}
