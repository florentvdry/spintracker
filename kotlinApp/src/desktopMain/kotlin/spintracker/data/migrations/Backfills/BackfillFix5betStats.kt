package spintracker.data.migrations.Backfills

import spintracker.data.Database
import spintracker.parsers.PokerStarsParser

class BackfillFix5betStats(database: Database) : StatsBackfillService(database) {
    
    override val configKey = "backfill_fix_5bet_v2_completed"
    override val description = "5bet stats fix (v2)"
    
    override fun runBackfill() {
        println("Starting 5bet stats fix...")
        
        var processed = 0
        val parser = PokerStarsParser()
        
        while (true) {
            val hands = getHandsNeedingBackfill("flg_5bet")
            if (hands.isEmpty()) break
            
            database.useTransaction { conn ->
                for ((handId, history) in hands) {
                    val parsedHand = parser.parseHand(history)
                    if (parsedHand != null) {
                        for (player in parsedHand.players) {
                            val has5bet = player.preflopAction?.contains("5-bet") == true ||
                                         player.preflopAction?.contains("5bet") == true
                            
                            conn.prepareStatement("""
                                UPDATE player_hands 
                                SET flg_5bet = ?
                                WHERE hand_id = ? AND player_name = ?
                            """).apply {
                                setInt(1, if (has5bet) 1 else 0)
                                setLong(2, handId)
                                setString(3, player.name)
                                executeUpdate()
                            }.close()
                        }
                    }
                    processed++
                }
            }
            
            println("Fixed $processed hands...")
        }
        
        markCompleted()
        println("5bet fix complete! Total: $processed hands")
    }
}
