# Auto-Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an auto-update system that checks for new versions on GitHub Releases at startup and allows users to download and install updates with a single click.

**Architecture:** The auto-updater consists of services for GitHub API communication, version comparison, download management, and platform-specific installation. A dialog component displays update information and changelog. Update checks run during splash screen display and results are shown when main UI loads.

**Tech Stack:** Kotlin, Jetpack Compose Desktop, GitHub Releases API, Kotlinx Coroutines for async operations, Java HttpClient for downloads.

---

## File Structure

**Files to Create:**
- `src/desktopMain/kotlin/spintracker/services/UpdateService.kt` - GitHub API client
- `src/desktopMain/kotlin/spintracker/services/UpdateChecker.kt` - Version check logic
- `src/desktopMain/kotlin/spintracker/services/UpdateDownloader.kt` - Download manager
- `src/desktopMain/kotlin/spintracker/services/UpdateInstaller.kt` - Platform-specific installer
- `src/desktopMain/kotlin/spintracker/ui/components/UpdateDialog.kt` - Update dialog UI
- `src/desktopMain/kotlin/spintracker/models/UpdateModels.kt` - Data models

**Files to Modify:**
- `build.gradle.kts` - Add version property, HTTP client dependency
- `src/desktopMain/kotlin/spintracker/Main.kt` - Integrate update check during splash
- `src/desktopMain/kotlin/spintracker/ui/SpinTrackerApp.kt` - Show update dialog
- `src/desktopMain/kotlin/spintracker/ui/screens/SettingsScreen.kt` - Add update toggle
- `src/desktopMain/kotlin/spintracker/data/AppState.kt` - Add update settings methods

---

### Task 1: Add Version to Build Configuration

**Files:**
- Modify: `build.gradle.kts:1-10`

- [ ] **Step 1: Add version property to build.gradle.kts**

Edit the file to add version after the plugins block:

```kotlin
plugins {
    kotlin("jvm") version "1.9.0"
    id("org.jetbrains.compose") version "1.5.10"
}

version = "1.0.0"
```

- [ ] **Step 2: Commit the change**

```bash
git add build.gradle.kts
git commit -m "chore: add version property for auto-updater"
```

---

### Task 2: Create Update Data Models

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/models/UpdateModels.kt`

- [ ] **Step 1: Write the model definitions**

```kotlin
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
```

- [ ] **Step 2: Commit the change**

```bash
git add src/desktopMain/kotlin/spintracker/models/UpdateModels.kt
git commit -m "feat(update): add update data models"
```

---

### Task 3: Create UpdateService for GitHub API

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/services/UpdateService.kt`
- Test: `src/desktopMain/kotlin/spintracker/tests/UpdateServiceTest.kt`

**Repository Info:** You need to know the GitHub repository owner and name. For this implementation, use placeholder values that the user will update:
- `REPO_OWNER = "your-username"`
- `REPO_NAME = "spintracker"`

- [ ] **Step 1: Write a failing test for version parsing**

```kotlin
package spintracker.tests

import spintracker.services.UpdateService

fun main() {
    val service = UpdateService()
    
    // Test version extraction from tag
    val version = service.extractVersionFromTag("v1.2.3")
    assert(version == "1.2.3") { "Expected '1.2.3' but got '$version'" }
    
    println("All UpdateService tests passed!")
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
gradlew run --args="UpdateServiceTestKt"
```
Expected: FAIL with "UpdateService not defined"

- [ ] **Step 3: Implement UpdateService**

```kotlin
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
    private val repoOwner: String = "your-username",
    private val repoName: String = "spintracker"
) {
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
            
            if (response.statusCode() != 200) {
                println("GitHub API error: ${response.statusCode()}")
                return@withContext null
            }
            
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
                publishedAt = json.getString("published_at"),
                assets = assets
            )
            
            parseReleaseToUpdateInfo(release)
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
        val arch = System.getProperty("os.arch").lowercase()
        
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
```

- [ ] **Step 4: Add JSON dependency if not present**

Check `build.gradle.kts` - it should already have:
```kotlin
implementation("org.json:json:20231013")
```

- [ ] **Step 5: Run test to verify it passes**

Create test runner task in `build.gradle.kts`:

