package spintracker.services

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import spintracker.models.UpdateInfo

class UpdateChecker(
    private val updateService: UpdateService,
    private val currentVersion: String
) {
    @Volatile private var cachedResult: CheckResult? = null
    
    suspend fun checkForUpdates(force: Boolean = false): CheckResult = withContext(Dispatchers.Default) {
        val cached = cachedResult
        if (!force && cached != null) {
            return@withContext cached
        }
        
        try {
            val updateInfo = updateService.getLatestRelease()
            
            if (updateInfo == null) {
                cachedResult = CheckResult.Error("Failed to fetch update information")
                return@withContext cachedResult
            }
            
            val comparison = updateService.compareVersions(currentVersion, updateInfo.version)
            
            cachedResult = if (comparison > 0) {
                CheckResult.Available(updateInfo)
            } else {
                CheckResult.UpToDate
            }
        } catch (e: Exception) {
            cachedResult = CheckResult.Error(e.message ?: "Unknown error: ${e.javaClass.simpleName}")
        }
        
        return@withContext cachedResult
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
