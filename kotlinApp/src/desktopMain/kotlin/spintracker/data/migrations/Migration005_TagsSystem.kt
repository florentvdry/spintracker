package spintracker.data.migrations

import java.sql.Connection

class Migration005_TagsSystem : Migration {
    override val version = 5
    override val description = "Add tags and notes system"
    
    override fun migrate(connection: Connection) {
        connection.createStatement().execute("""
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                color_code TEXT DEFAULT '#808080',
                player_count INTEGER DEFAULT 0
            )
        """)
        
        connection.createStatement().execute("""
            CREATE TABLE IF NOT EXISTS player_tags (
                player_id INTEGER NOT NULL,
                tag_id INTEGER NOT NULL,
                UNIQUE(player_id, tag_id)
            )
        """)
        
        connection.createStatement().execute("""
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id INTEGER NOT NULL,
                player_name TEXT NOT NULL,
                content TEXT NOT NULL,
                color_code TEXT DEFAULT '#FFFFFF',
                is_auto INTEGER DEFAULT 0,
                created_at TEXT
            )
        """)
        
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_notes_content ON notes(content)")
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_notes_player ON notes(player_id)")
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_player_tags_player ON player_tags(player_id)")
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_player_tags_tag ON player_tags(tag_id)")
        
        val defaultTags = listOf(
            "Nit" to "#4169E1",
            "TAG" to "#32CD32",
            "LAG" to "#FFA500",
            "Fish" to "#FF6347",
            "Whale" to "#9370DB",
            "Reg" to "#20B2AA",
            "Unknown" to "#808080"
        )
        
        val insertTag = connection.prepareStatement(
            "INSERT OR IGNORE INTO tags (name, color_code) VALUES (?, ?)"
        )
        for ((name, color) in defaultTags) {
            insertTag.setString(1, name)
            insertTag.setString(2, color)
            insertTag.executeUpdate()
        }
        insertTag.close()
    }
}