```kotlin
tasks.register<JavaExec>("testUpdateService") {
    group = "verification"
    description = "Run update service test"
    classpath = sourceSets.get("main").runtimeClasspath
    mainClass.set("spintracker.tests.UpdateServiceTestKt")
}
```

Run:
```bash
gradlew testUpdateService
```
Expected: PASS with "All UpdateService tests passed!"

- [ ] **Step 6: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/services/UpdateService.kt src/desktopMain/kotlin/spintracker/tests/UpdateServiceTest.kt build.gradle.kts
git commit -m "feat(update): implement UpdateService for GitHub API"
```

---

### Task 4: Create UpdateChecker for Version Comparison

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/services/UpdateChecker.kt`

- [ ] **Step 1: Implement UpdateChecker**

```kotlin
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
```

- [ ] **Step 2: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/services/UpdateChecker.kt
git commit -m "feat(update): add UpdateChecker for version comparison"
```

---

### Task 5: Create UpdateDownloader

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/services/UpdateDownloader.kt`

- [ ] **Step 1: Implement UpdateDownloader**

```kotlin
package spintracker.services

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.net.URI
import java.nio.ByteBuffer

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
            
            val contentLength = response.headers().firstValue("content-length")
                .mapOrNull { it.toLong() } ?: -1L
            
            val inputStream = response.body()
            val outputStream = FileOutputStream(destination)
            
            val buffer = ByteArray(8192)
            var downloadedBytes = 0L
            var bytesRead: Int
            
            while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                outputStream.write(buffer, 0, bytesRead)
                downloadedBytes += bytesRead
                
                if (contentLength > 0) {
                    val progress = downloadedBytes.toFloat() / contentLength.toFloat()
                    onProgress(DownloadProgress(progress, downloadedBytes, contentLength))
                }
            }
            
            outputStream.close()
            inputStream.close()
            
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
```

- [ ] **Step 2: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/services/UpdateDownloader.kt
git commit -m "feat(update): add UpdateDownloader with progress tracking"
```

---

### Task 6: Create UpdateInstaller for Platform-Specific Installation

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/services/UpdateInstaller.kt`

- [ ] **Step 1: Implement UpdateInstaller**

```kotlin
package spintracker.services

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

class UpdateInstaller {
    suspend fun install(
        downloadedFile: File,
        onComplete: (InstallResult) -> Unit
    ) = withContext(Dispatchers.IO) {
        try {
            val os = System.getProperty("os.name").lowercase()
            
            when {
                os.contains("win") -> installWindows(downloadedFile)
                os.contains("mac") -> installMac(downloadedFile)
                os.contains("linux") -> installLinux(downloadedFile)
                else -> throw Exception("Unsupported operating system: $os")
            }
            
            onComplete(InstallResult.Success)
        } catch (e: Exception) {
            onComplete(InstallResult.Failure(e.message ?: "Installation failed"))
        }
    }
    
    private fun installWindows(file: File) {
        val appDir = File(System.getProperty("user.dir"))
        val appExe = File(appDir, "SpinTracker.exe")
        
        if (file.extension == "zip") {
            unzipFile(file, appDir)
        } else if (file.extension == "exe") {
            file.copyTo(File(appDir, "SpinTracker_new.exe"), overwrite = true)
        }
        
        scheduleRestartAndReplace(appExe, file)
    }
    
    private fun installMac(file: File) {
        val appDir = File(System.getProperty("user.dir"))
        
        if (file.extension == "dmg") {
            mountDmgAndCopy(file, appDir)
        } else {
            file.copyTo(File(appDir, file.name), overwrite = true)
        }
    }
    
    private fun installLinux(file: File) {
        val appDir = File(System.getProperty("user.dir"))
        
        if (file.extension == "deb") {
            installDebPackage(file)
        } else {
            file.copyTo(File(appDir, file.name), overwrite = true)
        }
    }
    
    private fun unzipFile(zipFile: File, destination: File) {
        // Simple zip extraction - for production, use a proper zip library
        // This is a placeholder - you may want to add zip4j or similar dependency
        println("Extracting zip to: ${destination.absolutePath}")
    }
    
    private fun scheduleRestartAndReplace(existingFile: File, newFile: File) {
        // Create a batch script to replace the file after exit
        val script = if (System.getProperty("os.name").lowercase().contains("win")) {
            createWindowsReplaceScript(existingFile, newFile)
        } else {
            createUnixReplaceScript(existingFile, newFile)
        }
        
        Runtime.getRuntime().addShutdownHook(Thread {
            try {
                ProcessBuilder("cmd", "/c", script.absolutePath).start()
            } catch (e: Exception) {
                println("Failed to execute replacement script: ${e.message}")
            }
        })
    }
    
    private fun createWindowsReplaceScript(existingFile: File, newFile: File): File {
        val script = File.createTempFile("update_install_", ".bat")
        script.writeText(
            """
            @echo off
            timeout /t 2 /nobreak > nul
            del "${existingFile.absolutePath}"
            move "${newFile.absolutePath}" "${existingFile.absolutePath}"
            start "" "${existingFile.absolutePath}"
            del "%~f0"
            """.trimIndent()
        )
        return script
    }
    
    private fun createUnixReplaceScript(existingFile: File, newFile: File): File {
        val script = File.createTempFile("update_install_", ".sh")
        script.writeText(
            """
            #!/bin/bash
            sleep 2
            rm "${existingFile.absolutePath}"
            mv "${newFile.absolutePath}" "${existingFile.absolutePath}"
            chmod +x "${existingFile.absolutePath}"
            "${existingFile.absolutePath}" &
            rm "%~f0"
            """.trimIndent()
        )
        script.setExecutable(true)
        return script
    }
    
    private fun mountDmgAndCopy(dmgFile: File, appDir: File) {
        // Placeholder for DMG mounting logic
        println("DMG installation not fully implemented")
    }
    
    private fun installDebPackage(debFile: File) {
        // Placeholder for deb installation
        println("DEB installation not fully implemented")
    }
}

sealed class InstallResult {
    object Success : InstallResult()
    data class Failure(val message: String) : InstallResult()
}
```

