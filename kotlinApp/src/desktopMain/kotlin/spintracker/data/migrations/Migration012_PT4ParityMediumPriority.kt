package spintracker.data.migrations

import java.sql.Connection

class Migration012_PT4ParityMediumPriority : Migration {
    override val version = 12
    override val description = "PT4 parity medium priority - tourney types, pots per street, saw flags, action counts, bounty"
    
    override fun migrate(connection: Connection) {
        connection.createStatement().execute("""
            CREATE TABLE IF NOT EXISTS tourney_types (
                id INTEGER PRIMARY KEY,
                type_name TEXT NOT NULL,
                is_bounty INTEGER DEFAULT 0,
                is_progressive INTEGER DEFAULT 0
            )
        """)
        
        val tourneyTypesData = listOf(
            "INSERT OR IGNORE INTO tourney_types (id, type_name, is_bounty, is_progressive) VALUES (1, 'Regular', 0, 0)",
            "INSERT OR IGNORE INTO tourney_types (id, type_name, is_bounty, is_progressive) VALUES (2, 'Speed', 0, 0)",
            "INSERT OR IGNORE INTO tourney_types (id, type_name, is_bounty, is_progressive) VALUES (3, 'Hyper', 0, 0)",
            "INSERT OR IGNORE INTO tourney_types (id, type_name, is_bounty, is_progressive) VALUES (4, 'Knockout', 1, 0)",
            "INSERT OR IGNORE INTO tourney_types (id, type_name, is_bounty, is_progressive) VALUES (5, 'Progressive KO', 1, 1)",
            "INSERT OR IGNORE INTO tourney_types (id, type_name, is_bounty, is_progressive) VALUES (6, 'Super KO', 1, 0)"
        )
        
        for (sql in tourneyTypesData) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        val tournamentCols = listOf(
            "ALTER TABLE tournaments ADD COLUMN starting_stack REAL DEFAULT 0",
            "ALTER TABLE tournaments ADD COLUMN rebuy_period_end TEXT",
            "ALTER TABLE tournaments ADD COLUMN tourney_no_target INTEGER"
        )
        
        for (sql in tournamentCols) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        val potCols = listOf(
            "ALTER TABLE hands ADD COLUMN pot_flop REAL DEFAULT 0",
            "ALTER TABLE hands ADD COLUMN pot_turn REAL DEFAULT 0",
            "ALTER TABLE hands ADD COLUMN pot_river REAL DEFAULT 0"
        )
        
        for (sql in potCols) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        val sawFlags = listOf(
            "ALTER TABLE player_hands ADD COLUMN flg_saw_flop INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_saw_turn INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_saw_river INTEGER DEFAULT 0"
        )
        
        for (sql in sawFlags) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        val actionCounts = listOf(
            "ALTER TABLE player_hands ADD COLUMN cnt_raise_flop INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN cnt_call_flop INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN cnt_raise_turn INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN cnt_call_turn INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN cnt_raise_river INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN cnt_call_river INTEGER DEFAULT 0"
        )
        
        for (sql in actionCounts) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        val bountyCols = listOf(
            "ALTER TABLE player_hands ADD COLUMN total_bounty_won REAL DEFAULT 0"
        )
        
        for (sql in bountyCols) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        val comboType = listOf(
            "ALTER TABLE player_hands ADD COLUMN combo_type TEXT"
        )
        
        for (sql in comboType) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
    }
}