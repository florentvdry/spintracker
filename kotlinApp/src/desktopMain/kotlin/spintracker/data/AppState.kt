package spintracker.data

import spintracker.models.*
import spintracker.services.ImportService

class AppState {
    val database = Database()
    val importService = ImportService(database)
    
    var heroName: String = "Hero"
    
    fun getDashboardStats(): DashboardStats {
        return database.getDashboardStats(null) // Show stats for all imported hands
    }
    
    fun getHands(limit: Int = 100): List<Hand> {
        return database.getHands(null, limit) // Show all imported hands
    }
    
    fun getAllPlayers(): List<Player> {
        return database.getAllPlayers()
    }
    
    fun getBuyIns(): List<Double> {
        return database.getBuyIns()
    }
    
    fun deleteAllHands() {
        database.deleteAllHands()
    }
    
    fun importFile(filePath: String): Int {
        var imported = 0
        try {
            // heroName passed to importFiles - could be used if needed, otherwise parser detects hero from hand
            val result = importService.importFiles(listOf(filePath), "jmenfouu") {}
            imported = result.handsImported
        } catch (e: Exception) {
            println("Import error: ${e.message}")
        }
        return imported
    }
}