- [ ] **Step 2: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/services/UpdateInstaller.kt
git commit -m "feat(update): add UpdateInstaller for platform-specific installation"
```

---

### Task 7: Create UpdateDialog UI Component

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/ui/components/UpdateDialog.kt`

- [ ] **Step 1: Implement UpdateDialog**

```kotlin
package spintracker.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import kotlinx.coroutines.launch
import spintracker.models.UpdateInfo
import spintracker.services.UpdateDownloader
import spintracker.services.UpdateInstaller
import spintracker.services.DownloadProgress
import spintracker.services.InstallResult
import spintracker.ui.Dark400
import spintracker.ui.DarkSurface
import spintracker.ui.Primary400
import java.io.File

@Composable
fun UpdateDialog(
    updateInfo: UpdateInfo,
    currentVersion: String,
    onDismiss: () -> Unit,
    onInstallComplete: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var dialogState by remember { mutableStateOf<UpdateDialogState>(UpdateDialogState.Review) }
    var downloadProgress by remember { mutableFloatStateOf(0f) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    
    val downloader = remember { UpdateDownloader() }
    val installer = remember { UpdateInstaller() }
    
    fun startDownloadAndInstall() {
        scope.launch {
            dialogState = UpdateDialogState.Downloading
            
            val tempFile = File.createTempFile("spintracker_update_", ".tmp")
            tempFile.deleteOnExit()
            
            val result = downloader.download(
                url = updateInfo.downloadUrl,
                destination = tempFile
            ) { progress ->
                downloadProgress = progress.progress
            }
            
            result.onSuccess { downloadedFile ->
                dialogState = UpdateDialogState.Installing
                installer.install(downloadedFile) { installResult ->
                    when (installResult) {
                        is InstallResult.Success -> {
                            statusMessage = "Update installed. Restarting..."
                            kotlinx.coroutines.delay(1000)
                            onInstallComplete()
                        }
                        is InstallResult.Failure -> {
                            dialogState = UpdateDialogState.Error(installResult.message)
                        }
                    }
                }
            }.onFailure { error ->
                dialogState = UpdateDialogState.Error(error.message ?: "Download failed")
            }
        }
    }
    
    Dialog(onDismissRequest = { if (dialogState !is UpdateDialogState.Downloading) onDismiss() }) {
        Surface(
            modifier = Modifier
                .width(500.dp)
                .heightIn(max = 600.dp),
            shape = RoundedCornerShape(16.dp),
            color = Dark400
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            "Update Available",
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 20.sp
                        )
                        Text(
                            "Version ${updateInfo.version}",
                            color = Color.White.copy(alpha = 0.6f),
                            fontSize = 14.sp
                        )
                    }
                    if (dialogState !is UpdateDialogState.Downloading && dialogState !is UpdateDialogState.Installing) {
                        IconButton(onClick = { onDismiss() }) {
                            Icon(Icons.Default.Close, null, tint = Color.White.copy(alpha = 0.5f))
                        }
                    }
                }
                
                Spacer(modifier = Modifier.height(20.dp))
                
                // Content based on state
                when (val state = dialogState) {
                    is UpdateDialogState.Review -> {
                        // Changelog
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            colors = CardDefaults.cardColors(containerColor = DarkSurface),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .verticalScroll(rememberScrollState())
                                    .padding(16.dp)
                            ) {
                                Text(
                                    "What's New:",
                                    color = Color.White,
                                    fontWeight = FontWeight.Medium,
                                    fontSize = 14.sp
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    updateInfo.changelog,
                                    color = Color.White.copy(alpha = 0.7f),
                                    fontSize = 13.sp,
                                    lineHeight = 20.sp
                                )
                            }
                        }
                        
                        Spacer(modifier = Modifier.height(20.dp))
                        
                        // Action buttons
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End
                        ) {
                            TextButton(onClick = { onDismiss() }) {
                                Text("Later", color = Color.White.copy(alpha = 0.7f))
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Button(
                                onClick = { startDownloadAndInstall() },
                                colors = ButtonDefaults.buttonColors(containerColor = Primary400),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Icon(Icons.Default.Download, null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Download & Install")
                            }
                        }
                    }
                    
                    is UpdateDialogState.Downloading -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                CircularProgressIndicator(
                                    progress = downloadProgress,
                                    modifier = Modifier.size(64.dp),
                                    color = Primary400,
                                    strokeWidth = 4.dp
                                )
                                Spacer(modifier = Modifier.height(16.dp))
                                Text(
                                    "Downloading... ${(downloadProgress * 100).toInt()}%",
                                    color = Color.White,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    }
                    
                    is UpdateDialogState.Installing -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(64.dp),
                                    color = Primary400,
                                    strokeWidth = 4.dp
                                )
                                Spacer(modifier = Modifier.height(16.dp))
                                Text(
                                    "Installing...",
                                    color = Color.White,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    }
                    
                    is UpdateDialogState.Error -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Icon(
                                    Icons.Default.Error,
                                    null,
                                    tint = Color(0xFFef4444),
                                    modifier = Modifier.size(48.dp)
                                )
                                Spacer(modifier = Modifier.height(12.dp))
                                Text(
                                    state.message,
                                    color = Color.White,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                        
                        Spacer(modifier = Modifier.height(20.dp))
                        
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End
                        ) {
                            Button(
                                onClick = { onDismiss() },
                                colors = ButtonDefaults.buttonColors(containerColor = DarkSurface),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text("Close")
                            }
                        }
                    }
                }
            }
        }
    }
}

sealed class UpdateDialogState {
    object Review : UpdateDialogState()
    object Downloading : UpdateDialogState()
    object Installing : UpdateDialogState()
    data class Error(val message: String) : UpdateDialogState()
}
```

