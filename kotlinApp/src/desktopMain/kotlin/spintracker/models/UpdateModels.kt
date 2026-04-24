package spintracker.models

data class GitHubRelease(
    val tagName: String,
    val name: String,
    val body: String,
    val publishedAt: String,
    val assets: List<GitHubAsset>
)

data class GitHubAsset(
    val name: String,
    val browserDownloadUrl: String,
    val size: Long
)

data class UpdateInfo(
    val version: String,
    val releaseName: String,
    val changelog: String,
    val downloadUrl: String,
    val fileSize: Long,
    val publishedAt: String
)

enum class UpdateCheckStatus {
    CHECKING,
    AVAILABLE,
    UP_TO_DATE,
    ERROR
}
