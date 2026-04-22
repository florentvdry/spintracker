package spintracker.data

import spintracker.models.*
import spintracker.services.ImportService

class AppState {
    val database = Database()
    val importService = ImportService(database)
    
    var heroName: String = "Hero"
    
    fun getDashboardStats(hero: String? = null): DashboardStats {
        return database.getDashboardStats(hero ?: heroName)
    }
    
    fun getHands(hero: String? = null, limit: Int = 100): List<Hand> {
        return database.getHands(hero ?: heroName, limit)
    }
    
    fun getGraphData(hero: String? = null): List<GraphPoint> {
        return database.getGraphData(hero ?: heroName)
    }
    
    fun getAllPlayers(): List<Player> {
        return database.getAllPlayers()
    }
    
    fun getPlayerStats(playerId: Long): PlayerStats {
        return database.getPlayerStats(playerId)
    }
    
    fun getBuyIns(): List<Double> {
        return database.getBuyIns()
    }
    
    fun deleteAllHands() {
        database.deleteAllHands()
    }
    
    fun importFiles(filePaths: List<String>, onProgress: (ImportService.ImportProgress) -> Unit = {}) {
        try {
            val result = importService.importFiles(filePaths, heroName, onProgress)
            
            if (heroName == "Hero" || heroName.isEmpty()) {
                val players = database.getAllPlayers()
                if (players.isNotEmpty()) {
                    heroName = players.first().name
                }
            }
        } catch (e: Exception) {
            println("Import error: ${e.message}")
        }
    }
    
    fun importFile(filePath: String, onProgress: (ImportService.ImportProgress) -> Unit = {}): Int {
        var imported = 0
        try {
            val result = importService.importFiles(listOf(filePath), heroName, onProgress)
            imported = result.handsImported
            
            if (heroName == "Hero" || heroName.isEmpty()) {
                val players = database.getAllPlayers()
                if (players.isNotEmpty()) {
                    heroName = players.first().name
                }
            }
        } catch (e: Exception) {
            println("Import error: ${e.message}")
        }
        return imported
    }
}