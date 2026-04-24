package spintracker.data.migrations

import java.sql.Connection

class Migration004_ActionFlags : Migration {
    override val version = 4
    override val description = "Add action flags for advanced HUD stats"
    
    override fun migrate(connection: Connection) {
        val preflopFlags = listOf(
            "ALTER TABLE player_hands ADD COLUMN flg_vpip INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_pfr INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_3bet INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_4bet INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_squeeze INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_limp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_limp_behind INTEGER DEFAULT 0"
        )
        
        for (sql in preflopFlags) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        val flopFlags = listOf(
            "ALTER TABLE player_hands ADD COLUMN flg_cbet_flop INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_donk_flop INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_float_flop INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_check_raise_flop INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_bet_flop INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_call_flop INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_fold_flop INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_saw_flop INTEGER DEFAULT 0"
        )
        
        for (sql in flopFlags) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        val turnFlags = listOf(
            "ALTER TABLE player_hands ADD COLUMN flg_cbet_turn INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_donk_turn INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_float_turn INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_check_raise_turn INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_bet_turn INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_call_turn INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_fold_turn INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_saw_turn INTEGER DEFAULT 0"
        )
        
        for (sql in turnFlags) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        val riverFlags = listOf(
            "ALTER TABLE player_hands ADD COLUMN flg_cbet_river INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_donk_river INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_check_raise_river INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_bet_river INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_call_river INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_fold_river INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_saw_river INTEGER DEFAULT 0"
        )
        
        for (sql in riverFlags) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        val allinFlags = listOf(
            "ALTER TABLE player_hands ADD COLUMN flg_allin INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_face_allin INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN allin_action TEXT"
        )
        
        for (sql in allinFlags) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        val aggressorFlags = listOf(
            "ALTER TABLE player_hands ADD COLUMN flg_is_aggressor INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN aggressor_position TEXT"
        )
        
        for (sql in aggressorFlags) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_vpip ON player_hands(flg_vpip)")
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_pfr ON player_hands(flg_pfr)")
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_cbet_flop ON player_hands(flg_cbet_flop)")
    }
}
