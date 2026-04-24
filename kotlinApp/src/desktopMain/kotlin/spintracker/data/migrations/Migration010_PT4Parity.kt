package spintracker.data.migrations

import java.sql.Connection

class Migration010_PT4Parity : Migration {
    override val version = 10
    override val description = "PT4 parity - lookup tables, opp flags, equity, indexes"
    
    override fun migrate(connection: Connection) {
        connection.createStatement().execute("""
            CREATE TABLE IF NOT EXISTS lookup_hole_cards (
                id INTEGER PRIMARY KEY,
                rank_1 INTEGER NOT NULL,
                rank_2 INTEGER NOT NULL,
                is_suited INTEGER NOT NULL DEFAULT 0,
                short_name TEXT NOT NULL,
                group_name TEXT,
                category TEXT
            )
        """.trimIndent())
        
        val ranks = arrayOf("", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A")
        
        var id = 1
        for (r1 in 13 downTo 1) {
            for (r2 in r1 downTo 1) {
                val suited = if (r1 == r2) 0 else 1
                val name1 = ranks[r1]
                val name2 = ranks[r2]
                val shortName = if (r1 == r2) "$name1$name1" else "${name1}${name2}"
                val group = when {
                    r1 == 14 && r2 == 13 -> "AK"
                    r1 == 14 && r2 >= 11 -> "AXs"
                    r1 == 14 -> "AXo"
                    r1 >= 13 && r2 >= 12 -> "KQ+"
                    r1 >= 13 -> "Broadway"
                    else -> "Other"
                }
                try {
                    connection.createStatement().execute(
                        "INSERT OR IGNORE INTO lookup_hole_cards (id, rank_1, rank_2, is_suited, short_name, group_name, category) VALUES ($id, $r1, $r2, $suited, '$shortName', '$group', 'Holdem')"
                    )
                } catch (e: Exception) {}
                id++
            }
        }
        
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_lookup_hole_cards_rank ON lookup_hole_cards(rank_1, rank_2, is_suited)")
        
        val oppFlags = listOf(
            "ALTER TABLE player_hands ADD COLUMN flg_vpip_opp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_pfr_opp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_3bet_opp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_3bet_def_opp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_4bet_opp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_4bet_def_opp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_squeeze_opp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_squeeze_def_opp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_open_opp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_open_def_opp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_cbet_flop_opp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_cbet_flop_def_opp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_donk_flop_opp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_donk_flop_def_opp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_float_flop_opp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_float_flop_def_opp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_steal_att INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_steal_opp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_blind_def_opp INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_sb_steal_fold INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_bb_steal_fold INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_f_has_position INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_t_has_position INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_r_has_position INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_f_first INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_t_first INTEGER DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN flg_r_first INTEGER DEFAULT 0"
        )
        
        for (sql in oppFlags) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        val equityCols = listOf(
            "ALTER TABLE player_hands ADD COLUMN equity_percent REAL DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN expected_won REAL DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN expected_won_icm REAL DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN amt_before REAL DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN amt_raise_facing REAL DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN amt_2bet_facing REAL DEFAULT 0",
            "ALTER TABLE player_hands ADD COLUMN amt_3bet_facing REAL DEFAULT 0"
        )
        
        for (sql in equityCols) {
            try { connection.createStatement().execute(sql) } catch (e: Exception) {}
        }
        
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_hands_tournament ON hands(game_id)")
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_hands_position ON hands(position)")
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_hands_site ON hands(site_id)")
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_player_hands_tournament ON player_hands(hand_id)")
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_player_hands_date ON player_hands(hand_id)")
    }
}