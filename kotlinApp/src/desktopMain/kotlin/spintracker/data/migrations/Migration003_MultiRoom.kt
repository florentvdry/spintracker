package spintracker.data.migrations

import java.sql.Connection

class Migration003_MultiRoom : Migration {
    override val version = 3
    override val description = "Add multi-room support with site_id references"
    
    override fun migrate(connection: Connection) {
        try {
            connection.createStatement().execute("""
                ALTER TABLE players ADD COLUMN site_id INTEGER DEFAULT 1
            """)
        } catch (e: Exception) {}
        
        try {
            connection.createStatement().execute("""
                ALTER TABLE hands ADD COLUMN site_id INTEGER DEFAULT 1
            """)
        } catch (e: Exception) {}
        
        try {
            connection.createStatement().execute("""
                ALTER TABLE tournaments ADD COLUMN site_id INTEGER DEFAULT 1
            """)
        } catch (e: Exception) {}
        
        try {
            connection.createStatement().execute("""
                ALTER TABLE player_hands ADD COLUMN position_type TEXT DEFAULT 'UNK'
            """)
        } catch (e: Exception) {}
        
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_players_site ON players(site_id)")
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_hands_site ON hands(site_id)")
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_tournaments_site ON tournaments(site_id)")
    }
}
