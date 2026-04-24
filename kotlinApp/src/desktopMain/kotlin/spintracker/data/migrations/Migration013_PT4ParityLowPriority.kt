package spintracker.data.migrations

import java.sql.Connection

class Migration013_PT4ParityLowPriority : Migration {
    override val version = 13
    override val description = "PT4 parity low priority - player name index, settings category, blind structures"
    
    override fun migrate(connection: Connection) {
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_players_name ON players(name)")
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_players_name_nocase ON players(name COLLATE NOCASE)")
        
        val configCols = listOf(
            "ALTER TABLE config ADD COLUMN category TEXT",
            "ALTER TABLE config ADD COLUMN is_system INTEGER DEFAULT 0"
        )
        
        for (sql in configCols) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        connection.createStatement().execute("""
            CREATE TABLE IF NOT EXISTS blind_structures (
                id INTEGER PRIMARY KEY,
                tournament_id INTEGER,
                level_num INTEGER,
                small_blind REAL,
                big_blind REAL,
                ante REAL DEFAULT 0,
                duration_minutes INTEGER,
                FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
            )
        """)
        
        val settingsData = listOf(
            "INSERT OR IGNORE INTO config (key, value, category, is_system) VALUES ('database.version', '13', 'system', 1)",
            "INSERT OR IGNORE INTO config (key, value, category, is_system) VALUES ('import.skip_duplicates', 'true', 'import', 1)"
        )
        
        for (sql in settingsData) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
    }
}