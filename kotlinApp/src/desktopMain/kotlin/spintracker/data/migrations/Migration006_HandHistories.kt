package spintracker.data.migrations

import java.sql.Connection

class Migration006_HandHistories : Migration {
    override val version = 6
    override val description = "Separate hand histories for performance"
    
    override fun migrate(connection: Connection) {
        connection.createStatement().execute("""
            CREATE TABLE IF NOT EXISTS hand_histories (
                hand_id INTEGER PRIMARY KEY,
                history TEXT NOT NULL
            )
        """)
        
        connection.createStatement().execute("""
            INSERT OR IGNORE INTO hand_histories (hand_id, history)
            SELECT id, raw_content FROM hands WHERE raw_content IS NOT NULL AND raw_content != ''
        """)
    }
}
