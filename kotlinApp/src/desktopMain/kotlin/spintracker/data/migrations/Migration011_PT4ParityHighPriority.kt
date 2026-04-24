package spintracker.data.migrations

import java.sql.Connection

class Migration011_PT4ParityHighPriority : Migration {
    override val version = 11
    override val description = "PT4 parity high priority - amounts per street, players per street, SPR turn/river, import tracking, action flags"
    
    override fun migrate(connection: Connection) {
        val amountCols = listOf(
            "ALTER TABLE player_hands ADD COLUMN amt_bet_flop REAL DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN amt_bet_turn REAL DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN amt_bet_river REAL DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN amt_raise_flop_facing REAL DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN amt_raise_turn_facing REAL DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN amt_raise_river_facing REAL DEFAULT 0"
        )
        
        for (sql in amountCols) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        val playersPerStreet = listOf(
            "ALTER TABLE hands ADD COLUMN players_flop INTEGER DEFAULT 0",
            "ALTER TABLE hands ADD COLUMN players_turn INTEGER DEFAULT 0",
            "ALTER TABLE hands ADD COLUMN players_river INTEGER DEFAULT 0"
        )
        
        for (sql in playersPerStreet) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        val aggressorPositions = listOf(
            "ALTER TABLE player_hands ADD COLUMN aggressor_position_flop TEXT",
            "ALTER TABLE player_hands ADD COLUMN aggressor_position_turn TEXT",
            "ALTER TABLE player_hands ADD COLUMN aggressor_position_river TEXT"
        )
        
        for (sql in aggressorPositions) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        val sprCols = listOf(
            "ALTER TABLE player_hands ADD COLUMN spr_turn REAL",
            "ALTER TABLE player_hands ADD COLUMN spr_river REAL"
        )
        
        for (sql in sprCols) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        val importTracking = listOf(
            "ALTER TABLE hands ADD COLUMN imported_at TEXT"
        )
        
        for (sql in importTracking) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        val actionFlags = listOf(
            "ALTER TABLE player_hands ADD COLUMN flg_raise_flop INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_raise_turn INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_raise_river INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_xc_flop INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_xf_flop INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_xc_turn INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_xf_turn INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_xc_river INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_xf_river INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_p_face_raise_opp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_p_open INTEGER DEFAULT 0"
        )
        
        for (sql in actionFlags) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
    }
}