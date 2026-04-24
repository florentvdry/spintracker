package spintracker.data.migrations

import java.sql.Connection

interface Migration {
    val version: Int
    val description: String
    
    fun migrate(connection: Connection)
}
