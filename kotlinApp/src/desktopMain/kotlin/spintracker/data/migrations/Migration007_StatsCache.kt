package spintracker.data.migrations

import java.sql.Connection

class Migration007_StatsCache : Migration {
    override val version = 7
    override val description = "Add stats cache for HUD performance"
    
    override fun migrate(connection: Connection) {
        connection.createStatement().execute("""
            CREATE TABLE IF NOT EXISTS player_stats_cache (
                player_id INTEGER PRIMARY KEY,
                vpip REAL,
                pfr REAL,
                three_bet REAL,
                cbet_flop REAL,
                cbet_turn REAL,
                cbet_river REAL,
                hands_count INTEGER,
                last_updated TEXT
            )
        """)
        
        connection.createStatement().execute("""
            CREATE INDEX IF NOT EXISTS idx_stats_cache_vpip ON player_stats_cache(vpip)
        """)
    }
}
