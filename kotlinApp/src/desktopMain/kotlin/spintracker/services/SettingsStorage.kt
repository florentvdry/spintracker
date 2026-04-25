package spintracker.services

import java.io.File
import java.util.Properties

class SettingsStorage {
    private val lock = Any()
    
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
        try {
            if (settingsFile.exists()) {
                settingsFile.inputStream().use { properties.load(it) }
            }
        } catch (e: Exception) {
            println("Failed to load settings: ${e.message}")
        }
    }
    
    fun getBoolean(key: String, defaultValue: Boolean = false): Boolean {
        synchronized(lock) {
            return properties.getProperty(key, defaultValue.toString()).toBoolean()
        }
    }
    
    fun setBoolean(key: String, value: Boolean) {
        synchronized(lock) {
            properties.setProperty(key, value.toString())
            save()
        }
    }
    
    fun getString(key: String, defaultValue: String = ""): String {
        synchronized(lock) {
            return properties.getProperty(key, defaultValue)
        }
    }
    
    fun setString(key: String, value: String) {
        synchronized(lock) {
            properties.setProperty(key, value)
            save()
        }
    }
    
    private fun save() {
        try {
            settingsFile.outputStream().use { properties.store(it, "SpinTracker Settings") }
        } catch (e: Exception) {
            println("Failed to save settings: ${e.message}")
        }
    }
}
