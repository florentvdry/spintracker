package spintracker.data.migrations

import java.sql.Connection

class Migration001_InitialSchema : Migration {
    override val version = 1
    override val description = "Initial schema - existing tables"
    
    override fun migrate(connection: Connection) {
        connection.createStatement().execute("""
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                room TEXT NOT NULL DEFAULT '',
                is_reg INTEGER DEFAULT 0,
                notes TEXT DEFAULT '',
                UNIQUE(name, room)
            )
        """)
        
        connection.createStatement().execute("""
            CREATE TABLE IF NOT EXISTS tournaments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id TEXT UNIQUE NOT NULL,
                tournament_name TEXT,
                buy_in REAL,
                fee REAL,
                currency TEXT DEFAULT 'EUR',
                speed TEXT,
                max_players INTEGER,
                player_count INTEGER DEFAULT 2,
                result REAL DEFAULT 0,
                date_time TEXT,
                place INTEGER,
                prize REAL,
                rake REAL DEFAULT 0
            )
        """)
        
        connection.createStatement().execute("""
            CREATE TABLE IF NOT EXISTS hands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hand_id TEXT UNIQUE NOT NULL,
                game_id TEXT,
                table_name TEXT,
                room TEXT,
                date_time TEXT,
                hero_name TEXT,
                hero_position INTEGER,
                player_count INTEGER DEFAULT 2,
                big_blind REAL,
                hand_rank INTEGER,
                hand_type TEXT,
                result REAL DEFAULT 0,
                ev REAL DEFAULT 0,
                went_to_showdown INTEGER DEFAULT 0,
                raw_content TEXT,
                tournament_id INTEGER,
                buy_in REAL DEFAULT 0,
                prize_pool REAL DEFAULT 0,
                multiplier INTEGER DEFAULT 1,
                position INTEGER DEFAULT 0,
                flop TEXT,
                turn TEXT,
                river TEXT,
                total_pot REAL DEFAULT 0,
                FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
            )
        """)
        
        connection.createStatement().execute("""
            CREATE TABLE IF NOT EXISTS player_hands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hand_id INTEGER NOT NULL,
                player_id INTEGER NOT NULL,
                player_name TEXT,
                position TEXT,
                stack_size REAL,
                is_hero INTEGER DEFAULT 0,
                hole_cards TEXT,
                preflop_action TEXT,
                flop_action TEXT,
                turn_action TEXT,
                river_action TEXT,
                showdown_cards TEXT,
                final_hand TEXT,
                final_hand_rank INTEGER,
                winnings REAL DEFAULT 0,
                net_result REAL DEFAULT 0,
                net_won_adjusted REAL DEFAULT 0,
                place INTEGER DEFAULT 0,
                went_to_showdown INTEGER DEFAULT 0,
                FOREIGN KEY (hand_id) REFERENCES hands(id),
                FOREIGN KEY (player_id) REFERENCES players(id)
            )
        """)
        
        connection.createStatement().execute("""
            CREATE TABLE IF NOT EXISTS stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id INTEGER NOT NULL,
                hero_name TEXT,
                buy_in REAL,
                vpip REAL DEFAULT 0,
                pfr REAL DEFAULT 0,
                three_bet REAL DEFAULT 0,
                c_bet REAL DEFAULT 0,
                hands_played INTEGER DEFAULT 0,
                FOREIGN KEY (player_id) REFERENCES players(id)
            )
        """)
        
        connection.createStatement().execute("""
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_hands_date ON hands(date_time)")
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_hands_hero ON hands(hero_name)")
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_player_hands_hand ON player_hands(hand_id)")
        connection.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_player_hands_player ON player_hands(player_id)")
    }
}
