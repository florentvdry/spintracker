package spintracker.services

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.net.URI


class UpdateDownloader {
    private val httpClient = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build()
    
    suspend fun download(
        url: String,
        destination: File,
        onProgress: (DownloadProgress) -> Unit
    ): Result<File> = withContext(Dispatchers.IO) {
        try {
            val request = HttpRequest.newBuilder()
                .uri(URI(url))
                .header("User-Agent", "SpinTracker-AutoUpdater")
                .GET()
                .build()
            
            val response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream())
            
            if (response.statusCode() != 200) {
                return@withContext Result.failure(Exception("Download failed: HTTP ${response.statusCode()}"))
            }
            
            val contentLength = response.headers().firstValue("content-length").orElse(null)
                ?.toLongOrNull() ?: -1L
            
            val inputStream = response.body()
            val outputStream = FileOutputStream(destination)
            
            val buffer = ByteArray(8192)
            var downloadedBytes = 0L
            var bytesRead: Int
            
            inputStream.use { input ->
                outputStream.use { output ->
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        downloadedBytes += bytesRead
                        
                        if (contentLength > 0) {
                            val progress = (downloadedBytes.toDouble() / contentLength.toDouble()).toFloat()
                            onProgress(DownloadProgress(progress, downloadedBytes, contentLength))
                        }
                    }
                }
            }
            
            Result.success(destination)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}

data class DownloadProgress(
    val progress: Float,
    val downloadedBytes: Long,
    val totalBytes: Long
)

private inline fun <R> String?.mapOrNull(block: (String) -> R): R? {
    return this?.let { block(it) }
}
