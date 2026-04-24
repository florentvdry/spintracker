package spintracker.services

import spintracker.data.Database
import spintracker.models.*
import spintracker.parsers.BetclicParser
import spintracker.parsers.ParsedHand
import java.io.File

class ImportService(private val database: Database) {
    private val parser = BetclicParser()
    private val equityService = EquityService()
    private val analyticsService = AnalyticsService(equityService)
    
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
        
        val card1 = clean.substring(0, 2)
        val card2 = clean.substring(2, 4)
        
        val rank1 = card1[0]
        val rank2 = card2[0]
        val suit1 = if (card1.length > 1) card1[1] else ' '
        val suit2 = if (card2.length > 1) card2[1] else ' '
        
        val isSuited = suit1 == suit2
        val isPair = rank1 == rank2
        
        if (isPair) return "PP"
        
        val highRank = maxOf(rank1, rank2)
        val lowRank = minOf(rank1, rank2)
        
        return when {
            isSuited -> "${highRank}${lowRank}s"
            else -> "${highRank}${lowRank}o"
        }
    }
    
    private fun calculateActionFlags(playerHand: PlayerHand): PlayerHand {
        val preflop = playerHand.preflopAction ?: ""
        val flop = playerHand.flopAction ?: ""
        val turn = playerHand.turnAction ?: ""
        val river = playerHand.riverAction ?: ""
        
        val isAggressor = preflop.contains("raise", ignoreCase = true) || preflop.contains("bet", ignoreCase = true)
        
        val flopHasCheck = flop.contains("check", ignoreCase = true)
        val flopHasBet = flop.contains("bet", ignoreCase = true) || flop.contains("cbet", ignoreCase = true) || flop.contains("donk", ignoreCase = true)
        val flopHasRaise = flop.contains("raise", ignoreCase = true)
        val flopHasCall = flop.contains("call", ignoreCase = true)
        val flopHasFold = flop.contains("fold", ignoreCase = true)
        
        val turnHasCheck = turn.contains("check", ignoreCase = true)
        val turnHasBet = turn.contains("bet", ignoreCase = true) || turn.contains("cbet", ignoreCase = true) || turn.contains("donk", ignoreCase = true)
        val turnHasRaise = turn.contains("raise", ignoreCase = true)
        val turnHasCall = turn.contains("call", ignoreCase = true)
        val turnHasFold = turn.contains("fold", ignoreCase = true)
        
        val riverHasCheck = river.contains("check", ignoreCase = true)
        val riverHasBet = river.contains("bet", ignoreCase = true) || river.contains("cbet", ignoreCase = true) || river.contains("donk", ignoreCase = true)
        val riverHasRaise = river.contains("raise", ignoreCase = true)
        val riverHasCall = river.contains("call", ignoreCase = true)
        val riverHasFold = river.contains("fold", ignoreCase = true)
        
        val isStealAttempt = playerHand.position in listOf("BTN", "CO", "MP") && !preflop.contains("call", ignoreCase = true) && (preflop.contains("raise", ignoreCase = true) || preflop.contains("bet", ignoreCase = true))
        
        return playerHand.copy(
            flgVpip = preflop.contains("call", ignoreCase = true) || 
                      preflop.contains("raise", ignoreCase = true) ||
                      preflop.contains("bet", ignoreCase = true),
            flgPfr = isAggressor,
            flg3bet = preflop.contains("3-bet", ignoreCase = true) ||
                      preflop.contains("3bet", ignoreCase = true),
            flg4bet = preflop.contains("4-bet", ignoreCase = true) ||
                      preflop.contains("4bet", ignoreCase = true),
            flgSqueeze = preflop.contains("squeeze", ignoreCase = true),
            flgLimp = preflop.contains("limp", ignoreCase = true),
            flgCbetFlop = flop.contains("cbet", ignoreCase = true) ||
                          (flopHasBet && isAggressor),
            flgDonkFlop = flop.contains("donk", ignoreCase = true) ||
                          (flopHasBet && !isAggressor),
            flgFloatFlop = flopHasCall && !isAggressor && flopHasBet,
            flgCheckRaiseFlop = flopHasCheck && flopHasRaise,
            flgSawFlop = !flopHasFold,
            flgCbetTurn = turn.contains("cbet", ignoreCase = true) ||
                          (turnHasBet && isAggressor),
            flgDonkTurn = turn.contains("donk", ignoreCase = true) ||
                          (turnHasBet && !isAggressor),
            flgFloatTurn = turnHasCall && !isAggressor && turnHasBet,
            flgCheckRaiseTurn = turnHasCheck && turnHasRaise,
            flgSawTurn = !turnHasFold,
            flgCbetRiver = river.contains("cbet", ignoreCase = true) ||
                           (riverHasBet && isAggressor),
            flgDonkRiver = river.contains("donk", ignoreCase = true) ||
                           (riverHasBet && !isAggressor),
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
            flgBlindDefOpp = playerHand.position in listOf("SB", "BB") && (flopHasCall || flopHasRaise || turnHasCall || turnHasRaise || riverHasCall || riverHasRaise),
            flgSbStealFold = playerHand.position == "SB" && preflop.contains("fold", ignoreCase = true) && isStealAttempt,
            flgBbStealFold = playerHand.position == "BB" && preflop.contains("fold", ignoreCase = true) && isStealAttempt,
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
        
        // Save hands to database in a single transaction
        database.useTransaction { conn ->
            println("DEBUG: Starting transaction, existing hands count: ${existingIds.size}")
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
                    // Get or create players - add ALL players from this hand, not just hero
                    val allPlayerNames = parsedHand.players.map { it.name }
                    
                    // Save all players first
                    val savedPlayers = mutableMapOf<String, Player>()
                    for (playerName in allPlayerNames) {
                        savedPlayers[playerName] = database.getOrCreatePlayer(playerName, parsedHand.room, conn)
                    }
                    
                    // Find hero
                    val heroParsed = parsedHand.players.find { it.isHero }
                    val heroNameFromHand = heroParsed?.name ?: heroName
                    val heroPlayer = savedPlayers[heroNameFromHand] ?: database.getOrCreatePlayer(heroNameFromHand, parsedHand.room, conn)
                    
                    // Calculate hero result and EV
                    val heroResult = heroParsed?.let { it.winnings - it.investment } ?: 0.0
                    
                    // Real EV calculation
                    val analytics = analyticsService.calculateHandAnalytics(parsedHand, heroPlayer.name)
                    val heroEv = analytics?.evChips ?: heroResult
                    val netWonAdjusted = analytics?.evChips ?: heroResult
                    
                    // Use hero's wentToShowdown (like .NET backend)
                    val heroWentToShowdown = heroParsed?.wentToShowdown ?: parsedHand.wentToShowdown
                    
                    // Save hand
                    val hand = Hand(
                        handId = parsedHand.id,
                        gameId = parsedHand.gameId ?: "",
                        tableName = parsedHand.tableId ?: "",
                        room = parsedHand.room,
                        siteId = detectSite(parsedHand.room),
                        dateTime = parsedHand.dateTime,
                        heroName = heroPlayer.name,
                        heroPosition = 0,
                        playerCount = parsedHand.playerCount,
                        bigBlind = parsedHand.bb,
                        handRank = 0,
                        handType = "",
                        result = heroResult,
                        ev = heroEv,
                        wentToShowdown = heroWentToShowdown,
                        rawContent = parsedHand.result,
                        buyIn = parsedHand.buyIn,
                        prizePool = parsedHand.prizePool,
                        multiplier = parsedHand.multiplier,
                        position = heroParsed?.place ?: 0
                    )
                    
                    val dbHandId = database.saveHand(hand, conn)
                    totalHandsImported++
                    
                    // Save player hands (use hand-level actions for all players)
                    for (parsedPlayer in parsedHand.players) {
                        val player = database.getOrCreatePlayer(parsedPlayer.name, parsedHand.room, conn)
                        val playerNetWonAdjusted = if (parsedPlayer.isHero) netWonAdjusted else (parsedPlayer.winnings - parsedPlayer.investment)
                        val playerHand = PlayerHand(
                            handId = dbHandId,
                            playerId = player.id,
                            playerName = player.name,
                            position = parsedPlayer.position,
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
                        database.savePlayerHand(playerHandWithFlags, dbHandId, player.id, conn)
                    }
                    
                    onProgress(ImportProgress.Importing(index + 1, total, totalHandsImported, totalHandsSkipped))
                } catch (e: Exception) {
                    val errorMsg = "Error saving hand ${parsedHand.id}: ${e.message}"
                    errors.add(errorMsg)
                    println("IMPORT ERROR: $errorMsg")
                    e.printStackTrace()
                }
            }
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