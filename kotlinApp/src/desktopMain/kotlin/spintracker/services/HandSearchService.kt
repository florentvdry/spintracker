package spintracker.services

import spintracker.data.Database
import spintracker.models.Hand
import spintracker.models.PlayerHand
import java.sql.Connection
import java.sql.ResultSet
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

object HandSearchService {

    private val formatter = DateTimeFormatter.ISO_LOCAL_DATE_TIME

    fun search(query: String, heroName: String, database: Database = Database()): List<Hand> {
        val normalizedQuery = query.lowercase().trim()
        val tokens = parseTokens(normalizedQuery)
        val conditions = extractConditions(tokens, heroName)
        
        val sql = buildQuery(conditions, heroName)
        return executeQuery(sql, database)
    }

    private fun parseTokens(query: String): List<String> {
        return query.replace(Regex("[.,!?]"), " ")
            .split(Regex("\\s+"))
            .filter { it.isNotBlank() }
    }

    private data class SearchCondition(
        val table: String,
        val column: String,
        val operator: String,
        val value: Any,
        val conjunction: String = "AND"
    )

    private fun extractConditions(tokens: List<String>, heroName: String): List<SearchCondition> {
        val conditions = mutableListOf<SearchCondition>()
        
        conditions.add(SearchCondition("ph", "player_name", "=", heroName))
        
        if (tokens.any { it in listOf("folded", "fold", "folds") }) {
            if (tokens.any { it in listOf("river", "river-shove", "rivershove", "shove") && tokens.indexOf(it) > tokens.indexOf("river".takeIf { tokens.contains(it) } ?: "") }) {
                conditions.add(SearchCondition("ph", "folded_before_showdown", "=", 1))
            }
            if (tokens.any { it in listOf("flop", "flop-shove", "flopshove") }) {
                conditions.add(SearchCondition("ph", "folded_before_showdown", "=", 1))
            }
        }

        if (tokens.any { it in listOf("multiway", "3way", "3-way") }) {
            conditions.add(SearchCondition("h", "player_count", ">=", 3))
        } else if (tokens.any { it in listOf("heads-up", "headsup", "hu") }) {
            conditions.add(SearchCondition("h", "player_count", "=", 2))
        }

        val handPattern = Regex("([AKQJ2-9][ahsdkcqdc])([AKQJ2-9][ahsdkcqdc])?")
        val handMatch = handPattern.find(tokens.joinToString(" "))
        if (handMatch != null) {
            val cards = listOf(handMatch.groupValues[1], handMatch.groupValues[2]).filter { it.isNotEmpty() }
            val holeCards = cards.joinToString("")
            conditions.add(SearchCondition("ph", "hole_cards", "LIKE", "%$holeCards%"))
        }

        val positionKeywords = mapOf(
            "btn" to "BTN", "button" to "BTN",
            "sb" to "SB", "small-blind" to "SB",
            "bb" to "BB", "big-blind" to "BB",
            "utg" to "UTG", "utg1" to "UTG1", "utg2" to "UTG2",
            "co" to "CO", "cutoff" to "CO",
            "hj" to "HJ", "hj" to "HJ", "hijack" to "HJ",
            "mp" to "MP", "mp1" to "MP1", "mp2" to "MP2"
        )
        val queryStr = tokens.joinToString(" ")
        for ((keyword, position) in positionKeywords) {
            if (queryStr.contains(keyword)) {
                conditions.add(SearchCondition("ph", "position", "=", position))
                break
            }
        }

        if (tokens.any { it in listOf("3bet", "3-bet", "three-bet") }) {
            conditions.add(SearchCondition("ph", "flg_3bet", "=", 1))
        }

        if (tokens.any { it in listOf("4bet", "4-bet", "four-bet") }) {
            conditions.add(SearchCondition("ph", "flg_4bet", "=", 1))
        }

        if (tokens.any { it in listOf("cbet", "c-bet", "continuation") }) {
            conditions.add(SearchCondition("ph", "flg_cbet_flop", "=", 1))
        }

        if (tokens.any { it in listOf("suited") }) {
            conditions.add(SearchCondition("ph", "is_suited", "=", 1))
        }

        if (tokens.any { it in listOf("pair", "pocket") }) {
            conditions.add(SearchCondition("ph", "is_pair", "=", 1))
        }

        if (tokens.any { it in listOf("showdown", "show-down") }) {
            conditions.add(SearchCondition("ph", "went_to_showdown", "=", 1))
        }

        if (tokens.any { it in listOf("allin", "all-in") }) {
            conditions.add(SearchCondition("ph", "flg_allin", "=", 1))
        }

        if (tokens.any { it in listOf("won", "winner") }) {
            conditions.add(SearchCondition("ph", "place", "=", 1))
        }

        if (tokens.any { it in listOf("limp", "limped") }) {
            conditions.add(SearchCondition("ph", "flg_limp", "=", 1))
        }

        if (tokens.any { it in listOf("squeeze") }) {
            conditions.add(SearchCondition("ph", "flg_squeeze", "=", 1))
        }

        return conditions
    }

