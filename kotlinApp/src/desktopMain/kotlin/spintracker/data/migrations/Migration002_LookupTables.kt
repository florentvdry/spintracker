package spintracker.data.migrations

import java.sql.Connection

class Migration002_LookupTables : Migration {
    override val version = 2
    override val description = "Add lookup tables for normalization"
    
    override fun migrate(connection: Connection) {
        connection.createStatement().execute("""
            CREATE TABLE lookup_actions (
                id INTEGER PRIMARY KEY,
                action TEXT NOT NULL,
                description TEXT
            )
        """)
        
        val actions = listOf(
            Triple(0, "", "Empty"),
            Triple(1, "R", "Raise"),
            Triple(2, "CC", "Cold Call"),
            Triple(3, "CF", "Call Fold"),
            Triple(4, "F", "Fold"),
            Triple(5, "C", "Call"),
            Triple(6, "BF", "Bet Fold"),
            Triple(7, "X", "Check"),
            Triple(8, "XR", "Check Raise"),
            Triple(9, "B", "Bet"),
            Triple(10, "XC", "Check Call"),
            Triple(11, "XF", "Check Fold"),
            Triple(12, "BR", "Bet Raise"),
            Triple(13, "RC", "Raise Call"),
            Triple(14, "RF", "Raise Fold"),
            Triple(15, "BC", "Bet Call"),
            Triple(16, "RR", "Re-Raise"),
            Triple(17, "CRC", "Check Raise Call"),
            Triple(18, "CR", "Check Raise"),
            Triple(19, "XRC", "Check Raise Call")
        )
        
        val insertAction = connection.prepareStatement(
            "INSERT OR IGNORE INTO lookup_actions (id, action, description) VALUES (?, ?, ?)"
        )
        for ((id, action, desc) in actions) {
            insertAction.setInt(1, id)
            insertAction.setString(2, action)
            insertAction.setString(3, desc)
            insertAction.executeUpdate()
        }
        insertAction.close()
        
        connection.createStatement().execute("""
            CREATE TABLE lookup_positions (
                id INTEGER PRIMARY KEY,
                short_name TEXT NOT NULL,
                full_name TEXT,
                is_blind INTEGER DEFAULT 0,
                is_ep INTEGER DEFAULT 0,
                is_mp INTEGER DEFAULT 0,
                is_co INTEGER DEFAULT 0,
                is_btn INTEGER DEFAULT 0
            )
        """)
        
        data class PosData(val id: Int, val short: String, val full: String, val blind: Int, val ep: Int, val mp: Int, val co: Int, val btn: Int)
        val positions = listOf(
            PosData(0, "UNK", "Unknown", 0, 0, 0, 0, 0),
            PosData(1, "SB", "Small Blind", 1, 0, 0, 0, 0),
            PosData(2, "BB", "Big Blind", 1, 0, 0, 0, 0),
            PosData(3, "EP", "Early Position", 0, 1, 0, 0, 0),
            PosData(4, "MP", "Middle Position", 0, 0, 1, 0, 0),
            PosData(5, "CO", "Cutoff", 0, 0, 0, 1, 0),
            PosData(6, "BTN", "Button", 0, 0, 0, 0, 1)
        )
        
        val insertPos = connection.prepareStatement(
            "INSERT OR IGNORE INTO lookup_positions (id, short_name, full_name, is_blind, is_ep, is_mp, is_co, is_btn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        for (p in positions) {
            insertPos.setInt(1, p.id)
            insertPos.setString(2, p.short)
            insertPos.setString(3, p.full)
            insertPos.setInt(4, p.blind)
            insertPos.setInt(5, p.ep)
            insertPos.setInt(6, p.mp)
            insertPos.setInt(7, p.co)
            insertPos.setInt(8, p.btn)
            insertPos.executeUpdate()
        }
        insertPos.close()
        
        connection.createStatement().execute("""
            CREATE TABLE lookup_hand_ranks (
                id INTEGER PRIMARY KEY,
                rank_name TEXT NOT NULL,
                category INTEGER NOT NULL,
                group_details TEXT
            )
        """)
        
        data class RankData(val id: Int, val name: String, val cat: Int, val details: String)
        val handRanks = listOf(
            RankData(1, "High Card", 0, ""),
            RankData(2, "Pair", 1, ""),
            RankData(3, "Two Pair", 2, ""),
            RankData(4, "Three of a Kind", 3, ""),
            RankData(5, "Straight", 4, ""),
            RankData(6, "Flush", 5, ""),
            RankData(7, "Full House", 6, ""),
            RankData(8, "Four of a Kind", 7, ""),
            RankData(9, "Straight Flush", 8, ""),
            RankData(10, "Royal Flush", 9, "")
        )
        
        val insertRank = connection.prepareStatement(
            "INSERT OR IGNORE INTO lookup_hand_ranks (id, rank_name, category, group_details) VALUES (?, ?, ?, ?)"
        )
        for (r in handRanks) {
            insertRank.setInt(1, r.id)
            insertRank.setString(2, r.name)
            insertRank.setInt(3, r.cat)
            insertRank.setString(4, r.details)
            insertRank.executeUpdate()
        }
        insertRank.close()
        
        connection.createStatement().execute("""
            CREATE TABLE lookup_sites (
                id INTEGER PRIMARY KEY,
                abbrev TEXT NOT NULL,
                name TEXT NOT NULL
            )
        """)
        
        data class SiteData(val id: Int, val abbrev: String, val name: String)
        val sites = listOf(
            SiteData(1, "WIN", "Winamax"),
            SiteData(2, "PS", "PokerStars"),
            SiteData(3, "BET", "Betclic"),
            SiteData(4, "UNI", "Unibet"),
            SiteData(5, "PMU", "PMU Poker")
        )
        
        val insertSite = connection.prepareStatement(
            "INSERT OR IGNORE INTO lookup_sites (id, abbrev, name) VALUES (?, ?, ?)"
        )
        for (s in sites) {
            insertSite.setInt(1, s.id)
            insertSite.setString(2, s.abbrev)
            insertSite.setString(3, s.name)
            insertSite.executeUpdate()
        }
        insertSite.close()
        
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_lookup_actions_action ON lookup_actions(action)")
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_lookup_positions_short ON lookup_positions(short_name)")
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_lookup_hand_ranks_category ON lookup_hand_ranks(category)")
    }
}
