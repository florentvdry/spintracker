package spintracker.data.migrations

import java.sql.Connection

class Migration008_TournamentExtensions : Migration {
    override val version = 8
    override val description = "Add tournament extensions (rebuys, addons, bounties, ICM)"
    
    override fun migrate(connection: Connection) {
        val tournamentCols = listOf(
            "ALTER TABLE tournaments ADD COLUMN rebuy_count INTEGER DEFAULT 0",
            "ALTER TABLE tournaments ADD COLUMN addon_count INTEGER DEFAULT 0",
            "ALTER TABLE tournaments ADD COLUMN bounty_amount REAL DEFAULT 0",
            "ALTER TABLE tournaments ADD COLUMN is_knockout INTEGER DEFAULT 0",
            "ALTER TABLE tournaments ADD COLUMN icm_factor REAL DEFAULT 1.0",
            "ALTER TABLE tournaments ADD COLUMN base_currency TEXT DEFAULT 'EUR'",
            "ALTER TABLE tournaments ADD COLUMN conversion_rate REAL DEFAULT 1.0",
            "ALTER TABLE tournaments ADD COLUMN winner_id INTEGER",
            "ALTER TABLE tournaments ADD COLUMN winner_name TEXT"
        )
        
        for (sql in tournamentCols) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        val playerHandCols = listOf(
            "ALTER TABLE player_hands ADD COLUMN bounty_won REAL DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN equity_percent REAL DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN expected_won REAL DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN icm_equity_percent REAL DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN showed_cards INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN won_at_showdown INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN folded_before_showdown INTEGER DEFAULT 0"
        )
        
        for (sql in playerHandCols) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_tournaments_winner ON tournaments(winner_id)")
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_bounty_won ON player_hands(bounty_won)")
    }
}
