package spintracker.data.migrations

import java.sql.Connection

class Migration014_HUD : Migration {
    override val version = 14
    override val description = "HUD settings - opacity, position, display options"
    
    override fun migrate(connection: Connection) {
        connection.createStatement().execute("""
            CREATE TABLE IF NOT EXISTS hud_settings (
                id INTEGER PRIMARY KEY,
                show_hud INTEGER DEFAULT 1,
                opacity REAL DEFAULT 0.9,
                position TEXT DEFAULT 'top_right',
                font_size INTEGER DEFAULT 14,
                show_stats TEXT DEFAULT 'vpip,pfr,hands'
            )
        """)
        
        connection.createStatement().execute("""
            INSERT OR IGNORE INTO hud_settings (id, show_hud, opacity, position, font_size, show_stats)
            VALUES (1, 1, 0.9, 'top_right', 14, 'vpip,pfr,hands')
        """)
        
        connection.createStatement().execute("""
            INSERT OR IGNORE INTO config (key, value, category, is_system)
            VALUES ('database.version', '14', 'system', 1)
        """)
    }
}