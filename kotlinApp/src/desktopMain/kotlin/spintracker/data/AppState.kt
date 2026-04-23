package spintracker.data

import spintracker.models.*
import spintracker.services.ImportService
import spintracker.services.ApiClient
import spintracker.services.DatabaseInfo

class AppState {
    val database = Database()
    val importService = ImportService(database)
    val apiClient = ApiClient()
    
    var heroName: String = "Hero"
    
    suspend fun checkServerStatus(): Boolean {
        return apiClient.checkServerStatus()
    }
    
    suspend fun getAppVersion(): String {
        return apiClient.getAppVersion()
    }
    
    suspend fun getDatabases(): List<DatabaseInfo> {
        return apiClient.getDatabases()
    }
    
    suspend fun createDatabase(name: String): Result<DatabaseInfo> {
        return apiClient.createDatabase(name)
    }
    
    suspend fun setActiveDatabase(id: String): Result<Unit> {
        return apiClient.setActiveDatabase(id)
    }
    
    suspend fun deleteDatabase(id: String): Result<Unit> {
        return apiClient.deleteDatabase(id)
    }
    
    suspend fun renameDatabase(id: String, name: String): Result<Unit> {
        return apiClient.renameDatabase(id, name)
    }
    
    suspend fun deleteAllHands(): Result<Unit> {
        return apiClient.deleteAllHands()
    }
    
    suspend fun exportData(): Result<String> {
        return apiClient.exportData()
    }
    
    suspend fun openLogsFolder(): Result<Unit> {
        return apiClient.openLogsFolder()
    }
    
    fun getDashboardStats(hero: String? = null): DashboardStats {
        return database.getDashboardStats(hero ?: heroName)
    }
    
    fun getHands(hero: String? = null, limit: Int = 100): List<Hand> {
        return database.getHands(hero ?: heroName, limit)
    }
    
    fun getGraphData(hero: String? = null): List<GraphPoint> {
        return database.getGraphData(hero ?: heroName)
    }
    
    fun getRecentSessions(hero: String? = null, limit: Int = 10): List<spintracker.models.Session> {
        return database.getRecentSessions(hero ?: heroName, limit)
    }
    
    fun getTournaments(hero: String? = null, limit: Int = 50): List<Map<String, Any?>> {
        return database.getTournaments(hero ?: heroName, limit)
    }
    
    fun getHandsByGameId(gameId: String, hero: String): List<Map<String, Any?>> {
        return database.getHandsByGameId(gameId, hero)
    }
    
    fun getAllPlayers(): List<Player> {
        return database.getAllPlayers()
    }
    
    fun getPlayerStats(playerId: Long): PlayerStats {
        return database.getPlayerStats(playerId)
    }
    
    fun getHandsAgainstPlayer(opponentName: String, heroName: String, limit: Int = 20, page: Int = 1): List<Map<String, Any?>> {
        return database.getHandsAgainstPlayer(opponentName, heroName, limit, page)
    }
    
    fun getCountHandsAgainstPlayer(opponentName: String, heroName: String): Int {
        return database.getCountHandsAgainstPlayer(opponentName, heroName)
    }
    
    fun getBuyIns(): List<Double> {
        return database.getBuyIns()
    }
    
    fun clearAllHands() {
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
    
    fun getHandReplayData(handId: String, heroName: String): Map<String, Any?>? {
        return database.getHandReplayData(handId, heroName)
    }
}