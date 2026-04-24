package spintracker.services

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class UpdateChecker(
    private val updateService: UpdateService,
    private val currentVersion: String
) {
    private var cachedResult: CheckResult? = null
    
    suspend fun checkForUpdates(force: Boolean = false): CheckResult = withContext(Dispatchers.Default) {
        if (!force && cachedResult != null) {
            return@withContext cachedResult!!
        }
        
        try {
            val updateInfo = updateService.getLatestRelease()
            
            if (updateInfo == null) {
                cachedResult = CheckResult.Error("Failed to fetch update information")
                return@withContext cachedResult!!
            }
            
            val comparison = updateService.compareVersions(currentVersion, updateInfo.version)
            
            cachedResult = if (comparison > 0) {
                CheckResult.Available(updateInfo)
            } else {
                CheckResult.UpToDate
            }
        } catch (e: Exception) {
            cachedResult = CheckResult.Error(e.message ?: "Unknown error")
        }
        
        return@withContext cachedResult!!
    }
    
    fun clearCache() {
        cachedResult = null
    }
}

sealed class CheckResult {
    object UpToDate : CheckResult()
    data class Available(val updateInfo: spintracker.models.UpdateInfo) : CheckResult()
    data class Error(val message: String) : CheckResult()
}