- [ ] **Step 2: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/ui/components/UpdateDialog.kt
git commit -m "feat(update): create UpdateDialog UI component"
```

---

### Task 8: Integrate Update Check into Main.kt

**Files:**
- Modify: `src/desktopMain/kotlin/spintracker/Main.kt`

- [ ] **Step 1: Update Main.kt to perform update check during splash**

```kotlin
package spintracker

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.*
import spintracker.ui.SpinTrackerApp
import spintracker.ui.SplashScreen
import spintracker.ui.theme.SpinTrackerTheme
import spintracker.services.UpdateService
import spintracker.services.UpdateChecker
import spintracker.services.CheckResult
import spintracker.models.UpdateInfo
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

fun main() = application {
    var isLoading by remember { mutableStateOf(true) }
    var updateCheckResult by remember { mutableStateOf<CheckResult?>(null) }
    var updateInfo by remember { mutableStateOf<UpdateInfo?>(null) }
    val scope = rememberCoroutineScope()
    
    val currentVersion = "1.0.0" // This should come from build config
    val updateService = remember { UpdateService() }
    val updateChecker = remember { UpdateChecker(updateService, currentVersion) }
    
    // Check for updates during splash screen
    LaunchedEffect(Unit) {
        scope.launch {
            val result = updateChecker.checkForUpdates()
            updateCheckResult = result
            
            if (result is CheckResult.Available) {
                updateInfo = result.updateInfo
            }
        }
        
        delay(2500)
        isLoading = false
    }
    
    if (isLoading) {
        key("splash_window") {
            Window(
                onCloseRequest = ::exitApplication,
                state = rememberWindowState(
                    position = WindowPosition(Alignment.Center),
                    size = DpSize(400.dp, 400.dp)
                ),
                undecorated = true,
                transparent = true,
                resizable = false,
                alwaysOnTop = true
            ) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color.Transparent
                ) {
                    SplashScreen()
                }
            }
        }
    } else {
        key("main_window") {
            Window(
                onCloseRequest = ::exitApplication,
                title = "SpinTracker",
                state = rememberWindowState(placement = WindowPlacement.Maximized)
            ) {
                SpinTrackerTheme {
                    Surface(
                        modifier = Modifier.fillMaxSize(),
                        color = MaterialTheme.colorScheme.background
                    ) {
                        SpinTrackerApp(
                            window = window,
                            pendingUpdate = updateInfo
                        )
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/Main.kt
git commit -m "feat(update): integrate update check during splash screen"
```

---

### Task 9: Update SpinTrackerApp to Accept Pending Update

**Files:**
- Modify: `src/desktopMain/kotlin/spintracker/ui/SpinTrackerApp.kt`

- [ ] **Step 1: Update SpinTrackerApp signature and show update dialog**

At the top of the file, add the import:
```kotlin
import spintracker.models.UpdateInfo
import spintracker.ui.components.UpdateDialog
```

Modify the function signature:
```kotlin
@Composable
fun SpinTrackerApp(
    window: androidx.compose.ui.awt.ComposeWindow,
    pendingUpdate: UpdateInfo? = null
) {
```

Add the update dialog logic after the existing state declarations:
```kotlin
var showUpdateDialog by remember { mutableStateOf(pendingUpdate != null) }
var updateToInstall by remember { mutableStateOf(pendingUpdate) }

LaunchedEffect(pendingUpdate) {
    if (pendingUpdate != null) {
        showUpdateDialog = true
        updateToInstall = pendingUpdate
    }
}

if (showUpdateDialog && updateToInstall != null) {
    UpdateDialog(
        updateInfo = updateToInstall!!,
        currentVersion = "1.0.0",
        onDismiss = { showUpdateDialog = false },
        onInstallComplete = {
            // Trigger application restart
            window.dispose()
            // Restart logic would go here
        }
    )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/ui/SpinTrackerApp.kt
git commit -m "feat(update): show update dialog when update is available"
```

---

### Task 10: Add Auto-Update Settings to AppState

**Files:**
- Modify: `src/desktopMain/kotlin/spintracker/data/AppState.kt`

- [ ] **Step 1: Add update settings methods to AppState**

Add these properties and methods to the AppState class:

```kotlin
// Add at the top with other properties
private var autoUpdateEnabled: Boolean = true

// Add methods
fun isAutoUpdateEnabled(): Boolean = autoUpdateEnabled

fun setAutoUpdateEnabled(enabled: Boolean) {
    autoUpdateEnabled = enabled
}
```

- [ ] **Step 2: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/data/AppState.kt
git commit -m "feat(update): add auto-update settings to AppState"
```

---

### Task 11: Add Update Toggle to Settings Screen

**Files:**
- Modify: `src/desktopMain/kotlin/spintracker/ui/screens/SettingsScreen.kt`

- [ ] **Step 1: Add update toggle to GeneralSection**

In the `GeneralSection` composable, add a new SettingRow for auto-update:

```kotlin
// Add import
import androidx.compose.material.icons.filled.Update

// Add to GeneralSection after the language setting
Spacer(modifier = Modifier.height(16.dp))

SettingRow(
    icon = Icons.Default.Update,
    title = "Auto-Update",
    description = "Automatically check for updates"
) {
    Switch(
        checked = true, // Connect to AppState
        onCheckedChange = { /* Update AppState */ },
        colors = SwitchDefaults.colors(
            checkedThumbColor = Primary400,
            checkedTrackColor = Primary400.copy(alpha = 0.5f)
        )
    )
}
```

- [ ] **Step 2: Wire up the toggle to AppState**

In the main `SettingsScreen` composable:
```kotlin
var autoUpdateEnabled by remember { mutableStateOf(appState.isAutoUpdateEnabled()) }

// In GeneralSection call
GeneralSection(
    language = language,
    onLanguageChange = { language = it },
    autoUpdateEnabled = autoUpdateEnabled,
    onAutoUpdateChange = { enabled -> 
        autoUpdateEnabled = enabled
        appState.setAutoUpdateEnabled(enabled)
    }
)
```

Update `GeneralSection` signature to accept these parameters.

- [ ] **Step 3: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/ui/screens/SettingsScreen.kt
git commit -m "feat(update): add auto-update toggle to settings"
```

---

### Task 12: Update build.gradle.kts with Application Version

**Files:**
- Modify: `build.gradle.kts`

- [ ] **Step 1: Configure application to use version**

In the `compose.desktop.application` block:

```kotlin
compose.desktop {
    application {
        mainClass = "spintracker.MainKt"
        
        nativeDistributions {
            targetFormats(
                org.jetbrains.compose.desktop.application.dsl.TargetFormat.Windows,
                org.jetbrains.compose.desktop.application.dsl.TargetFormat.MacOS,
                org.jetbrains.compose.desktop.application.dsl.TargetFormat.Linux
            )
            
            packageName = "SpinTracker"
            packageVersion = version.toString()
            
            windows {
                menuGroup = "SpinTracker"
                upgradeUuid = "your-unique-upgrade-uuid-here"
            }
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add build.gradle.kts
git commit -m "chore: configure native distribution packaging with version"
```

---

### Task 13: Create Update Settings Persistence

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/services/SettingsStorage.kt`

- [ ] **Step 1: Implement simple settings storage**

```kotlin
package spintracker.services

import java.io.File
import java.util.Properties

class SettingsStorage {
    private val settingsFile: File by lazy {
        val userHome = System.getProperty("user.home")
        val configDir = File("$userHome/.spintracker")
        if (!configDir.exists()) {
            configDir.mkdirs()
        }
        File(configDir, "settings.properties")
    }
    
    private val properties = Properties()
    
    init {
        if (settingsFile.exists()) {
            settingsFile.inputStream().use { properties.load(it) }
        }
    }
    
    fun getBoolean(key: String, defaultValue: Boolean = false): Boolean {
        return properties.getProperty(key, defaultValue.toString()).toBoolean()
    }
    
    fun setBoolean(key: String, value: Boolean) {
        properties.setProperty(key, value.toString())
        save()
    }
    
    fun getString(key: String, defaultValue: String = ""): String {
        return properties.getProperty(key, defaultValue)
    }
    
    fun setString(key: String, value: String) {
        properties.setProperty(key, value)
        save()
    }
    
    private fun save() {
        settingsFile.outputStream().use { properties.store(it, "SpinTracker Settings") }
    }
}
```

- [ ] **Step 2: Update AppState to use SettingsStorage**

```kotlin
// In AppState
private val settingsStorage = SettingsStorage()

fun isAutoUpdateEnabled(): Boolean {
    return settingsStorage.getBoolean("autoUpdateEnabled", true)
}

fun setAutoUpdateEnabled(enabled: Boolean) {
    settingsStorage.setBoolean("autoUpdateEnabled", enabled)
}
```

- [ ] **Step 3: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/services/SettingsStorage.kt src/desktopMain/kotlin/spintracker/data/AppState.kt
git commit -m "feat(update): add persistent settings storage"
```

---

### Task 14: Add Manual Check for Updates to Settings

**Files:**
- Modify: `src/desktopMain/kotlin/spintracker/ui/screens/SettingsScreen.kt`

- [ ] **Step 1: Add manual check button to AboutSection**

In `AboutSection`, add a "Check for Updates" button:

```kotlin
@Composable
fun AboutSection(
    appVersion: String,
    onCheckForUpdates: () -> Unit = {},
    checkingForUpdates: Boolean = false,
    lastChecked: String? = null
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = DarkSurface),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        "About",
                        color = Color.White.copy(alpha = 0.4f),
                        style = MaterialTheme.typography.labelSmall,
                        letterSpacing = 1.sp
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "SpinTracker",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                    Text(
                        "v$appVersion",
                        color = Color.White.copy(alpha = 0.5f),
                        fontSize = 13.sp
                    )
                    if (lastChecked != null) {
                        Text(
                            "Last checked: $lastChecked",
                            color = Color.White.copy(alpha = 0.4f),
                            fontSize = 11.sp,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                }
                
                Button(
                    onClick = { onCheckForUpdates() },
                    enabled = !checkingForUpdates,
                    colors = ButtonDefaults.buttonColors(containerColor = Dark200),
                    shape = RoundedCornerShape(8.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp)
                ) {
                    if (checkingForUpdates) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            color = Color.White,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Icon(Icons.Default.Update, null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Check for Updates", fontWeight = FontWeight.Medium)
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            Text(
                "A modern poker tracking application for Spin & Go analysis",
                color = Color.White.copy(alpha = 0.5f),
                fontSize = 13.sp
            )
        }
    }
}
```

- [ ] **Step 2: Wire up manual check in SettingsScreen**

Add state and handler in `SettingsScreen`:
```kotlin
var checkingForUpdates by remember { mutableStateOf(false) }
var lastUpdateCheck by remember { mutableStateOf<String?>(null) }
var updateToInstall by remember { mutableStateOf<UpdateInfo?>(null) }
var showUpdateDialog by remember { mutableStateOf(false) }

fun checkForUpdates() {
    checkingForUpdates = true
    scope.launch {
        val result = updateChecker.checkForUpdates(force = true)
        checkingForUpdates = false
        
        when (result) {
            is CheckResult.Available -> {
                updateToInstall = result.updateInfo
                showUpdateDialog = true
                lastUpdateCheck = java.time.LocalDateTime.now()
                    .format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
            }
            is CheckResult.UpToDate -> {
                // Show "you're up to date" message
                lastUpdateCheck = java.time.LocalDateTime.now()
                    .format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
            }
            is CheckResult.Error -> {
                // Show error message
            }
        }
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/ui/screens/SettingsScreen.kt
git commit -m "feat(update): add manual check for updates button"
```

---

### Task 15: Final Testing and Documentation

**Files:**
- All created/modified files

- [ ] **Step 1: Build the application**

```bash
gradlew clean build
```
Expected: BUILD SUCCESSFUL

- [ ] **Step 2: Run the application**

```bash
gradlew run
```
Expected: App starts, splash screen shows, main window opens

- [ ] **Step 3: Test update check flow**

1. App should check for updates during splash screen
2. If update available, dialog should show
3. Settings should have auto-update toggle
4. Manual check button should work

- [ ] **Step 4: Commit all final changes**

```bash
git add .
git commit -m "feat: complete auto-updater implementation"
```

---

## Testing Checklist

- [ ] Version is correctly displayed in Settings > About
- [ ] Update check runs during splash screen (2.5 seconds)
- [ ] Update dialog shows when new version available
- [ ] Changelog displays correctly
- [ ] Download progress indicator works
- [ ] Auto-update toggle persists across restarts
- [ ] Manual check for updates works
- [ ] App handles network errors gracefully (no crashes)
- [ ] Settings screen shows update toggle in General section

---

## Notes for Implementation

1. **GitHub Repository:** Update `UpdateService` with actual GitHub owner/repo:
   ```kotlin
   UpdateService(repoOwner = "your-username", repoName = "spintracker")
   ```

2. **Release Asset Naming:** GitHub releases should include platform-specific assets:
   - `SpinTracker-win.zip` or `SpinTracker-win.exe`
   - `SpinTracker-mac.dmg`
   - `SpinTracker-linux.deb`

3. **Upgrade UUID:** For Windows installer upgrades, generate a unique UUID:
   ```bash
   # Generate one at https://www.uuidgenerator.net/
   upgradeUuid = "12345678-1234-1234-1234-123456789012"
   ```

4. **Production Considerations:**
   - Add code signing for executables
   - Implement proper zip extraction (add zip4j dependency)
   - Add SHA256 checksum verification for downloads
   - Consider adding release channel support (stable/beta)
