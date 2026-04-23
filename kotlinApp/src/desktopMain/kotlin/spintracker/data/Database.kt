package spintracker.data

import spintracker.models.*
import java.io.File
import java.sql.*
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

class Database(dbPath: String? = null) {
    private val connectionString: String
    
    init {
        connectionString = when {
            dbPath != null && dbPath.startsWith("jdbc:") -> dbPath
            dbPath == ":memory:" -> "jdbc:sqlite:file::memory:?cache=shared"
            else -> {
                val userHome = System.getProperty("user.home")
                val appDir = File(userHome, "spintracker")
                appDir.mkdirs()
                val path = dbPath ?: File(appDir, "poker_tracker.db").absolutePath
                "jdbc:sqlite:$path"
            }
        }
        initialize()
    }
    
    private fun initialize() {
        var conn: Connection? = null
        try {
            DriverManager.setLoginTimeout(10)
            conn = DriverManager.getConnection(connectionString)
            
            // Set busy timeout and enable foreign keys
            conn.createStatement().execute("PRAGMA busy_timeout=10000")
            conn.createStatement().execute("PRAGMA foreign_keys=ON")
            
            // Create tables
            conn.createStatement().execute("""
                CREATE TABLE IF NOT EXISTS players (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    room TEXT NOT NULL DEFAULT '',
                    is_reg INTEGER DEFAULT 0,
                    notes TEXT DEFAULT '',
                    UNIQUE(name, room)
                )
            """)
            
conn.createStatement().execute("""
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
            
conn.createStatement().execute("""
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
            
            conn.createStatement().execute("""
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
            
            conn.createStatement().execute("""
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
            
            conn.createStatement().execute("""
                CREATE TABLE IF NOT EXISTS config (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            """)
            
            // Create indexes
            conn.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_hands_date ON hands(date_time)")
            conn.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_hands_hero ON hands(hero_name)")
            conn.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_player_hands_hand ON player_hands(hand_id)")
            conn.createStatement().execute("CREATE INDEX IF NOT EXISTS idx_player_hands_player ON player_hands(player_id)")
            
            // Add missing columns for database migration from older versions
            try {
                conn.createStatement().execute("ALTER TABLE players ADD COLUMN room TEXT DEFAULT ''")
            } catch (e: SQLException) {
                // Column may already exist
            }
            try {
                conn.createStatement().execute("ALTER TABLE hands ADD COLUMN went_to_showdown INTEGER DEFAULT 0")
            } catch (e: SQLException) {
                // Column may already exist
            }
            try {
                conn.createStatement().execute("ALTER TABLE hands ADD COLUMN player_count INTEGER DEFAULT 2")
                
                conn.createStatement().execute("ALTER TABLE hands ADD COLUMN buy_in REAL DEFAULT 0")
                conn.createStatement().execute("ALTER TABLE hands ADD COLUMN prize_pool REAL DEFAULT 0")
                conn.createStatement().execute("ALTER TABLE hands ADD COLUMN multiplier INTEGER DEFAULT 1")
                conn.createStatement().execute("ALTER TABLE hands ADD COLUMN position INTEGER DEFAULT 0")
                
                conn.createStatement().execute("ALTER TABLE tournaments ADD COLUMN player_count INTEGER DEFAULT 2")
            } catch (e: SQLException) {
                // Column may already exist
            }
            try {
                conn.createStatement().execute("ALTER TABLE tournaments ADD COLUMN result REAL DEFAULT 0")
            } catch (e: SQLException) {
                // Column may already exist
            }
            try {
                conn.createStatement().execute("ALTER TABLE player_hands ADD COLUMN place INTEGER DEFAULT 0")
            } catch (e: SQLException) {
                // Column may already exist
            }
            try {
                conn.createStatement().execute("ALTER TABLE player_hands ADD COLUMN went_to_showdown INTEGER DEFAULT 0")
            } catch (e: SQLException) {
                // Column may already exist
            }
            try {
                conn.createStatement().execute("ALTER TABLE player_hands ADD COLUMN net_won_adjusted REAL DEFAULT 0")
            } catch (e: SQLException) {
                // Column may already exist
            }
            try {
                conn.createStatement().execute("ALTER TABLE hands ADD COLUMN flop TEXT")
            } catch (e: SQLException) {
                // Column may already exist
            }
            try {
                conn.createStatement().execute("ALTER TABLE hands ADD COLUMN turn TEXT")
            } catch (e: SQLException) {
                // Column may already exist
            }
            try {
                conn.createStatement().execute("ALTER TABLE hands ADD COLUMN river TEXT")
            } catch (e: SQLException) {
                // Column may already exist
            }
            try {
                conn.createStatement().execute("ALTER TABLE hands ADD COLUMN total_pot REAL DEFAULT 0")
            } catch (e: SQLException) {
                // Column may already exist
            }
            
            conn.close()
            println("Database initialized at: $connectionString")
        } catch (e: SQLException) {
            println("Database initialization error: ${e.message}")
            try { conn?.close() } catch (e2: Exception) { }
            throw e
        }
    }
    
    fun getConnection(): Connection {
        return DriverManager.getConnection(connectionString)
    }

    fun <T> useTransaction(block: (Connection) -> T): T {
        val conn = getConnection()
        conn.autoCommit = false
        try {
            val result = block(conn)
            conn.commit()
            return result
        } catch (e: Exception) {
            conn.rollback()
            throw e
        } finally {
            conn.close()
        }
    }
    
    // Player operations
    fun getOrCreatePlayer(name: String, room: String = "", existingConn: Connection? = null): Player {
        val conn = existingConn ?: getConnection()
        try {
            val stmt = conn.prepareStatement("SELECT id, name, room, is_reg, notes FROM players WHERE name = ? AND room = ?")
            stmt.setString(1, name)
            stmt.setString(2, room)
            val rs = stmt.executeQuery()
            
            if (rs.next()) {
                val p = Player(
                    id = rs.getLong(1),
                    name = rs.getString(2),
                    room = rs.getString(3),
                    isReg = rs.getInt(4) == 1,
                    notes = rs.getString(5) ?: ""
                )
                rs.close()
                stmt.close()
                return p
            } else {
                rs.close()
                stmt.close()
                val insertStmt = conn.prepareStatement("INSERT INTO players (name, room) VALUES (?, ?)")
                insertStmt.setString(1, name)
                insertStmt.setString(2, room)
                insertStmt.executeUpdate()
                insertStmt.close()
                
                val lastIdStmt = conn.createStatement()
                val lastIdRs = lastIdStmt.executeQuery("SELECT last_insert_rowid()")
                val lastId = if (lastIdRs.next()) lastIdRs.getLong(1) else 0L
                lastIdRs.close()
                lastIdStmt.close()

                return Player(
                    id = lastId,
                    name = name,
                    room = room,
                    isReg = false,
                    notes = ""
                )
            }
        } finally {
            if (existingConn == null) conn.close()
        }
    }
    
    fun getAllPlayers(): List<Player> {
        val conn = getConnection()
        val players = mutableListOf<Player>()
        try {
            val rs = conn.createStatement().executeQuery("""
                SELECT p.id, p.name, p.room, p.is_reg, p.notes,
                       COUNT(DISTINCT ph.hand_id) as total_hands,
                       COALESCE(SUM(ph.net_result), 0) as total_profit
                FROM players p
                LEFT JOIN player_hands ph ON p.id = ph.player_id
                GROUP BY p.id, p.name, p.room, p.is_reg, p.notes
                ORDER BY total_hands DESC
            """)
            while (rs.next()) {
                val totalHands = rs.getInt(6)
                val isReg = rs.getInt(4) == 1
                val isRegForced = totalHands < 500 && isReg
                players.add(Player(
                    id = rs.getLong(1),
                    name = rs.getString(2),
                    room = rs.getString(3) ?: "",
                    isReg = isReg,
                    isRegForced = isRegForced,
                    notes = rs.getString(5) ?: "",
                    totalHands = totalHands,
                    totalProfit = rs.getDouble(7)
                ))
            }
        } finally {
            conn.close()
        }
        return players
    }
    
    fun updatePlayerRegStatus(playerId: Long, isReg: Boolean) {
        val conn = getConnection()
        try {
            val stmt = conn.prepareStatement("UPDATE players SET is_reg = ? WHERE id = ?")
            stmt.setInt(1, if (isReg) 1 else 0)
            stmt.setLong(2, playerId)
            stmt.executeUpdate()
        } finally {
            conn.close()
        }
    }
    
    fun getHandsAgainstPlayer(opponentName: String, heroName: String, limit: Int = 20, page: Int = 1): List<Map<String, Any?>> {
        val conn = getConnection()
        val hands = mutableListOf<Map<String, Any?>>()
        try {
            val offset = (page - 1) * limit
            val sql = """
                SELECT h.id, h.hand_id, h.date_time, h.room, h.big_blind, h.buy_in,
                       h.flop, h.turn, h.river, h.went_to_showdown, h.player_count,
                       ph_hero.hole_cards as hero_cards,
                       ph_hero.position as hero_position,
                       ph_hero.net_result as hero_profit,
                       ph_hero.preflop_action as hero_preflop_action,
                       ph_opp.net_result as opponent_profit,
                       (h.ev) as ev_chips
                FROM hands h
                JOIN player_hands ph_opp ON h.id = ph_opp.hand_id AND ph_opp.player_name = ?
                JOIN player_hands ph_hero ON h.id = ph_hero.hand_id AND ph_hero.player_name = ?
                WHERE h.player_count <= 3
                ORDER BY h.date_time DESC
                LIMIT ? OFFSET ?
            """
            val stmt = conn.prepareStatement(sql)
            stmt.setString(1, opponentName)
            stmt.setString(2, heroName)
            stmt.setInt(3, limit)
            stmt.setInt(4, offset)
            
            val rs = stmt.executeQuery()
            while (rs.next()) {
                hands.add(mapOf(
                    "id" to rs.getLong(1),
                    "hand_id" to rs.getString(2),
                    "date_time" to rs.getString(3),
                    "room" to rs.getString(4),
                    "blinds" to rs.getDouble(5),
                    "buy_in" to rs.getDouble(6),
                    "flop" to rs.getString(7),
                    "turn" to rs.getString(8),
                    "river" to rs.getString(9),
                    "went_to_showdown" to (rs.getInt(10) == 1),
                    "player_count" to rs.getInt(11),
                    "hero_cards" to rs.getString(12),
                    "hero_position" to rs.getString(13),
                    "hero_profit" to rs.getDouble(14),
                    "ev_chips" to rs.getDouble(15)
                ))
            }
            rs.close()
            stmt.close()
        } finally {
            conn.close()
        }
        return hands
    }
    
    fun getCountHandsAgainstPlayer(opponentName: String, heroName: String): Int {
        val conn = getConnection()
        try {
            val sql = """
                SELECT COUNT(*)
                FROM hands h
                JOIN player_hands ph_opp ON h.id = ph_opp.hand_id AND ph_opp.player_name = ?
                JOIN player_hands ph_hero ON h.id = ph_hero.hand_id AND ph_hero.player_name = ?
                WHERE h.player_count <= 3
            """
            val stmt = conn.prepareStatement(sql)
            stmt.setString(1, opponentName)
            stmt.setString(2, heroName)
            val rs = stmt.executeQuery()
            return if (rs.next()) rs.getInt(1) else 0
        } finally {
            conn.close()
        }
    }
    
    // Hand operations
    fun saveHand(hand: Hand, existingConn: Connection? = null): Long {
        val conn = existingConn ?: getConnection()
        try {
            // First check if hand exists
            val checkStmt = conn.prepareStatement("SELECT id FROM hands WHERE hand_id = ?")
            checkStmt.setString(1, hand.handId)
            val checkRs = checkStmt.executeQuery()
            if (checkRs.next()) {
                val existingId = checkRs.getLong(1)
                checkRs.close()
                checkStmt.close()
                return existingId // Return existing ID
            }
            checkRs.close()
            checkStmt.close()
            
            val stmt = conn.prepareStatement("""
                INSERT INTO hands (hand_id, game_id, table_name, room, date_time, hero_name, hero_position, player_count, big_blind, hand_rank, hand_type, result, ev, went_to_showdown, raw_content, buy_in, prize_pool, multiplier, position)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """)
            
            stmt.setString(1, hand.handId)
            stmt.setString(2, hand.gameId)
            stmt.setString(3, hand.tableName)
            stmt.setString(4, hand.room)
            stmt.setString(5, hand.dateTime.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME))
            stmt.setString(6, hand.heroName)
            stmt.setInt(7, hand.heroPosition)
            stmt.setInt(8, hand.playerCount)
            stmt.setDouble(9, hand.bigBlind)
            stmt.setInt(10, hand.handRank)
            stmt.setString(11, hand.handType)
            stmt.setDouble(12, hand.result)
            stmt.setDouble(13, hand.ev)
            stmt.setInt(14, if (hand.wentToShowdown) 1 else 0)
            stmt.setString(15, hand.rawContent)
            stmt.setDouble(16, hand.buyIn)
            stmt.setDouble(17, hand.prizePool)
            stmt.setInt(18, hand.multiplier)
            stmt.setInt(19, hand.position)
            
            stmt.executeUpdate()
            stmt.close()
            
            val lastIdStmt = conn.createStatement()
            val lastIdRs = lastIdStmt.executeQuery("SELECT last_insert_rowid()")
            val lastId = if (lastIdRs.next()) lastIdRs.getLong(1) else 0L
            lastIdRs.close()
            lastIdStmt.close()
            
return lastId
        } finally {
            if (existingConn == null) conn.close()
        }
    }
    
    fun savePlayerHand(ph: PlayerHand, existingConn: Connection? = null) {
        val conn = existingConn ?: getConnection()
        try {
            val stmt = conn.prepareStatement("""
                INSERT INTO player_hands (hand_id, player_id, player_name, position, stack_size, is_hero, hole_cards, winnings, net_result, net_won_adjusted, place, went_to_showdown)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """)
            stmt.setLong(1, ph.handId)
            stmt.setLong(2, ph.playerId)
            stmt.setString(3, ph.playerName)
            stmt.setString(4, ph.position)
            stmt.setDouble(5, ph.stackSize)
            stmt.setInt(6, if (ph.isHero) 1 else 0)
            stmt.setString(7, ph.holeCards ?: "")
            stmt.setDouble(8, ph.winnings)
            stmt.setDouble(9, ph.netResult)
            stmt.setDouble(10, ph.netWonAdjusted)
            stmt.setInt(11, ph.place)
            stmt.setInt(12, if (ph.wentToShowdown) 1 else 0)
            stmt.executeUpdate()
            stmt.close()
        } finally {
            if (existingConn == null) conn.close()
        }
    }
    
    fun getExistingHandIds(): Set<String> {
        val conn = getConnection()
        val ids = mutableSetOf<String>()
        try {
            val rs = conn.createStatement().executeQuery("SELECT hand_id FROM hands")
            while (rs.next()) {
                ids.add(rs.getString(1))
            }
        } finally {
            conn.close()
        }
        return ids
    }
    
    fun getHands(heroName: String? = null, limit: Int = 100): List<Hand> {
        val conn = getConnection()
        val hands = mutableListOf<Hand>()
        try {
            val sql = buildString {
                append("SELECT id, hand_id, game_id, table_name, room, date_time, hero_name, hero_position, big_blind, hand_rank, hand_type, result, ev, tournament_id ")
                append("FROM hands ")
                if (heroName != null) {
                    append("WHERE hero_name = ? ")
                }
                append("ORDER BY date_time DESC ")
                append("LIMIT ?")
            }
            
            val stmt = if (heroName != null) {
                conn.prepareStatement(sql).apply {
                    setString(1, heroName)
                    setInt(2, limit)
                }
            } else {
                conn.prepareStatement(sql).apply {
                    setInt(1, limit)
                }
            }
            
            val rs = stmt.executeQuery()
            val formatter = DateTimeFormatter.ISO_LOCAL_DATE_TIME
            while (rs.next()) {
                hands.add(Hand(
                    id = rs.getLong(1),
                    handId = rs.getString(2),
                    gameId = rs.getString(3),
                    tableName = rs.getString(4),
                    room = rs.getString(5),
                    dateTime = LocalDateTime.parse(rs.getString(6), formatter),
                    heroName = rs.getString(7),
                    heroPosition = rs.getInt(8),
                    bigBlind = rs.getDouble(9),
                    handRank = rs.getInt(10),
                    handType = rs.getString(11),
                    result = rs.getDouble(12),
                    ev = rs.getDouble(13),
                    tournamentId = rs.getObject(14) as? Long
                ))
            }
        } finally {
            conn.close()
        }
        return hands
    }
    
    // Dashboard stats
    fun getDashboardStats(heroName: String? = null): DashboardStats {
        val conn = getConnection()
        try {
            val targetHero = heroName ?: "jmenfouu"
            
            val stmt = conn.prepareStatement("""
                SELECT SUM(COALESCE(ph.net_won_adjusted, ph.net_result)), SUM(ph.net_result), COUNT(*),
                       COUNT(DISTINCT h.game_id)
                FROM hands h
                JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = ?
                WHERE h.player_count <= 3
            """)
            stmt.setString(1, targetHero)
            
            val rs = stmt.executeQuery()
            if (!rs.next()) return DashboardStats()
            
            val totalEv = rs.getDouble(1)
            val totalEvChips = rs.getDouble(2)
            val totalHands = rs.getInt(3)
            val totalTournaments = rs.getInt(4)
            val avgChipsEv = if (totalTournaments > 0) totalEv / totalTournaments else 0.0
            
            rs.close()
            stmt.close()
            
            val profitStmt = conn.prepareStatement("""
                SELECT h.buy_in, h.prize_pool, SUM(ph.net_result) as chip_profit,
                       MAX(h.player_count) as max_players, MAX(h.multiplier) as multiplier,
                       MAX(ph.place) as position
                FROM hands h
                JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = ?
                WHERE h.player_count <= 3
                GROUP BY h.game_id
            """)
            profitStmt.setString(1, targetHero)
            val profitRs = profitStmt.executeQuery()
            
            var totalProfitEuro = 0.0
            while (profitRs.next()) {
                val b = profitRs.getDouble(1)
                val p = profitRs.getDouble(2)
                val cp = profitRs.getDouble(3)
                val pc = profitRs.getInt(4)
                val m = profitRs.getInt(5)
                val pos = profitRs.getInt(6)
                
                if (p > 0 || m > 0) {
                    val hasSharing = (b > 0 && (p / b) >= 19.5) || m >= 20
                    val totalPrize = if (p > (m * b * 0.5)) p else (b * m)
                    var finishPos = pos
                    if (finishPos == 0) {
                        finishPos = if (cp > 0) 1 else (if (pc == 2) 2 else 3)
                    }
                    
                    var winAmount = 0.0
                    if (finishPos == 1) {
                        winAmount = if (hasSharing) (totalPrize * 0.75) else totalPrize
                    } else if (hasSharing) {
                        winAmount = when (finishPos) {
                            2 -> totalPrize * 0.15
                            3 -> totalPrize * 0.10
                            else -> 0.0
                        }
                    }
                    totalProfitEuro += (winAmount - b)
                } else {
                    totalProfitEuro += cp
                }
            }
            profitRs.close()
            profitStmt.close()
            
            val showdownStmt = conn.prepareStatement("""
                SELECT SUM(ph.net_result)
                FROM hands h
                JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = ?
                WHERE h.player_count <= 3 AND ph.went_to_showdown = 1
            """)
            showdownStmt.setString(1, targetHero)
            val showdownRs = showdownStmt.executeQuery()
            val chipsWonWithShowdown = if (showdownRs.next()) showdownRs.getDouble(1) else 0.0
            showdownRs.close()
            showdownStmt.close()
            
            val noShowdownStmt = conn.prepareStatement("""
                SELECT SUM(ph.net_result)
                FROM hands h
                JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = ?
                WHERE h.player_count <= 3 AND ph.went_to_showdown = 0
            """)
            noShowdownStmt.setString(1, targetHero)
            val noShowdownRs = noShowdownStmt.executeQuery()
            val chipsWonWithoutShowdown = if (noShowdownRs.next()) noShowdownRs.getDouble(1) else 0.0
            noShowdownRs.close()
            noShowdownStmt.close()
            
            val wonStmt = conn.prepareStatement("""
                SELECT COUNT(DISTINCT h.game_id)
                FROM hands h
                JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = ?
                WHERE h.player_count <= 3 AND ph.place = 1
            """)
            wonStmt.setString(1, targetHero)
            val wonRs = wonStmt.executeQuery()
            val tournamentsWon = if (wonRs.next()) wonRs.getInt(1) else 0
            wonRs.close()
            wonStmt.close()
            
            val cevByPosition = mutableMapOf<String, Double>()
            val posStmt = conn.prepareStatement("""
                SELECT ph.position, h.player_count,
                       SUM(COALESCE(ph.net_won_adjusted, ph.net_result)), COUNT(DISTINCT h.game_id) as tour_count
                FROM hands h
                JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = ?
                WHERE h.player_count <= 3
                GROUP BY ph.position, h.player_count
            """)
            posStmt.setString(1, targetHero)
            
            val posRs = posStmt.executeQuery()
            while (posRs.next()) {
                val pos = posRs.getString(1)
                val pc = posRs.getInt(2)
                val evSum = posRs.getDouble(3)
                
                val posName = when {
                    pc == 2 && pos == "SB" -> "HeadsUp SB"
                    pc == 2 && pos == "BB" -> "HeadsUp BB"
                    pc == 3 && pos == "BTN" -> "Button 3W"
                    pc == 3 && pos == "SB" -> "3Way Small Blind"
                    pc == 3 && pos == "BB" -> "3Way BigBlinds"
                    else -> "$pos ($pc players)"
                }
                cevByPosition[posName] = evSum
            }
            posRs.close()
            posStmt.close()
            
            return DashboardStats(
                totalProfit = totalProfitEuro,
                totalHands = totalHands,
                totalEv = totalEv,
                totalTournaments = totalTournaments,
                tournamentsWon = tournamentsWon,
                chipsWonWithShowdown = chipsWonWithShowdown,
                chipsWonWithoutShowdown = chipsWonWithoutShowdown,
                avgChipsEv = avgChipsEv,
                cevByPosition = cevByPosition
            )
        } finally {
            conn.close()
        }
        return DashboardStats()
    }
    
    // Delete all hands
    fun deleteAllHands() {
        val conn = getConnection()
        try {
            conn.createStatement().execute("DELETE FROM player_hands")
            conn.createStatement().execute("DELETE FROM hands")
            conn.createStatement().execute("DELETE FROM players")
            conn.createStatement().execute("DELETE FROM tournaments")
            conn.createStatement().execute("DELETE FROM stats")
        } finally {
            conn.close()
        }
    }
    
    // Get buy-ins
    fun getBuyIns(): List<Double> {
        val conn = getConnection()
        val buyIns = mutableListOf<Double>()
        try {
            val rs = conn.createStatement().executeQuery("SELECT DISTINCT buy_in FROM tournaments ORDER BY buy_in")
            while (rs.next()) {
                buyIns.add(rs.getDouble(1))
            }
        } finally {
            conn.close()
        }
        return buyIns
    }
    
    // Get tournaments
    fun getTournaments(heroName: String? = null, limit: Int = 50): List<Map<String, Any?>> {
        val conn = getConnection()
        val tournaments = mutableListOf<Map<String, Any?>>()
        try {
            val sql = """
                SELECT h.game_id, h.room, h.buy_in, h.prize_pool, h.multiplier, h.date_time,
                       COUNT(*) as hand_count,
                       AVG(h.ev) as avg_cev,
                       MAX(ph.place) as max_place,
                       SUM(ph.net_result) as sum_net_result
                FROM hands h
                JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = ?
                WHERE h.player_count <= 3
                GROUP BY h.game_id, h.room, h.buy_in, h.prize_pool, h.multiplier, h.date_time
                ORDER BY h.date_time DESC
                LIMIT ?
            """
            val stmt = conn.prepareStatement(sql)
            stmt.setString(1, heroName ?: "")
            stmt.setInt(2, limit)
            
            val rs = stmt.executeQuery()
            while (rs.next()) {
                val gameId = rs.getString(1)
                val room = rs.getString(2)
                val buyIn = rs.getDouble(3)
                val prizePool = rs.getDouble(4)
                val multiplier = rs.getInt(5)
                val dateTime = rs.getString(6)
                val handCount = rs.getInt(7)
                val avgCev = rs.getDouble(8)
                val maxPlace = rs.getInt(9)
                val sumNetResult = rs.getDouble(10)
                
                var netProfit = 0.0
                if (prizePool > 0 || multiplier > 0) {
                    val hasSharing = (buyIn > 0 && (prizePool / buyIn) >= 19.5) || multiplier >= 20
                    val totalPrize = if (prizePool > (multiplier * buyIn * 0.5)) prizePool else (buyIn * multiplier)
                    var finishPos = maxPlace
                    if (finishPos == 0) {
                        finishPos = if (sumNetResult > 0) 1 else 3
                    }
                    
                    if (finishPos == 1) {
                        netProfit = (if (hasSharing) (totalPrize * 0.75) else totalPrize) - buyIn
                    } else if (hasSharing) {
                        netProfit = when (finishPos) {
                            2 -> (totalPrize * 0.15) - buyIn
                            3 -> (totalPrize * 0.10) - buyIn
                            else -> -buyIn
                        }
                    } else {
                        netProfit = -buyIn
                    }
                } else {
                    netProfit = sumNetResult
                }
                
                tournaments.add(mapOf(
                    "gameId" to gameId,
                    "room" to room,
                    "buyIn" to buyIn,
                    "dateTime" to dateTime,
                    "handCount" to handCount,
                    "avgCev" to avgCev,
                    "netProfit" to netProfit
                ))
            }
            rs.close()
            stmt.close()
        } finally {
            conn.close()
        }
        return tournaments
    }
    
    fun getHandsByGameId(gameId: String, heroName: String): List<Map<String, Any?>> {
        val conn = getConnection()
        val hands = mutableListOf<Map<String, Any?>>()
        try {
            val sql = """
                SELECT h.id, h.date_time, ph.position, h.player_count,
                       h.ev, ph.net_result, ph.hole_cards, ph.winnings
                FROM hands h
                JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = ?
                WHERE h.game_id = ?
                ORDER BY h.date_time ASC
            """
            val stmt = conn.prepareStatement(sql)
            stmt.setString(1, heroName)
            stmt.setString(2, gameId)
            
            val rs = stmt.executeQuery()
            while (rs.next()) {
                hands.add(mapOf(
                    "id" to rs.getLong(1),
                    "dateTime" to rs.getString(2),
                    "heroPosition" to rs.getString(3),
                    "playerCount" to rs.getInt(4),
                    "ev" to rs.getDouble(5),
                    "netResult" to rs.getDouble(6),
                    "heroCards" to rs.getString(7),
                    "winnings" to rs.getDouble(8)
                ))
            }
            rs.close()
            stmt.close()
        } finally {
            conn.close()
        }
        return hands
    }


fun getGraphData(heroName: String? = null): List<GraphPoint> {
        val conn = getConnection()
        val points = mutableListOf<GraphPoint>()
        try {
            val sql = buildString {
                append("""
                    SELECT ph.net_result, h.ev, h.went_to_showdown
                    FROM player_hands ph
                    JOIN hands h ON ph.hand_id = h.id
                    WHERE ph.player_name = ?
                    ORDER BY h.date_time ASC
                """)
            }
            val stmt = conn.prepareStatement(sql)
            stmt.setString(1, heroName ?: "")
            
            val rs = stmt.executeQuery()
            var cumulativeEv = 0.0
            var cumulativeProfit = 0.0
            var cumulativeShowdown = 0.0
            var cumulativeNonShowdown = 0.0
            var count = 0
            
            // Add initial point
            points.add(GraphPoint(0, 0.0, 0.0, 0.0, 0.0))
            
            while (rs.next()) {
                val ev = rs.getDouble(2)  // Use the EV from hands table (calculated from equity)
                val result = rs.getDouble(1)
                val wts = rs.getInt(3) == 1
                
                count++
                
                cumulativeEv += ev
                cumulativeProfit += result
                if (wts) {
                    cumulativeShowdown += result
                } else {
                    cumulativeNonShowdown += result
                }
                
                // Add every single hand
                points.add(GraphPoint(count, cumulativeEv, cumulativeProfit, cumulativeShowdown, cumulativeNonShowdown))
            }
        } finally {
            conn.close()
        }
        return points
    }

    fun getRecentSessions(heroName: String? = null, limit: Int = 10): List<Session> {
        val conn = getConnection()
        val sessions = mutableListOf<Session>()
        try {
            val sql = """
                SELECT h.date_time, h.room, h.game_id, h.buy_in, h.prize_pool, 
                       ph.net_result, ph.net_won_adjusted, h.player_count, h.multiplier, ph.place
                FROM hands h
                JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = ?
                WHERE h.player_count <= 3
                ORDER BY h.date_time ASC
            """
            val stmt = conn.prepareStatement(sql)
            stmt.setString(1, heroName ?: "")
            
            val rs = stmt.executeQuery()
            val rawHands = mutableListOf<HandData>()
            
            while (rs.next()) {
                rawHands.add(
                    HandData(
                        dateTime = rs.getString(1),
                        room = rs.getString(2) ?: "Unknown",
                        gameId = rs.getString(3) ?: "",
                        buyIn = rs.getDouble(4),
                        prizePool = rs.getDouble(5),
                        netResult = rs.getDouble(6),
                        netWonAdjusted = rs.getDouble(7),
                        playerCount = rs.getInt(8),
                        multiplier = rs.getInt(9),
                        place = rs.getInt(10)
                    )
                )
            }
            rs.close()
            stmt.close()
            
            val currentSession = mutableListOf<HandData>()
            var lastTime: java.time.LocalDateTime? = null
            
            for (hand in rawHands) {
                val handTime = hand.localDateTime
                if (lastTime != null && java.time.Duration.between(lastTime, handTime).toHours() > 2) {
                    if (currentSession.isNotEmpty()) {
                        sessions.add(createSessionInfo(currentSession))
                        currentSession.clear()
                    }
                }
                currentSession.add(hand)
                lastTime = handTime
            }
            if (currentSession.isNotEmpty()) {
                sessions.add(createSessionInfo(currentSession))
            }
        } finally {
            conn.close()
        }
        return sessions.takeLast(limit).reversed()
    }
    
    data class HandData(
        val dateTime: String,
        val room: String,
        val gameId: String,
        val buyIn: Double,
        val prizePool: Double,
        val netResult: Double,
        val netWonAdjusted: Double,
        val playerCount: Int,
        val multiplier: Int,
        val place: Int
    ) {
        val localDateTime: java.time.LocalDateTime by lazy {
            try {
                java.time.LocalDateTime.parse(dateTime, java.time.format.DateTimeFormatter.ISO_LOCAL_DATE_TIME)
            } catch (e: Exception) {
                try {
                    java.time.LocalDateTime.parse(dateTime.replace("(UTC)", "").trim(), java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"))
                } catch (e2: Exception) {
                    java.time.LocalDateTime.now()
                }
            }
        }
    }
    
    private fun createSessionInfo(hands: List<HandData>): Session {
        val startTime = hands.minBy { it.localDateTime }.localDateTime
        val endTime = hands.maxBy { it.localDateTime }.localDateTime
        val room = hands.first().room
        val uniqueTournaments = hands.groupBy { it.gameId }.size
        val totalHands = hands.size
        
        var totalProfitEuro = 0.0
        val games = hands.groupBy { it.gameId }
        
        for ((_, gameHands) in games) {
            val first = gameHands.first()
            val multiplier = gameHands.maxOf { it.multiplier }
            val position = gameHands.maxOf { it.place }
            val lastPlayerCount = gameHands.maxOf { it.playerCount }
            val chipProfit = gameHands.sumOf { it.netResult }
            
            var profit = 0.0
            if (first.prizePool > 0 || multiplier > 0) {
                val hasSharing = (first.buyIn > 0 && (first.prizePool / first.buyIn) >= 19.5) || multiplier >= 20
                val totalPrize = if (first.prizePool > (multiplier * first.buyIn * 0.5)) first.prizePool else (first.buyIn * multiplier)
                
                var finishPos = position
                if (finishPos == 0) {
                    finishPos = if (chipProfit > 0) 1 else (if (lastPlayerCount == 2) 2 else 3)
                }
                
                var winAmount = 0.0
                if (finishPos == 1) {
                    winAmount = if (hasSharing) (totalPrize * 0.75) else totalPrize
                } else if (hasSharing) {
                    winAmount = when (finishPos) {
                        2 -> totalPrize * 0.15
                        3 -> totalPrize * 0.10
                        else -> 0.0
                    }
                }
                profit = winAmount - first.buyIn
            } else {
                profit = chipProfit
            }
            totalProfitEuro += profit
        }
        
        return Session(
            startTime = startTime.format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),
            endTime = endTime.format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),
            room = room,
            tournaments = uniqueTournaments,
            hands = totalHands,
            profit = totalProfitEuro
        )
    }

