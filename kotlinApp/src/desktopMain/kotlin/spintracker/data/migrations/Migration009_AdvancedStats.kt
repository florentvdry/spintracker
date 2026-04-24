package spintracker.data.migrations

import java.sql.Connection

class Migration009_AdvancedStats : Migration {
    override val version = 9
    override val description = "Add advanced stats (effective stack, SPR, hand groups)"
    
    override fun migrate(connection: Connection) {
        val stackCols = listOf(
            "ALTER TABLE player_hands ADD COLUMN effective_stack_preflop REAL",
            "ALTER TABLE player_hands ADD COLUMN effective_stack_flop REAL",
            "ALTER TABLE player_hands ADD COLUMN effective_stack_turn REAL",
            "ALTER TABLE player_hands ADD COLUMN effective_stack_river REAL",
            "ALTER TABLE player_hands ADD COLUMN spr_flop REAL",
            "ALTER TABLE player_hands ADD COLUMN hand_group TEXT",
            "ALTER TABLE player_hands ADD COLUMN is_suited INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN is_pair INTEGER DEFAULT 0"
        )
        
        for (sql in stackCols) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_hand_group ON player_hands(hand_group)")
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_spr ON player_hands(spr_flop)")
    }
}
