package spintracker.data.migrations

import java.sql.Connection

class Migration014_PreflopEquityLookup : Migration {
    override val version = 14
    override val description = "Add pre-computed preflop equity lookup table for import optimization"
    
    override fun migrate(connection: Connection) {
        connection.createStatement().execute("""
            CREATE TABLE IF NOT EXISTS preflop_equity_lookup (
                id INTEGER PRIMARY KEY,
                hero_hand TEXT NOT NULL,
                villain1_hand TEXT NOT NULL,
                villain2_hand TEXT,
                hero_equity REAL NOT NULL,
                tie_equity REAL NOT NULL,
                UNIQUE(hero_hand, villain1_hand, villain2_hand)
            )
        """)
        
        connection.createStatement().execute("""
            CREATE INDEX IF NOT EXISTS idx_preflop_equity_hero ON preflop_equity_lookup(hero_hand)
        """)
        
        connection.createStatement().execute("""
            CREATE INDEX IF NOT EXISTS idx_preflop_equity_villains ON preflop_equity_lookup(villain1_hand, villain2_hand)
        """)
    }
}
