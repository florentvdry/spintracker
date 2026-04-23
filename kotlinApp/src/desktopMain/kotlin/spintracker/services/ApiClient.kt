package spintracker.services

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

class ApiClient(private val baseUrl: String = "http://localhost:5000") {
    
    suspend fun checkServerStatus(): Boolean = withContext(Dispatchers.IO) {
        try {
            val url = URL("$baseUrl/health")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 2000
            connection.readTimeout = 2000
            
            val status = connection.responseCode
            connection.disconnect()
            status == 200
        } catch (e: Exception) {
            false
        }
    }
    
    suspend fun getAppVersion(): String = withContext(Dispatchers.IO) {
        try {
            val url = URL("$baseUrl/health")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 2000
            
            val reader = BufferedReader(InputStreamReader(connection.inputStream))
            val response = reader.readText()
            reader.close()
            
            val json = JSONObject(response)
            if (json.has("version")) {
                json.getString("version")
            } else {
                "1.0.0"
            }
        } catch (e: Exception) {
            "1.0.0"
        }
    }
    
    suspend fun getDatabases(): List<DatabaseInfo> = withContext(Dispatchers.IO) {
        try {
            val url = URL("$baseUrl/api/databases")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 5000
            
            val reader = BufferedReader(InputStreamReader(connection.inputStream))
            val response = reader.readText()
            reader.close()
            
            val json = JSONObject(response)
            if (json.getBoolean("success")) {
                val data = json.getJSONArray("data")
                val databases = mutableListOf<DatabaseInfo>()
                for (i in 0 until data.length()) {
                    databases.add(DatabaseInfo.fromJson(data.getJSONObject(i)))
                }
                databases
            } else {
                emptyList()
            }
        } catch (e: Exception) {
            println("Error getting databases: ${e.message}")
            emptyList()
        }
    }
    
    suspend fun createDatabase(name: String): Result<DatabaseInfo> = withContext(Dispatchers.IO) {
        try {
            val url = URL("$baseUrl/api/databases")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.setRequestProperty("Content-Type", "application/json")
            connection.connectTimeout = 5000
            connection.doOutput = true
            
            val jsonBody = JSONObject().put("name", name)
            connection.outputStream.write(jsonBody.toString().toByteArray())
            
            val reader = BufferedReader(InputStreamReader(connection.inputStream))
            val response = reader.readText()
            reader.close()
            
            val json = JSONObject(response)
            if (json.getBoolean("success")) {
                val data = json.getJSONObject("data")
                Result.success(DatabaseInfo.fromJson(data))
            } else {
                Result.failure(Exception(json.optString("message", "Failed to create database")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun setActiveDatabase(id: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val url = URL("$baseUrl/api/databases/$id/set-active")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.connectTimeout = 5000
            
            val reader = BufferedReader(InputStreamReader(connection.inputStream))
            val response = reader.readText()
            reader.close()
            
            val json = JSONObject(response)
            if (json.getBoolean("success")) {
                Result.success(Unit)
            } else {
                Result.failure(Exception(json.optString("message", "Failed to set active database")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun deleteDatabase(id: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val url = URL("$baseUrl/api/databases/$id")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "DELETE"
            connection.connectTimeout = 5000
            
            val reader = BufferedReader(InputStreamReader(connection.inputStream))
            val response = reader.readText()
            reader.close()
            
            val json = JSONObject(response)
            if (json.getBoolean("success")) {
                Result.success(Unit)
            } else {
                Result.failure(Exception(json.optString("message", "Failed to delete database")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun renameDatabase(id: String, name: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val url = URL("$baseUrl/api/databases/$id")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "PUT"
            connection.setRequestProperty("Content-Type", "application/json")
            connection.connectTimeout = 5000
            connection.doOutput = true
            
            val jsonBody = JSONObject().put("name", name)
            connection.outputStream.write(jsonBody.toString().toByteArray())
            
            val reader = BufferedReader(InputStreamReader(connection.inputStream))
            val response = reader.readText()
            reader.close()
            
            val json = JSONObject(response)
            if (json.getBoolean("success")) {
                Result.success(Unit)
            } else {
                Result.failure(Exception(json.optString("message", "Failed to rename database")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun deleteAllHands(): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val url = URL("$baseUrl/api/database/delete-all")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.connectTimeout = 10000
            
            val reader = BufferedReader(InputStreamReader(connection.inputStream))
            val response = reader.readText()
            reader.close()
            
            val json = JSONObject(response)
            if (json.getBoolean("success")) {
                Result.success(Unit)
            } else {
                Result.failure(Exception(json.optString("message", "Failed to delete all hands")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun exportData(): Result<String> = withContext(Dispatchers.IO) {
        try {
            val url = URL("$baseUrl/api/database/export")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.connectTimeout = 30000
            
            val reader = BufferedReader(InputStreamReader(connection.inputStream))
            val response = reader.readText()
            reader.close()
            
            val json = JSONObject(response)
            if (json.getBoolean("success")) {
                Result.success(json.optString("message", "Export successful"))
            } else {
                Result.failure(Exception(json.optString("message", "Export failed")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun openLogsFolder(): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val url = URL("$baseUrl/api/tools/open-logs")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.connectTimeout = 5000
            
            val reader = BufferedReader(InputStreamReader(connection.inputStream))
            val response = reader.readText()
            reader.close()
            
            val json = JSONObject(response)
            if (json.getBoolean("success")) {
                Result.success(Unit)
            } else {
                Result.failure(Exception(json.optString("message", "Failed to open logs folder")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun getRangeBreakdown(filters: Map<String, Any?>): Result<Map<String, Any?>> = withContext(Dispatchers.IO) {
        try {
            val url = URL("$baseUrl/analysis/range-breakdown")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.setRequestProperty("Content-Type", "application/json")
            connection.connectTimeout = 10000
            connection.doOutput = true
            
            val jsonBody = JSONObject()
            filters.forEach { (key, value) ->
                jsonBody.put(key, value ?: JSONObject.NULL)
            }
            
            connection.outputStream.write(jsonBody.toString().toByteArray())
            
            val reader = BufferedReader(InputStreamReader(connection.inputStream))
            val response = reader.readText()
            reader.close()
            
            val json = JSONObject(response)
            if (json.getBoolean("success")) {
                val data = json.getJSONObject("data")
                val rangeMap = mutableMapOf<String, Any?>()
                data.keys().forEach { key ->
                    rangeMap[key] = data.get(key)
                }
                Result.success(rangeMap)
            } else {
                Result.failure(Exception(json.optString("error", "Failed to get range breakdown")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}

data class DatabaseInfo(
    val id: String,
    val name: String,
    val fileName: String,
    val filePath: String,
    val createdAt: String,
    val lastUsedAt: String,
    val isActive: Boolean,
    val handsCount: Int
) {
    companion object {
        fun fromJson(json: JSONObject): DatabaseInfo {
            return DatabaseInfo(
                id = json.getString("id"),
                name = json.getString("name"),
                fileName = json.getString("fileName"),
                filePath = json.getString("filePath"),
                createdAt = json.getString("createdAt"),
                lastUsedAt = json.getString("lastUsedAt"),
                isActive = json.getBoolean("isActive"),
                handsCount = json.optInt("handsCount", 0)
            )
        }
    }
}
