package spintracker.services

import spintracker.data.Database
import spintracker.models.*
import spintracker.parsers.BetclicParser
import spintracker.parsers.ParsedHand
import java.io.File
import java.sql.Connection
import java.sql.PreparedStatement

class ImportService(private val database: Database) {
    private val parser = BetclicParser()
    private val equityService = EquityService()
    private val analyticsService = AnalyticsService(equityService)

    // Compiled regex patterns for action flag calculation (avoid recompilation per hand)
    private val raisePattern = Regex("raise", RegexOption.IGNORE_CASE)
    private val betPattern = Regex("bet", RegexOption.IGNORE_CASE)
    private val callPattern = Regex("call", RegexOption.IGNORE_CASE)
    private val foldPattern = Regex("fold", RegexOption.IGNORE_CASE)
    private val checkPattern = Regex("check", RegexOption.IGNORE_CASE)
    private val cbetPattern = Regex("cbet", RegexOption.IGNORE_CASE)
    private val donkPattern = Regex("donk", RegexOption.IGNORE_CASE)
    private val threeBetPattern = Regex("3-?bet", RegexOption.IGNORE_CASE)
    private val fourBetPattern = Regex("4-?bet", RegexOption.IGNORE_CASE)
    private val squeezePattern = Regex("squeeze", RegexOption.IGNORE_CASE)
    private val limpPattern = Regex("limp", RegexOption.IGNORE_CASE)

    // Pre-computed hand group cache for all 169 hand types
    private val handGroupCache: Map<String, String> = buildMap {
        val ranks = "23456789TJQKA"
        val suits = "hsdc"
        
        // Pairs
        for (r in ranks) {
            for (s1 in suits) {
                for (s2 in suits) {
                    if (s1 != s2) {
                        put("${r}${s1}${r}${s2}".uppercase(), "PP")
                    }
                }
            }
        }
        
        // Non-pairs
        for (i in ranks.indices) {
            for (j in 0 until i) {
                val highRank = ranks[i]
                val lowRank = ranks[j]
                
                // Suited
                for (s in suits) {
                    put("${highRank}${s}${lowRank}${s}".uppercase(), "${highRank}${lowRank}s")
                }
                
                // Offsuit
                for (s1 in suits) {
                    for (s2 in suits) {
                        if (s1 != s2) {
                            put("${highRank}${s1}${lowRank}${s2}".uppercase(), "${highRank}${lowRank}o")
                        }
                    }
                }
            }
        }
    }

    private fun detectSite(roomName: String): Int {
        return when {
            roomName.contains("winamax", ignoreCase = true) -> 1
            roomName.contains("pokerstars", ignoreCase = true) -> 2
            roomName.contains("betclic", ignoreCase = true) -> 3
            roomName.contains("unibet", ignoreCase = true) -> 4
            roomName.contains("pmu", ignoreCase = true) -> 5
            else -> 1
        }
    }

    private fun classifyHandGroup(holeCards: String?): String? {
        if (holeCards.isNullOrBlank() || holeCards.length < 4) return null
        val clean = holeCards.replace("[^a-zA-Z0-9]", "").uppercase()
        if (clean.length < 4) return null
        
        // Fast path: use cache
        return handGroupCache[clean] ?: run {
            // Slow path: compute and cache
            val card1 = clean.substring(0, 2)
            val card2 = clean.substring(2, 4)
            
            val rank1 = card1[0]
            val rank2 = card2[0]
            val suit1 = if (card1.length > 1) card1[1] else ' '
            val suit2 = if (card2.length > 1) card2[1] else ' '
            
            val isSuited = suit1 == suit2
            val isPair = rank1 == rank2
            
            if (isPair) "PP"
            else {
                val highRank = maxOf(rank1, rank2)
                val lowRank = minOf(rank1, rank2)
                if (isSuited) "${highRank}${lowRank}s" else "${highRank}${lowRank}o"
            }
        }
    }