    fun getPlayerStats(playerId: Long): PlayerStats {
        val conn = getConnection()
        try {
            val stmt = conn.prepareStatement("""
                SELECT 
                    COUNT(*) as total_hands,
                    SUM(CASE WHEN preflop_action LIKE '%calls%' OR preflop_action LIKE '%raises%' OR preflop_action LIKE '%bets%' THEN 1 ELSE 0 END) as vpip_hands,
                    SUM(CASE WHEN preflop_action LIKE '%raises%' OR preflop_action LIKE '%bets%' THEN 1 ELSE 0 END) as pfr_hands,
                    SUM(CASE WHEN preflop_action LIKE '%3-bet%' OR preflop_action LIKE '%raises%' THEN 1 ELSE 0 END) as three_bet_hands,
                    SUM(net_result) as total_profit
                FROM player_hands
                WHERE player_id = ?
            """)
            stmt.setLong(1, playerId)
            val rs = stmt.executeQuery()
            
            if (rs.next()) {
                val total = rs.getInt("total_hands")
                if (total == 0) return PlayerStats()
                
                return PlayerStats(
                    vpip = (rs.getDouble("vpip_hands") / total) * 100.0,
                    pfr = (rs.getDouble("pfr_hands") / total) * 100.0,
                    threeBet = (rs.getDouble("three_bet_hands") / total) * 100.0,
                    handsPlayed = total,
                    profit = rs.getDouble("total_profit")
                )
            }
        } finally {
            conn.close()
        }
        return PlayerStats()
    }

