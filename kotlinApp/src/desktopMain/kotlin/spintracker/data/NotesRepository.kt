package spintracker.data

import spintracker.models.Note
import java.sql.DriverManager

class NotesRepository(private val connectionString: String) {
    
    fun addNote(playerId: Long, playerName: String, content: String, colorCode: String = "#FFFFFF", isAuto: Boolean = false) {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement(
                "INSERT INTO notes (player_id, player_name, content, color_code, is_auto) VALUES (?, ?, ?, ?, ?)"
            )
            stmt.setLong(1, playerId)
            stmt.setString(2, playerName)
            stmt.setString(3, content)
            stmt.setString(4, colorCode)
            stmt.setInt(5, if (isAuto) 1 else 0)
            stmt.executeUpdate()
        } finally {
            conn.close()
        }
    }
    
    fun getPlayerNotes(playerId: Long): List<Note> {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement("""
                SELECT id, player_id, player_name, content, color_code, is_auto, created_at
                FROM notes
                WHERE player_id = ?
                ORDER BY created_at DESC
            """)
            stmt.setLong(1, playerId)
            val rs = stmt.executeQuery()
            val notes = mutableListOf<Note>()
            while (rs.next()) {
                notes.add(Note(
                    id = rs.getLong(1),
                    playerId = rs.getLong(2),
                    playerName = rs.getString(3),
                    content = rs.getString(4),
                    colorCode = rs.getString(5) ?: "#FFFFFF",
                    isAuto = rs.getInt(6) == 1,
                    createdAt = rs.getString(7) ?: ""
                ))
            }
            return notes
        } finally {
            conn.close()
        }
    }
    
    fun searchNotes(query: String): List<Note> {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement("""
                SELECT id, player_id, player_name, content, color_code, is_auto, created_at
                FROM notes
                WHERE content LIKE ?
                ORDER BY created_at DESC
            """)
            stmt.setString(1, "%$query%")
            val rs = stmt.executeQuery()
            val notes = mutableListOf<Note>()
            while (rs.next()) {
                notes.add(Note(
                    id = rs.getLong(1),
                    playerId = rs.getLong(2),
                    playerName = rs.getString(3),
                    content = rs.getString(4),
                    colorCode = rs.getString(5) ?: "#FFFFFF",
                    isAuto = rs.getInt(6) == 1,
                    createdAt = rs.getString(7) ?: ""
                ))
            }
            return notes
        } finally {
            conn.close()
        }
    }
    
    fun deleteNote(noteId: Long) {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement("DELETE FROM notes WHERE id = ?")
            stmt.setLong(1, noteId)
            stmt.executeUpdate()
        } finally {
            conn.close()
        }
    }
    
    fun updateNoteColor(noteId: Long, colorCode: String) {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val stmt = conn.prepareStatement("UPDATE notes SET color_code = ? WHERE id = ?")
            stmt.setString(1, colorCode)
            stmt.setLong(2, noteId)
            stmt.executeUpdate()
        } finally {
            conn.close()
        }
    }
    
    fun getAllNotes(): List<Note> {
        val conn = DriverManager.getConnection(connectionString)
        try {
            val rs = conn.createStatement().executeQuery("""
                SELECT id, player_id, player_name, content, color_code, is_auto, created_at
                FROM notes
                ORDER BY created_at DESC
            """)
            val notes = mutableListOf<Note>()
            while (rs.next()) {
                notes.add(Note(
                    id = rs.getLong(1),
                    playerId = rs.getLong(2),
                    playerName = rs.getString(3),
                    content = rs.getString(4),
                    colorCode = rs.getString(5) ?: "#FFFFFF",
                    isAuto = rs.getInt(6) == 1,
                    createdAt = rs.getString(7) ?: ""
                ))
            }
            return notes
        } finally {
            conn.close()
        }
    }
}