    private fun calculateActionFlags(playerHand: PlayerHand): PlayerHand {
        val preflop = playerHand.preflopAction ?: ""
        val flop = playerHand.flopAction ?: ""
        val turn = playerHand.turnAction ?: ""
        val river = playerHand.riverAction ?: ""
        
        // Combine all actions for pattern matching
        val allActions = "$preflop $flop $turn $river"
        
        // Single-pass pattern matching
        val isAggressor = raisePattern.containsMatchIn(preflop) || betPattern.containsMatchIn(preflop)
        
        val flopHasCheck = checkPattern.containsMatchIn(flop)
        val flopHasBet = betPattern.containsMatchIn(flop) || cbetPattern.containsMatchIn(flop) || donkPattern.containsMatchIn(flop)
        val flopHasRaise = raisePattern.containsMatchIn(flop)
        val flopHasCall = callPattern.containsMatchIn(flop)
        val flopHasFold = foldPattern.containsMatchIn(flop)
        
        val turnHasCheck = checkPattern.containsMatchIn(turn)
        val turnHasBet = betPattern.containsMatchIn(turn) || cbetPattern.containsMatchIn(turn) || donkPattern.containsMatchIn(turn)
        val turnHasRaise = raisePattern.containsMatchIn(turn)
        val turnHasCall = callPattern.containsMatchIn(turn)
        val turnHasFold = foldPattern.containsMatchIn(turn)
        
        val riverHasCheck = checkPattern.containsMatchIn(river)
        val riverHasBet = betPattern.containsMatchIn(river) || cbetPattern.containsMatchIn(river) || donkPattern.containsMatchIn(river)
        val riverHasRaise = raisePattern.containsMatchIn(river)
        val riverHasCall = callPattern.containsMatchIn(river)
        val riverHasFold = foldPattern.containsMatchIn(river)
        
        val isStealAttempt = playerHand.position in listOf("BTN", "CO", "MP") && 
                            !callPattern.containsMatchIn(preflop) && 
                            (raisePattern.containsMatchIn(preflop) || betPattern.containsMatchIn(preflop))
        
        return playerHand.copy(
            flgVpip = callPattern.containsMatchIn(preflop) || raisePattern.containsMatchIn(preflop) || betPattern.containsMatchIn(preflop),
            flgPfr = isAggressor,
            flg3bet = threeBetPattern.containsMatchIn(allActions),
            flg4bet = fourBetPattern.containsMatchIn(allActions),
            flgSqueeze = squeezePattern.containsMatchIn(allActions),
            flgLimp = limpPattern.containsMatchIn(allActions),
            flgCbetFlop = cbetPattern.containsMatchIn(flop) || (flopHasBet && isAggressor),
            flgDonkFlop = donkPattern.containsMatchIn(flop) || (flopHasBet && !isAggressor),
            flgFloatFlop = flopHasCall && !isAggressor && flopHasBet,
            flgCheckRaiseFlop = flopHasCheck && flopHasRaise,
            flgSawFlop = !flopHasFold,
            flgCbetTurn = cbetPattern.containsMatchIn(turn) || (turnHasBet && isAggressor),
            flgDonkTurn = donkPattern.containsMatchIn(turn) || (turnHasBet && !isAggressor),
            flgFloatTurn = turnHasCall && !isAggressor && turnHasBet,
            flgCheckRaiseTurn = turnHasCheck && turnHasRaise,
            flgSawTurn = !turnHasFold,
            flgCbetRiver = cbetPattern.containsMatchIn(river) || (riverHasBet && isAggressor),
            flgDonkRiver = donkPattern.containsMatchIn(river) || (riverHasBet && !isAggressor),
            flgCheckRaiseRiver = riverHasCheck && riverHasRaise,
            flgSawRiver = !riverHasFold,
            flgXcFlop = flopHasCheck && flopHasCall,
            flgXfFlop = flopHasCheck && flopHasFold,
            flgXcTurn = turnHasCheck && turnHasCall,
            flgXfTurn = turnHasCheck && turnHasFold,
            flgXcRiver = riverHasCheck && riverHasCall,
            flgXfRiver = riverHasCheck && riverHasFold,
            flgRaiseFlop = flopHasRaise,
            flgRaiseTurn = turnHasRaise,
            flgRaiseRiver = riverHasRaise,
            flgStealAtt = isStealAttempt,
            flgBlindDefOpp = playerHand.position in listOf("SB", "BB") && 
                            (flopHasCall || flopHasRaise || turnHasCall || turnHasRaise || riverHasCall || riverHasRaise),
            flgSbStealFold = playerHand.position == "SB" && foldPattern.containsMatchIn(preflop) && isStealAttempt,
            flgBbStealFold = playerHand.position == "BB" && foldPattern.containsMatchIn(preflop) && isStealAttempt,
            flgFHasPosition = playerHand.position in listOf("BTN", "CO") && flop.isNotEmpty(),
            flgTHasPosition = playerHand.position in listOf("BTN", "CO") && turn.isNotEmpty(),
            flgRHasPosition = playerHand.position in listOf("BTN", "CO") && river.isNotEmpty(),
            flgIsAggressor = isAggressor,
            handGroup = classifyHandGroup(playerHand.holeCards),
            isSuited = playerHand.holeCards?.let { hc ->
                if (hc.length >= 5) hc[1] == hc[3] else false
            } ?: false,
            isPair = playerHand.holeCards?.let { hc ->
                if (hc.length >= 4) hc[0] == hc[2] else false
            } ?: false
        )
    }

