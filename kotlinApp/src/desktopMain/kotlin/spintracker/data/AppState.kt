package spintracker.data

import spintracker.models.*
import spintracker.services.ImportService
import spintracker.services.DatabaseInfo
import spintracker.services.SettingsStorage
import java.io.File

class AppState {
    private val settingsStorage = SettingsStorage()
    
    val database = Database()
    val importService = ImportService(database)
    
    var heroName: String = "Hero"
    
    // Tags
    fun getAllTags(): List<Tag> {
        return database.getTagsRepository().getAllTags()
    }
    
    fun getPlayerTags(playerId: Long): List<Tag> {
        return database.getTagsRepository().getPlayerTags(playerId)
    }
    
    fun addTagToPlayer(playerId: Long, tagId: Long) {
        database.getTagsRepository().addTagToPlayer(playerId, tagId)
    }
    
    fun removeTagFromPlayer(playerId: Long, tagId: Long) {
        database.getTagsRepository().removeTagFromPlayer(playerId, tagId)
    }
    
    fun createTag(name: String, colorCode: String = "#808080"): Tag {
        return database.getTagsRepository().createTag(name, colorCode)
    }
    
    // Notes
    fun addNote(playerId: Long, playerName: String, content: String, colorCode: String = "#FFFFFF") {
        database.getNotesRepository().addNote(playerId, playerName, content, colorCode)
    }
    
    fun getPlayerNotes(playerId: Long): List<Note> {
        return database.getNotesRepository().getPlayerNotes(playerId)
    }
    
    fun searchNotes(query: String): List<Note> {
        return database.getNotesRepository().searchNotes(query)
    }
    
    fun deleteNote(noteId: Long) {
        database.getNotesRepository().deleteNote(noteId)
    }
    
    // Stats cache
    fun refreshStatsCache() {
        database.getStatsCacheRepository().refreshAllStats(database)
    }
    
    fun getPlayerCachedStats(playerId: Long): StatsCacheRepository.CachedStats? {
        return database.getStatsCacheRepository().getStats(playerId)
    }
    
    fun getAppVersion(): String {
        return "1.0.0"
    }
    
    fun isAutoUpdateEnabled(): Boolean {
        return settingsStorage.getBoolean("autoUpdateEnabled", true)
    }
    
    fun setAutoUpdateEnabled(enabled: Boolean) {
        settingsStorage.setBoolean("autoUpdateEnabled", enabled)
    }
    
    fun exportData(): Result<String> {
        return exportDataLocal()
    }
    
    suspend fun deleteAllHands(): Result<Unit> {
        return try {
            database.deleteAllHands()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    fun deleteAllDataLocal() {
        database.deleteAllData()
    }
    
    suspend fun openLogsFolder(): Result<Unit> {
        return try {
            val userHome = System.getProperty("user.home")
            val logsDir = File("$userHome/spintracker/logs")
            if (logsDir.exists()) {
                java.awt.Desktop.getDesktop().open(logsDir)
                Result.success(Unit)
            } else {
                logsDir.mkdirs()
                java.awt.Desktop.getDesktop().open(logsDir)
                Result.success(Unit)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
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
    
    fun getBankrollData(hero: String? = null): List<spintracker.models.BankrollDataPoint> {
        return database.getBankrollData(hero ?: heroName)
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
    
    // Database management (local, no API)
    fun getDatabaseInfo(): DatabaseInfo {
        return database.getDatabaseInfo()
    }
    
    fun exportDataLocal(): Result<String> {
        return database.exportData()
    }
}