package spintracker.data

import spintracker.models.*
import java.sql.DriverManager

class TagsRepository(private val connectionString: String) {
    
    fun getAllTags(): List<Tag> {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val rs = conn.createStatement().executeQuery(
                "SELECT id, name, color_code, player_count FROM tags ORDER BY name"
            )
            val tags = mutableListOf<Tag>()
            while (rs.next()) {
                tags.add(Tag(
                    id = rs.getLong(1),
                    name = rs.getString(2),
                    colorCode = rs.getString(3),
                    playerCount = rs.getInt(4)
                ))
            }
            return tags
        } finally {
            conn.close()
        }
    }
    
    fun createTag(name: String, colorCode: String = "#808080"): Tag {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement(
                "INSERT INTO tags (name, color_code) VALUES (?, ?)",
                java.sql.Statement.RETURN_GENERATED_KEYS
            )
            stmt.setString(1, name)
            stmt.setString(2, colorCode)
            stmt.executeUpdate()
            
            val keys = stmt.generatedKeys
            return if (keys.next()) {
                Tag(id = keys.getLong(1), name = name, colorCode = colorCode)
            } else {
                throw Exception("Failed to create tag")
            }
        } finally {
            conn.close()
        }
    }
    
    fun addTagToPlayer(playerId: Long, tagId: Long) {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement(
                "INSERT OR IGNORE INTO player_tags (player_id, tag_id) VALUES (?, ?)"
            )
            stmt.setLong(1, playerId)
            stmt.setLong(2, tagId)
            stmt.executeUpdate()
            
            conn.createStatement().execute("""
                UPDATE tags SET player_count = (
                    SELECT COUNT(*) FROM player_tags WHERE tag_id = $tagId
                ) WHERE id = $tagId
            """)
        } finally {
            conn.close()
        }
    }
    
    fun removeTagFromPlayer(playerId: Long, tagId: Long) {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement(
                "DELETE FROM player_tags WHERE player_id = ? AND tag_id = ?"
            )
            stmt.setLong(1, playerId)
            stmt.setLong(2, tagId)
            stmt.executeUpdate()
            
            conn.createStatement().execute("""
                UPDATE tags SET player_count = (
                    SELECT COUNT(*) FROM player_tags WHERE tag_id = $tagId
                ) WHERE id = $tagId
            """)
        } finally {
            conn.close()
        }
    }
    
    fun getPlayerTags(playerId: Long): List<Tag> {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement("""
                SELECT t.id, t.name, t.color_code, t.player_count
                FROM tags t
                JOIN player_tags pt ON t.id = pt.tag_id
                WHERE pt.player_id = ?
            """)
            stmt.setLong(1, playerId)
            val rs = stmt.executeQuery()
            val tags = mutableListOf<Tag>()
            while (rs.next()) {
                tags.add(Tag(
                    id = rs.getLong(1),
                    name = rs.getString(2),
                    colorCode = rs.getString(3),
                    playerCount = rs.getInt(4)
                ))
            }
            return tags
        } finally {
            conn.close()
        }
    }
    
    fun getPlayersByTag(tagId: Long): List<Player> {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement("""
                SELECT p.id, p.name, p.room, p.is_reg, p.notes
                FROM players p
                JOIN player_tags pt ON p.id = pt.player_id
                WHERE pt.tag_id = ?
            """)
            stmt.setLong(1, tagId)
            val rs = stmt.executeQuery()
            val players = mutableListOf<Player>()
            while (rs.next()) {
                players.add(Player(
                    id = rs.getLong(1),
                    name = rs.getString(2),
                    room = rs.getString(3),
                    isReg = rs.getInt(4) == 1,
                    notes = rs.getString(5) ?: ""
                ))
            }
            return players
        } finally {
            conn.close()
        }
    }
    
    fun clearPlayerTags(playerId: Long) {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement("DELETE FROM player_tags WHERE player_id = ?")
            stmt.setLong(1, playerId)
            stmt.executeUpdate()
        } finally {
            conn.close()
        }
    }
}