    sealed class ImportProgress {
        data class Counting(val current: Int, val total: Int) : ImportProgress()
        data class Importing(val current: Int, val total: Int, val handsImported: Int, val handsSkipped: Int) : ImportProgress()
        data class Complete(val handsImported: Int, val handsSkipped: Int, val errors: List<String>) : ImportProgress()
    }

    fun importFiles(filePaths: List<String>, heroName: String, onProgress: (ImportProgress) -> Unit): ImportResult {
        val errors = mutableListOf<String>()
        var totalHandsImported = 0
        var totalHandsSkipped = 0
        val existingIds = database.getExistingHandIds()

        // First pass: count hands
        val allParsedHands = mutableListOf<ParsedHand>()

        for (filePath in filePaths) {
            try {
                val file = File(filePath)
                val content = file.readText()

                if (parser.detectFormat(content)) {
                    val result = parser.parseFile(content)
                    if (result.success) {
                        allParsedHands.addAll(result.hands)
                    }
                }
            } catch (e: Exception) {
                errors.add("Error reading ${filePath}: ${e.message}")
            }
        }

        val total = allParsedHands.size
        println("DEBUG: Found $total hands to import")
        onProgress(ImportProgress.Counting(0, total))

        // Player cache for this import session
        val playerCache = mutableMapOf<String, Player>()

        // Save hands to database in a single transaction with optimized operations
        database.useTransaction { conn ->
            println("DEBUG: Starting transaction, existing hands count: ${existingIds.size}")
            
            // Prepare statements once (reuse for all hands)
            val handStmt = conn.prepareStatement("""
                INSERT INTO hands (hand_id, game_id, table_name, room, site_id, date_time, hero_name, hero_position, player_count, big_blind, hand_rank, hand_type, result, ev, went_to_showdown, raw_content, buy_in, prize_pool, multiplier, position, flop, turn, river, total_pot)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """)
            
            val playerHandStmt = conn.prepareStatement("""
                INSERT INTO player_hands (hand_id, player_id, player_name, position, position_type, stack_size, is_hero, hole_cards, preflop_action, flop_action, turn_action, river_action, winnings, net_result, net_won_adjusted, place, went_to_showdown,
                    flg_vpip, flg_pfr, flg_3bet, flg_4bet, flg_squeeze, flg_limp,
                    flg_cbet_flop, flg_donk_flop, flg_float_flop, flg_check_raise_flop, flg_saw_flop,
                    flg_cbet_turn, flg_donk_turn, flg_float_turn, flg_check_raise_turn, flg_saw_turn,
                    flg_cbet_river, flg_donk_river, flg_check_raise_river, flg_saw_river,
                    flg_allin, flg_face_allin, allin_action, flg_is_aggressor, aggressor_position,
                    bounty_won, equity_percent, expected_won, icm_equity_percent, showed_cards, won_at_showdown, folded_before_showdown,
                    effective_stack_preflop, effective_stack_flop, effective_stack_turn, effective_stack_river, spr_flop, hand_group, is_suited, is_pair)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?)
            """)
            
            for ((index, parsedHand) in allParsedHands.withIndex()) {
                if (index % 100 == 0) {
                    println("DEBUG: Processing hand ${index + 1}/$total")
                }
                if (existingIds.contains(parsedHand.id)) {
                    totalHandsSkipped++
                    onProgress(ImportProgress.Importing(index + 1, total, totalHandsImported, totalHandsSkipped))
                    continue
                }

                try {
                    println("DEBUG: Saving hand ${parsedHand.id} with ${parsedHand.players.size} players")
                    
                    // Get or create players (CACHED - avoids N+1 queries)
                    val allPlayerNames = parsedHand.players.map { it.name }
                    val savedPlayers = mutableMapOf<String, Player>()
                    
                    for (playerName in allPlayerNames) {
                        val key = "$playerName|${parsedHand.room}"
                        savedPlayers[playerName] = playerCache.getOrPut(key) {
                            database.getOrCreatePlayer(playerName, parsedHand.room, conn)
                        }
                    }

                    // Find hero
                    val heroParsed = parsedHand.players.find { it.isHero }
                    val heroNameFromHand = heroParsed?.name ?: heroName
                    val heroPlayer = savedPlayers[heroNameFromHand] 
                        ?: playerCache.getOrPut("$heroNameFromHand|${parsedHand.room}") {
                            database.getOrCreatePlayer(heroNameFromHand, parsedHand.room, conn)
                        }

                    // Calculate hero result and EV
                    val heroResult = heroParsed?.let { it.winnings - it.investment } ?: 0.0

                    // Real EV calculation (now uses lookup table for preflop all-ins)
                    val analytics = analyticsService.calculateHandAnalytics(parsedHand, heroPlayer.name)
                    val heroEv = analytics?.evChips ?: heroResult
                    val netWonAdjusted = analytics?.evChips ?: heroResult

                    // Use hero's wentToShowdown (like .NET backend)
                    val heroWentToShowdown = heroParsed?.wentToShowdown ?: parsedHand.wentToShowdown

                    // Save hand (REUSED statement)
                    handStmt.setString(1, parsedHand.id)
                    handStmt.setString(2, parsedHand.gameId ?: "")
                    handStmt.setString(3, parsedHand.tableId ?: "")
                    handStmt.setString(4, parsedHand.room)
                    handStmt.setInt(5, detectSite(parsedHand.room))
                    handStmt.setString(6, parsedHand.dateTime.format(java.time.format.DateTimeFormatter.ISO_LOCAL_DATE_TIME))
                    handStmt.setString(7, heroPlayer.name)
                    handStmt.setInt(8, 0)
                    handStmt.setInt(9, parsedHand.playerCount)
                    handStmt.setDouble(10, parsedHand.bb)
                    handStmt.setInt(11, 0)
                    handStmt.setString(12, "")
                    handStmt.setDouble(13, heroResult)
                    handStmt.setDouble(14, heroEv)
                    handStmt.setInt(15, if (heroWentToShowdown) 1 else 0)
                    handStmt.setString(16, parsedHand.result)
                    handStmt.setDouble(17, parsedHand.buyIn)
                    handStmt.setDouble(18, parsedHand.prizePool)
                    handStmt.setInt(19, parsedHand.multiplier)
                    handStmt.setInt(20, heroParsed?.place ?: 0)
                    handStmt.setString(21, parsedHand.flop)
                    handStmt.setString(22, parsedHand.turn)
                    handStmt.setString(23, parsedHand.river)
                    handStmt.setDouble(24, parsedHand.totalPot)
                    handStmt.executeUpdate()
                    handStmt.clearParameters()
                    
                    val dbHandId = database.getLastInsertId(conn)
                    totalHandsImported++

                    // Save player hands (REUSED statement)
                    for (parsedPlayer in parsedHand.players) {
                        val player = playerCache.getOrPut("${parsedPlayer.name}|${parsedHand.room}") {
                            database.getOrCreatePlayer(parsedPlayer.name, parsedHand.room, conn)
                        }
                        
                        val playerNetWonAdjusted = if (parsedPlayer.isHero) netWonAdjusted else (parsedPlayer.winnings - parsedPlayer.investment)
                        val playerHand = PlayerHand(
                            handId = dbHandId,
                            playerId = player.id,
                            playerName = player.name,
                            position = parsedPlayer.position,
                            positionType = "",
                            stackSize = parsedPlayer.stack.toDouble(),
                            isHero = parsedPlayer.isHero,
                            holeCards = parsedPlayer.cards,
                            preflopAction = parsedHand.preflopAction,
                            flopAction = parsedHand.flopAction,
                            turnAction = parsedHand.turnAction,
                            riverAction = parsedHand.riverAction,
                            winnings = parsedPlayer.winnings,
                            netResult = parsedPlayer.winnings - parsedPlayer.investment,
                            netWonAdjusted = playerNetWonAdjusted,
                            place = parsedPlayer.place,
                            wentToShowdown = parsedPlayer.wentToShowdown
                        )
                        val playerHandWithFlags = calculateActionFlags(playerHand)
                        
                        var i = 1
                        playerHandStmt.setLong(i++, playerHandWithFlags.handId)
                        playerHandStmt.setLong(i++, player.id)
                        playerHandStmt.setString(i++, player.name)
                        playerHandStmt.setString(i++, playerHandWithFlags.position)
                        playerHandStmt.setString(i++, playerHandWithFlags.positionType)
                        playerHandStmt.setDouble(i++, playerHandWithFlags.stackSize)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.isHero) 1 else 0)
                        playerHandStmt.setString(i++, playerHandWithFlags.holeCards ?: "")
                        playerHandStmt.setString(i++, playerHandWithFlags.preflopAction ?: "")
                        playerHandStmt.setString(i++, playerHandWithFlags.flopAction ?: "")
                        playerHandStmt.setString(i++, playerHandWithFlags.turnAction ?: "")
                        playerHandStmt.setString(i++, playerHandWithFlags.riverAction ?: "")
                        playerHandStmt.setDouble(i++, playerHandWithFlags.winnings)
                        playerHandStmt.setDouble(i++, playerHandWithFlags.netResult)
                        playerHandStmt.setDouble(i++, playerHandWithFlags.netWonAdjusted)
                        playerHandStmt.setInt(i++, playerHandWithFlags.place)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.wentToShowdown) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgVpip) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgPfr) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flg3bet) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flg4bet) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgSqueeze) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgLimp) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgCbetFlop) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgDonkFlop) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgFloatFlop) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgCheckRaiseFlop) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgSawFlop) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgCbetTurn) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgDonkTurn) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgFloatTurn) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgCheckRaiseTurn) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgSawTurn) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgCbetRiver) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgDonkRiver) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgCheckRaiseRiver) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgSawRiver) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgAllin) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgFaceAllin) 1 else 0)
                        playerHandStmt.setString(i++, playerHandWithFlags.allinAction ?: "")
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.flgIsAggressor) 1 else 0)
                        playerHandStmt.setString(i++, playerHandWithFlags.aggressorPosition ?: "")
                        playerHandStmt.setDouble(i++, playerHandWithFlags.bountyWon)
                        playerHandStmt.setDouble(i++, playerHandWithFlags.equityPercent)
                        playerHandStmt.setDouble(i++, playerHandWithFlags.expectedWon)
                        playerHandStmt.setDouble(i++, playerHandWithFlags.icmEquityPercent)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.showedCards) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.wonAtShowdown) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.foldedBeforeShowdown) 1 else 0)
                        playerHandStmt.setDouble(i++, playerHandWithFlags.effectiveStackPreflop ?: 0.0)
                        playerHandStmt.setDouble(i++, playerHandWithFlags.effectiveStackFlop ?: 0.0)
                        playerHandStmt.setDouble(i++, playerHandWithFlags.effectiveStackTurn ?: 0.0)
                        playerHandStmt.setDouble(i++, playerHandWithFlags.effectiveStackRiver ?: 0.0)
                        playerHandStmt.setDouble(i++, playerHandWithFlags.sprFlop ?: 0.0)
                        playerHandStmt.setString(i++, playerHandWithFlags.handGroup ?: "")
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.isSuited) 1 else 0)
                        playerHandStmt.setInt(i++, if (playerHandWithFlags.isPair) 1 else 0)
                        
                        playerHandStmt.executeUpdate()
                        playerHandStmt.clearParameters()
                    }

                    onProgress(ImportProgress.Importing(index + 1, total, totalHandsImported, totalHandsSkipped))
                } catch (e: Exception) {
                    val errorMsg = "Error saving hand ${parsedHand.id}: ${e.message}"
                    errors.add(errorMsg)
                    println("IMPORT ERROR: $errorMsg")
                    e.printStackTrace()
                }
            }
            
            handStmt.close()
            playerHandStmt.close()
        }

        onProgress(ImportProgress.Complete(totalHandsImported, totalHandsSkipped, errors))

        return ImportResult(
            success = true,
            handsImported = totalHandsImported,
            handsSkipped = totalHandsSkipped,
            errors = errors
        )
    }

    fun countHandsInFile(filePath: String): Int {
        return try {
            val content = File(filePath).readText()
            if (parser.detectFormat(content)) {
                val result = parser.parseFile(content)
                result.count
            } else {
                0
            }
        } catch (e: Exception) {
            0
        }
    }
}

data class ImportResult(
    val success: Boolean,
    val handsImported: Int,
    val handsSkipped: Int,
    val errors: List<String>
)
