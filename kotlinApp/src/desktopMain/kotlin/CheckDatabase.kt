import java.sql.DriverManager
import java.io.File

fun main() {
    val userHome = System.getProperty("user.home")
    val dbPath = File(userHome, "spintracker/poker_tracker.db")
    val connectionString = "jdbc:sqlite:$dbPath"
    
    Class.forName("org.sqlite.JDBC")
    
    val conn = DriverManager.getConnection(connectionString)
    conn.createStatement().execute("PRAGMA busy_timeout=10000")
    
    println("=== DATABASE INFO ===")
    
    // Get table list
    val tablesRs = conn.createStatement().executeQuery("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    val tables = mutableListOf<String>()
    while (tablesRs.next()) {
        tables.add(tablesRs.getString(1))
    }
    tablesRs.close()
    
    println("Tables: ${tables.joinToString(", ")}")
    println()
    
    // Count records in each table
    println("=== RECORD COUNTS ===")
    for (table in tables) {
        val countRs = conn.createStatement().executeQuery("SELECT COUNT(*) FROM $table")
        if (countRs.next()) {
            println("$table: ${countRs.getInt(1)} rows")
        }
        countRs.close()
    }
    println()
    
    // Check hands table for unpopulated fields
    println("=== HANDS TABLE - NULL/EMPTY CHECK ===")
    val handsCols = listOf("hand_id", "game_id", "table_name", "room", "site_id", "date_time", "hero_name", 
                          "hero_position", "player_count", "big_blind", "hand_rank", "hand_type", "result", 
                          "ev", "went_to_showdown", "raw_content", "buy_in", "prize_pool", "multiplier", 
                          "position", "flop", "turn", "river", "total_pot")
    
    for (col in handsCols) {
        val nullRs = conn.createStatement().executeQuery("SELECT COUNT(*) FROM hands WHERE $col IS NULL OR $col = ''")
        if (nullRs.next()) {
            val nullCount = nullRs.getInt(1)
            if (nullCount > 0) {
                println("hands.$col: $nullCount NULL/empty")
            }
        }
        nullRs.close()
    }
    println()
    
    // Check player_hands table for unpopulated fields
    println("=== PLAYER_HANDS TABLE - NULL/EMPTY CHECK ===")
    val playerHandsCols = listOf("player_name", "position", "hole_cards", "preflop_action", "flop_action", 
                                "turn_action", "river_action", "showdown_cards", "final_hand", 
                                "allin_action", "aggressor_position", "hand_group", "showed_cards")
    
    for (col in playerHandsCols) {
        val nullRs = conn.createStatement().executeQuery("SELECT COUNT(*) FROM player_hands WHERE $col IS NULL OR $col = ''")
        if (nullRs.next()) {
            val nullCount = nullRs.getInt(1)
            if (nullCount > 0) {
                println("player_hands.$col: $nullCount NULL/empty")
            }
        }
        nullRs.close()
    }
    println()
    
    // Check important stats fields
    println("=== PLAYER_HANDS - STATS FLAGS CHECK ===")
    val statsCols = listOf("flg_vpip", "flg_pfr", "flg_3bet", "flg_4bet", "flg_squeeze", "flg_limp",
                          "flg_cbet_flop", "flg_donk_flop", "flg_float_flop", "flg_check_raise_flop", "flg_saw_flop",
                          "flg_cbet_turn", "flg_donk_turn", "flg_float_turn", "flg_check_raise_turn", "flg_saw_turn",
                          "flg_cbet_river", "flg_donk_river", "flg_check_raise_river", "flg_saw_river",
                          "flg_allin", "flg_face_allin", "flg_is_aggressor",
                          "bounty_won", "equity_percent", "expected_won", "icm_equity_percent",
                          "effective_stack_preflop", "effective_stack_flop", "effective_stack_turn", "effective_stack_river",
                          "spr_flop", "is_suited", "is_pair")
    
    for (col in statsCols) {
        val nullRs = conn.createStatement().executeQuery("SELECT COUNT(*) FROM player_hands WHERE $col IS NULL OR $col = 0")
        if (nullRs.next()) {
            val nullCount = nullRs.getInt(1)
            val totalRs = conn.createStatement().executeQuery("SELECT COUNT(*) FROM player_hands")
            var total = 0
            if (totalRs.next()) total = totalRs.getInt(1)
            totalRs.close()
            if (nullCount > 0 && nullCount < total) {
                println("player_hands.$col: $nullCount NULL/zero of $total (${(nullCount.toDouble()/total*100).toInt()}%)")
            } else if (nullCount == total && total > 0) {
                println("player_hands.$col: ALL $total rows NULL/zero!")
            }
        }
        nullRs.close()
    }
    println()
    
    // Check for hands without player_hands entries
    println("=== ORPHANED RECORDS CHECK ===")
    val orphanHandsRs = conn.createStatement().executeQuery("""
        SELECT COUNT(*) FROM hands h 
        WHERE NOT EXISTS (SELECT 1 FROM player_hands ph WHERE ph.hand_id = h.id)
    """)
    if (orphanHandsRs.next()) {
        println("Orphaned hands (no player_hands): ${orphanHandsRs.getInt(1)}")
    }
    orphanHandsRs.close()
    
    val orphanPlayersRs = conn.createStatement().executeQuery("""
        SELECT COUNT(*) FROM players p 
        WHERE NOT EXISTS (SELECT 1 FROM player_hands ph WHERE ph.player_id = p.id)
    """)
    if (orphanPlayersRs.next()) {
        println("Orphaned players (no player_hands): ${orphanPlayersRs.getInt(1)}")
    }
    orphanPlayersRs.close()
    println()
    
    // Check hand_histories
    println("=== HAND_HISTORIES CHECK ===")
    val histRs = conn.createStatement().executeQuery("SELECT COUNT(*) FROM hand_histories")
    var histCount = 0
    if (histRs.next()) histCount = histRs.getInt(1)
    histRs.close()
    
    val handsRs = conn.createStatement().executeQuery("SELECT COUNT(*) FROM hands")
    var handsCount = 0
    if (handsRs.next()) handsCount = handsRs.getInt(1)
    handsRs.close()
    
    println("hand_histories: $histCount rows")
    println("hands: $handsCount rows")
    println("Missing histories: ${handsCount - histCount}")
    println()
    
    // Sample of unpopulated data
    println("=== SAMPLE: HANDS WITH EMPTY FLOP/TURN/RIVER ===")
    val sampleRs = conn.createStatement().executeQuery("""
        SELECT id, hand_id, flop, turn, river, player_count 
        FROM hands 
        WHERE (flop IS NULL OR flop = '') 
        LIMIT 5
    """)
    while (sampleRs.next()) {
        println("Hand ${sampleRs.getString(2)}: flop='${sampleRs.getString(3)}', turn='${sampleRs.getString(4)}', river='${sampleRs.getString(5)}', players=${sampleRs.getInt(6)}")
    }
    sampleRs.close()
    
    conn.close()
    println("\nDone!")
}
