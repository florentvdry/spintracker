package spintracker.services

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import spintracker.models.GitHubRelease
import spintracker.models.GitHubAsset
import spintracker.models.UpdateInfo
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.net.URI

class UpdateService(
    private val repoOwner: String,
    private val repoName: String
) {
    companion object {
        private const val HTTP_OK = 200
        
        fun create(): UpdateService {
            return UpdateService(
                repoOwner = "your-username",
                repoName = "spintracker"
            )
        }
    }

    private val httpClient = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build()
    
    private val apiBaseUrl = "https://api.github.com/repos/$repoOwner/$repoName"
    
    suspend fun getLatestRelease(): UpdateInfo? = withContext(Dispatchers.IO) {
        try {
            val request = HttpRequest.newBuilder()
                .uri(URI("$apiBaseUrl/releases/latest"))
                .header("Accept", "application/vnd.github.v3+json")
                .header("User-Agent", "SpinTracker-AutoUpdater")
                .GET()
                .build()
            
            val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
            
            if (response.statusCode() != HTTP_OK) {
                println("GitHub API error: ${response.statusCode()}")
                return@withContext null
            }
            
            try {
                val json = org.json.JSONObject(response.body())
                val assetsJson = json.getJSONArray("assets")
                
                val assets = (0 until assetsJson.length()).map { i ->
                    val asset = assetsJson.getJSONObject(i)
                    GitHubAsset(
                        name = asset.getString("name"),
                        browserDownloadUrl = asset.getString("browser_download_url"),
                        size = asset.getLong("size")
                    )
                }
                
                val release = GitHubRelease(
                    tagName = json.getString("tag_name"),
                    name = json.getString("name"),
                    body = json.getString("body"),
                    publishedAt = json.getString("published_at")
                )
                
                parseReleaseToUpdateInfo(release)
            } catch (e: org.json.JSONException) {
                println("Error parsing GitHub API response: ${e.message}")
                return@withContext null
            }
        } catch (e: Exception) {
            println("Error fetching latest release: ${e.message}")
            null
        }
    }
    
    private fun parseReleaseToUpdateInfo(release: GitHubRelease): UpdateInfo? {
        val version = extractVersionFromTag(release.tagName)
        val platformAsset = findPlatformAsset(release.assets)
        
        return if (platformAsset != null) {
            UpdateInfo(
                version = version,
                releaseName = release.name,
                changelog = release.body,
                downloadUrl = platformAsset.browserDownloadUrl,
                fileSize = platformAsset.size,
                publishedAt = release.publishedAt
            )
        } else {
            null
        }
    }
    
    fun extractVersionFromTag(tag: String): String {
        return tag.removePrefix("v")
    }
    
    private fun findPlatformAsset(assets: List<GitHubAsset>): GitHubAsset? {
        val os = System.getProperty("os.name").lowercase()
        return when {
            os.contains("win") -> assets.find { it.name.contains("win") }
            os.contains("mac") -> assets.find { it.name.contains("mac") || it.name.contains("osx") }
            os.contains("linux") -> assets.find { it.name.contains("linux") }
            else -> assets.firstOrNull()
        }
    }
    
    suspend fun compareVersions(current: String, latest: String): Int = withContext(Dispatchers.Default) {
        val currentParts = current.split(".").map { it.toIntOrNull() ?: 0 }
        val latestParts = latest.split(".").map { it.toIntOrNull() ?: 0 }
        
        val maxParts = maxOf(currentParts.size, latestParts.size)
        
        for (i in 0 until maxParts) {
            val currentPart = currentParts.getOrElse(i) { 0 }
            val latestPart = latestParts.getOrElse(i) { 0 }
            
            when {
                latestPart > currentPart -> return@withContext 1
                latestPart < currentPart -> return@withContext -1
            }
        }
        
        return@withContext 0
    }
}
