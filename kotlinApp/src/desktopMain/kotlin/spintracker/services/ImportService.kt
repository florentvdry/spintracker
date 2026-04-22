package spintracker.services

import spintracker.data.Database
import spintracker.models.*
import java.io.File

class ImportService(private val database: Database) {
    private val parser = BetclicParser()
    private val equityService = EquityService()
    private val analyticsService = AnalyticsService(equityService)
    
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
        onProgress(ImportProgress.Counting(0, total))
        
        // Save hands to database in a single transaction
        database.useTransaction { conn ->
            for ((index, parsedHand) in allParsedHands.withIndex()) {
                if (existingIds.contains(parsedHand.id)) {
                    totalHandsSkipped++
                    onProgress(ImportProgress.Importing(index + 1, total, totalHandsImported, totalHandsSkipped))
                    continue
                }
                
                try {
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
                        rawContent = parsedHand.result
                    )
                    
                    val dbHandId = database.saveHand(hand, conn)
                    totalHandsImported++
                    
                    // Save player hands
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
                            winnings = parsedPlayer.winnings,
                            netResult = parsedPlayer.winnings - parsedPlayer.investment,
                            netWonAdjusted = playerNetWonAdjusted,
                            place = parsedPlayer.place,
                            wentToShowdown = parsedPlayer.wentToShowdown
                        )
                        database.savePlayerHand(playerHand, conn)
                    }
                    
                    onProgress(ImportProgress.Importing(index + 1, total, totalHandsImported, totalHandsSkipped))
                } catch (e: Exception) {
                    errors.add("Error saving hand ${parsedHand.id}: ${e.message}")
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