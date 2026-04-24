package spintracker.data

import spintracker.models.*
import java.sql.DriverManager

class LookupTablesRepository(private val connectionString: String) {
    
    fun getActionById(id: Int): LookupAction? {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement("SELECT id, action, description FROM lookup_actions WHERE id = ?")
            stmt.setInt(1, id)
            val rs = stmt.executeQuery()
            return if (rs.next()) {
                LookupAction(rs.getInt(1), rs.getString(2), rs.getString(3))
            } else null
        } finally {
            conn.close()
        }
    }
    
    fun getAllActions(): List<LookupAction> {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val rs = conn.createStatement().executeQuery("SELECT id, action, description FROM lookup_actions ORDER BY id")
            val actions = mutableListOf<LookupAction>()
            while (rs.next()) {
                actions.add(LookupAction(rs.getInt(1), rs.getString(2), rs.getString(3)))
            }
            return actions
        } finally {
            conn.close()
        }
    }
    
    fun getPositionByShortName(shortName: String): LookupPosition? {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement(
                "SELECT id, short_name, full_name, is_blind, is_ep, is_mp, is_co, is_btn FROM lookup_positions WHERE short_name = ?"
            )
            stmt.setString(1, shortName)
            val rs = stmt.executeQuery()
            return if (rs.next()) {
                LookupPosition(
                    id = rs.getInt(1),
                    shortName = rs.getString(2),
                    fullName = rs.getString(3),
                    isBlind = rs.getInt(4) == 1,
                    isEpo = rs.getInt(5) == 1,
                    isMp = rs.getInt(6) == 1,
                    isCo = rs.getInt(7) == 1,
                    isBtn = rs.getInt(8) == 1
                )
            } else null
        } finally {
            conn.close()
        }
    }
    
    fun getHandRankById(id: Int): LookupHandRank? {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement(
                "SELECT id, rank_name, category, group_details FROM lookup_hand_ranks WHERE id = ?"
            )
            stmt.setInt(1, id)
            val rs = stmt.executeQuery()
            return if (rs.next()) {
                LookupHandRank(rs.getInt(1), rs.getString(2), rs.getInt(3), rs.getString(4))
            } else null
        } finally {
            conn.close()
        }
    }
    
    fun getSiteById(id: Int): LookupSite? {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement("SELECT id, abbrev, name FROM lookup_sites WHERE id = ?")
            stmt.setInt(1, id)
            val rs = stmt.executeQuery()
            return if (rs.next()) {
                LookupSite(rs.getInt(1), rs.getString(2), rs.getString(3))
            } else null
        } finally {
            conn.close()
        }
    }
    
    fun getSiteByAbbrev(abbrev: String): LookupSite? {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement("SELECT id, abbrev, name FROM lookup_sites WHERE abbrev = ?")
            stmt.setString(1, abbrev)
            val rs = stmt.executeQuery()
            return if (rs.next()) {
                LookupSite(rs.getInt(1), rs.getString(2), rs.getString(3))
            } else null
        } finally {
            conn.close()
        }
    }
    
    fun getAllSites(): List<LookupSite> {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val rs = conn.createStatement().executeQuery("SELECT id, abbrev, name FROM lookup_sites ORDER BY id")
            val sites = mutableListOf<LookupSite>()
            while (rs.next()) {
                sites.add(LookupSite(rs.getInt(1), rs.getString(2), rs.getString(3)))
            }
            return sites
        } finally {
            conn.close()
        }
    }
}
