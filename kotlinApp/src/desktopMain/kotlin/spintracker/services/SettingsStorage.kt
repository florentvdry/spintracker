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