    fun deleteAllData() {
        val conn = getConnection()
        try {
            conn.autoCommit = false
            val stmt = conn.createStatement()
            stmt.execute("DELETE FROM player_hands")
            stmt.execute("DELETE FROM hands")
            stmt.execute("DELETE FROM tournaments")
            stmt.execute("DELETE FROM stats")
            // We keep players but their stats will be 0
            conn.commit()
            println("All data deleted successfully.")
        } catch (e: Exception) {
            conn.rollback()
            println("Error deleting data: ${e.message}")
        } finally {
            conn.close()
        }
    }
    
    fun getHandReplayData(handId: String, heroName: String): Map<String, Any?>? {
        val conn = getConnection()
        try {
            val sql = """
                SELECT h.id, h.hand_id, h.date_time, h.room, h.big_blind, h.buy_in,
                       ph.player_name, ph.position, ph.stack_size, ph.hole_cards, ph.winnings, ph.net_result,
                       ph.preflop_action, ph.flop_action, ph.turn_action, ph.river_action,
                       h.flop, h.turn, h.river, h.went_to_showdown
                FROM hands h
                JOIN player_hands ph ON h.id = ph.hand_id
                WHERE h.id = ? AND ph.player_name = ?
            """
            val stmt = conn.prepareStatement(sql)
            stmt.setString(1, handId)
            stmt.setString(2, heroName)
            val rs = stmt.executeQuery()
            
            if (rs.next()) {
                val data = mutableMapOf<String, Any?>()
                data["handId"] = rs.getLong(1)
                data["dateTime"] = rs.getString(3)
                data["room"] = rs.getString(4)
                data["bigBlind"] = rs.getDouble(5)
                data["buyIn"] = rs.getDouble(6)
                data["playerName"] = rs.getString(7)
                data["position"] = rs.getString(8)
                data["stackSize"] = rs.getDouble(9)
                data["holeCards"] = rs.getString(10)
                data["winnings"] = rs.getDouble(11)
                data["netResult"] = rs.getDouble(12)
                data["preflopAction"] = rs.getString(13)
                data["flopAction"] = rs.getString(14)
                data["turnAction"] = rs.getString(15)
                data["riverAction"] = rs.getString(16)
                data["flop"] = rs.getString(17)
                data["turn"] = rs.getString(18)
                data["river"] = rs.getString(19)
                data["wentToShowdown"] = rs.getInt(20) == 1
                
                rs.close()
                stmt.close()
                
                // Get all players
                val playersSql = """
                    SELECT ph.player_name, ph.position, ph.stack_size, ph.hole_cards, ph.is_hero
                    FROM player_hands ph
                    WHERE ph.hand_id = ?
                """
                val playersStmt = conn.prepareStatement(playersSql)
                playersStmt.setString(1, handId)
                val playersRs = playersStmt.executeQuery()
                val players = mutableListOf<Map<String, Any?>>()
                while (playersRs.next()) {
                    players.add(mapOf(
                        "name" to playersRs.getString(1),
                        "position" to playersRs.getString(2),
                        "stackSize" to playersRs.getDouble(3),
                        "holeCards" to playersRs.getString(4),
                        "isHero" to (playersRs.getInt(5) == 1)
                    ))
                }
                playersRs.close()
                playersStmt.close()
                data["players"] = players
                
                return data
            }
            rs.close()
            stmt.close()
        } finally {
            conn.close()
        }
        return null
    }

