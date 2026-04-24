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
        println("Extracting zip to: ${destination.absolutePath}")
    }
    
    private fun scheduleRestartAndReplace(existingFile: File, newFile: File) {
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
        println("DMG installation not fully implemented")
    }
    
    private fun installDebPackage(debFile: File) {
        println("DEB installation not fully implemented")
    }
}

sealed class InstallResult {
    object Success : InstallResult()
    data class Failure(val message: String) : InstallResult()
}
