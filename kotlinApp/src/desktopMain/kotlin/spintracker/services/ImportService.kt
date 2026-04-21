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
        
        // Save hands to database in a single transaction
        database.useTransaction { conn ->
            for (parsedHand in allParsedHands) {
                if (existingIds.contains(parsedHand.id)) {
                    totalHandsSkipped++
                    continue
                }
                
                try {
                    // Get or create players
                    val heroParsed = parsedHand.players.find { it.isHero }
                    val heroNameFromHand = heroParsed?.name ?: heroName
                    val heroPlayer = database.getOrCreatePlayer(heroNameFromHand, parsedHand.room, conn)
                    
                    // Calculate hero result and EV
                    val heroResult = heroParsed?.let { it.winnings - it.investment } ?: 0.0
                    
                    // Real EV calculation
                    val analytics = analyticsService.calculateHandAnalytics(parsedHand, heroPlayer.name)
                    val heroEv = analytics?.evChips ?: heroResult
                    
                    // Use hero's wentToShowdown (like .NET backend)
                    val heroWentToShowdown = heroParsed?.wentToShowdown ?: parsedHand.wentToShowdown
                    
                    // Map position to integer (0=BTN, 1=SB, 2=BB etc or custom mapping)
                    val heroPosInt = when (heroParsed?.position) {
                        "BTN" -> 0
                        "SB" -> 1
                        "BB" -> 2
                        else -> 0
                    }
                    
                    // Save hand
                    val hand = Hand(
                        handId = parsedHand.id,
                        gameId = parsedHand.gameId ?: "",
                        tableName = parsedHand.tableId ?: "",
                        room = parsedHand.room,
                        dateTime = parsedHand.dateTime,
                        heroName = heroPlayer.name,
                        heroPosition = heroPosInt,
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
                        val playerHand = PlayerHand(
                            handId = dbHandId,
                            playerId = player.id,
                            playerName = player.name,
                            position = when (parsedPlayer.position) {
                                "BTN" -> 0
                                "SB" -> 1
                                "BB" -> 2
                                else -> 0
                            },
                            stackSize = parsedPlayer.stack.toDouble(),
                            isHero = parsedPlayer.isHero,
                            holeCards = parsedPlayer.cards,
                            winnings = parsedPlayer.winnings,
                            netResult = parsedPlayer.winnings - parsedPlayer.investment
                        )
                        database.savePlayerHand(playerHand, conn)
                    }
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