    fun getRangeBreakdown(filters: AnalysisFilters): Map<String, RangeHandStats> {
        val conn = getConnection()
        val rangeData = mutableMapOf<String, RangeHandStats>()
        try {
            val sql = buildString {
                append("""
                    SELECT h.id, h.hand_id, h.date_time, h.hero_name, h.hero_position,
                           h.player_count, h.big_blind, h.result, h.ev,
                           ph.hole_cards, ph.preflop_action, ph.net_result
                    FROM hands h
                    JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = ?
                    WHERE h.player_count <= 3
                """)
                if (!filters.dateFrom.isNullOrBlank()) {
                    append(" AND h.date_time >= ?")
                }
                if (!filters.dateTo.isNullOrBlank()) {
                    append(" AND h.date_time <= ?")
                }
                if (filters.minStackBB != null) {
                    append(" AND h.big_blind * ? <= ph.stack_size")
                }
                if (filters.maxStackBB != null) {
                    append(" AND ph.stack_size <= h.big_blind * ?")
                }
                if (!filters.situationId.isNullOrBlank()) {
                    append(" AND h.position = ?")
                }
                append(" ORDER BY h.date_time DESC")
            }

            val stmt = conn.prepareStatement(sql)
            var paramIndex = 1
            val heroName = filters.heroName ?: "jmenfouu"
            stmt.setString(paramIndex++, heroName)

            if (!filters.dateFrom.isNullOrBlank()) {
                stmt.setString(paramIndex++, filters.dateFrom)
            }
            if (!filters.dateTo.isNullOrBlank()) {
                stmt.setString(paramIndex++, filters.dateTo)
            }
            if (filters.minStackBB != null) {
                stmt.setDouble(paramIndex++, filters.minStackBB)
            }
            if (filters.maxStackBB != null) {
                stmt.setDouble(paramIndex++, filters.maxStackBB)
            }
            if (!filters.situationId.isNullOrBlank()) {
                stmt.setString(paramIndex++, filters.situationId)
            }

            val rs = stmt.executeQuery()
            val formatter = java.time.format.DateTimeFormatter.ISO_LOCAL_DATE_TIME

            while (rs.next()) {
                val cards = rs.getString(10)
                if (cards.isNullOrBlank()) continue

                val normalizedCards = normalizeHandCards(cards)
                if (normalizedCards == null) continue

                val heroPosition = rs.getString(5)
                val targetPositions = filters.positions
                if (!targetPositions.isNullOrEmpty() && heroPosition !in targetPositions) {
                    continue
                }

                val actionType = determineActionType(rs.getString(11), filters.situationId)

                if (!rangeData.containsKey(normalizedCards)) {
                    rangeData[normalizedCards] = RangeHandStats(
                        hand = normalizedCards,
                        totalCount = 0,
                        totalProfit = 0.0,
                        totalEv = 0.0,
                        actions = emptyMap(),
                        hands = emptyList()
                    )
                }

                val existing = rangeData[normalizedCards]!!
                val profit = rs.getDouble(9)
                val ev = rs.getDouble(8)

                val updatedActions = existing.actions.toMutableMap()
                updatedActions[actionType] = (updatedActions[actionType] ?: 0) + 1

                val newHand = RangeHandSummary(
                    id = rs.getString(2),
                    date = java.time.LocalDateTime.parse(rs.getString(3), formatter),
                    profit = profit,
                    ev = if (rs.wasNull()) null else ev,
                    action = actionType
                )

                rangeData[normalizedCards] = existing.copy(
                    totalCount = existing.totalCount + 1,
                    totalProfit = existing.totalProfit + profit,
                    totalEv = existing.totalEv + ev,
                    actions = updatedActions,
                    hands = existing.hands + newHand
                )
            }

            rs.close()
            stmt.close()
        } finally {
            conn.close()
        }
        return rangeData
    }