    private fun buildQuery(conditions: List<SearchCondition>, heroName: String): String {
        val whereClauses = conditions.mapIndexed { index, cond ->
            val conjunction = if (index == 0) "" else " ${cond.conjunction} "
            val condValue = when {
                cond.value is String && cond.operator == "LIKE" -> "'%${cond.value}%'"
                cond.value is String -> "'${cond.value}'"
                else -> cond.value.toString()
            }
            "$conjunction${cond.table}.${cond.column} ${cond.operator} $condValue"
        }.joinToString("")

        return """
            SELECT DISTINCT h.id, h.hand_id, h.game_id, h.table_name, h.room, h.site_id,
                   h.date_time, h.hero_name, h.hero_position, h.player_count, h.big_blind,
                   h.hand_rank, h.hand_type, h.result, h.ev, h.went_to_showdown, h.raw_content,
                   h.tournament_id, h.buy_in, h.prize_pool, h.multiplier, h.position,
                   h.flop, h.turn, h.river, h.total_pot, h.players_flop, h.players_turn,
                   h.players_river, h.imported_at, h.pot_flop, h.pot_turn, h.pot_river,
                   ph.id as ph_id, ph.player_name, ph.position as ph_position,
                   ph.hole_cards, ph.preflop_action, ph.flop_action, ph.turn_action, ph.river_action
            FROM hands h
            JOIN player_hands ph ON h.id = ph.hand_id
            WHERE ph.player_name = '$heroName'
            $whereClauses
            ORDER BY h.date_time DESC
            LIMIT 500
        """.trimIndent()
    }

    private fun executeQuery(sql: String, database: Database): List<Hand> {
        val hands = mutableListOf<Hand>()
        val conn = database.getConnection()
        
        try {
            val rs = conn.createStatement().executeQuery(sql)
            while (rs.next()) {
                hands.add(resultSetToHand(rs))
            }
        } finally {
            conn.close()
        }
        return hands
    }

    private fun resultSetToHand(rs: ResultSet): Hand {
        return Hand(
            id = rs.getLong("id"),
            handId = rs.getString("hand_id"),
            gameId = rs.getString("game_id"),
            tableName = rs.getString("table_name"),
            room = rs.getString("room"),
            siteId = rs.getInt("site_id"),
            dateTime = LocalDateTime.parse(rs.getString("date_time"), formatter),
            heroName = rs.getString("hero_name"),
            heroPosition = rs.getInt("hero_position"),
            playerCount = rs.getInt("player_count"),
            bigBlind = rs.getDouble("big_blind"),
            handRank = rs.getInt("hand_rank"),
            handType = rs.getString("hand_type"),
            result = rs.getDouble("result"),
            ev = rs.getDouble("ev"),
            wentToShowdown = rs.getInt("went_to_showdown") == 1,
            rawContent = rs.getString("raw_content"),
            tournamentId = rs.getObject("tournament_id") as? Long,
            buyIn = rs.getDouble("buy_in"),
            prizePool = rs.getDouble("prize_pool"),
            multiplier = rs.getInt("multiplier"),
            position = rs.getInt("position"),
            flop = rs.getString("flop"),
            turn = rs.getString("turn"),
            river = rs.getString("river"),
            totalPot = rs.getDouble("total_pot"),
            playersFlop = rs.getInt("players_flop"),
            playersTurn = rs.getInt("players_turn"),
            playersRiver = rs.getInt("players_river"),
            importedAt = rs.getString("imported_at"),
            potFlop = rs.getDouble("pot_flop"),
            potTurn = rs.getDouble("pot_turn"),
            potRiver = rs.getDouble("pot_river")
        )
    }
}