    private fun normalizeHandCards(cards: String): String? {
        if (cards.isBlank() || cards.length < 4) return null
        val clean = cards.replace("[^a-zA-Z0-9]", "").uppercase()
        if (clean.length < 4) return null

        val card1 = clean.substring(0, 2)
        val card2 = clean.substring(2, 4)

        val rankOrder = mapOf('A' to 14, 'K' to 13, 'Q' to 12, 'J' to 11, 'T' to 10, '9' to 9, '8' to 8, '7' to 7, '6' to 6, '5' to 5, '4' to 4, '3' to 3, '2' to 2)

        val r1 = card1[0]
        val r2 = card2[0]
        val rank1 = rankOrder[r1] ?: 0
        val rank2 = rankOrder[r2] ?: 0

        val suited = clean.contains('s', ignoreCase = true) || (clean.length > 4 && clean[4] == 's')
        val offsuit = clean.contains('o', ignoreCase = true) || (clean.length > 4 && clean[4] == 'o')

        return if (rank1 == rank2) {
            "${r1}${r2}"
        } else if (rank1 > rank2) {
            "${r1}${r2}${if (suited) "s" else if (offsuit) "o" else ""}"
        } else {
            "${r2}${r1}${if (suited) "s" else if (offsuit) "o" else ""}"
        }
    }

    private fun determineActionType(preflopAction: String?, situationId: String?): String {
        if (preflopAction.isNullOrBlank()) return "None"
        val action = preflopAction.lowercase()
        return when {
            action.contains("all-in") || action.contains("allin") -> "AllIn"
            action.contains("raise") && action.contains("4") -> "Raise4BB"
            action.contains("raise") && (action.contains("2") || action.contains("3")) -> "Raise2_3BB"
            action.contains("raise") -> "Raise"
            action.contains("bet") -> "Bet"
            action.contains("call") -> "Call"
            action.contains("check") -> "Check"
            action.contains("fold") -> "Fold"
            else -> "None"
        }
    }
}