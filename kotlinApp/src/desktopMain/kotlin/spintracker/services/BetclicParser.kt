package spintracker.services

import spintracker.models.*
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.regex.Pattern

class BetclicParser {
    private val handSeparator = "------------"
    
    fun detectFormat(content: String): Boolean {
        return content.contains("Site: Betclic") || content.contains("*** HEADER ***")
    }
    
    fun parseFile(content: String): ParseResult {
        return try {
            val handTexts = content.split(handSeparator)
                .map { it.trim() }
                .filter { it.isNotEmpty() }
            
            val hands = mutableListOf<ParsedHand>()
            for (handText in handTexts) {
                val hand = parseHand(handText)
                if (hand != null) {
                    hands.add(hand)
                }
            }
            
            ParseResult(
                success = true,
                hands = hands,
                count = hands.size,
                error = null
            )
        } catch (e: Exception) {
            ParseResult(
                success = false,
                hands = emptyList(),
                count = 0,
                error = e.message
            )
        }
    }
    
    private fun parseHand(text: String): ParsedHand? {
        val lines = text.split('\n')
            .map { it.trim() }
            .filter { it.isNotEmpty() }
        
        if (lines.isEmpty()) return null
        
        val hand = ParsedHand(room = "Betclic.fr")
        var currentSection = "HEADER"
        var heroName: String? = null
        
        for (line in lines) {
            val newSection = detectSection(line)
            if (newSection != null) {
                currentSection = newSection
                // Reset street investment for all players on new street
                if (currentSection == "PREFLOP" || currentSection == "FLOP" || currentSection == "TURN" || currentSection == "RIVER") {
                    hand.players.forEach { it.streetInvestment = 0.0 }
                }
                if (currentSection == "SHOWDOWN") {
                    hand.wentToShowdown = true
                }
                
                // Parse board cards from section header if present
                if (currentSection == "FLOP" || currentSection == "TURN" || currentSection == "RIVER") {
                    parseBoardLine(line, currentSection, hand)
                }
                continue
            }
            
            when (currentSection) {
                "HEADER" -> parseHeaderLine(line, hand)
                "PLAYERS" -> { heroName = parsePlayerLine(line, hand) ?: heroName }
                "HOLE_CARDS", "SHOWDOWN", "SUMMARY" -> {
                    parseCardLine(line, hand)
                    if (currentSection == "SUMMARY") parseSummaryLine(line, hand)
                }
                "PREFLOP" -> {
                    parseActionLine(line, hand, currentSection)
                    hand.preflopAction += line + "\n"
                }
                "FLOP" -> {
                    parseActionLine(line, hand, currentSection)
                    hand.flopAction += line + "\n"
                }
                "TURN" -> {
                    parseActionLine(line, hand, currentSection)
                    hand.turnAction += line + "\n"
                }
                "RIVER" -> {
                    parseActionLine(line, hand, currentSection)
                    hand.riverAction += line + "\n"
                }
            }
            
            // For result log
            val resultLine = if (heroName != null) line.replace(heroName, "Hero") else line
            hand.result += resultLine + "\n"
        }
        
        // Post-processing
        hand.playerCount = hand.players.size
        
        // Normalize Heads-Up positions
        if (hand.playerCount == 2) {
            for (p in hand.players) {
                if (p.position == "BTN SB" || p.position == "BTN") {
                    p.position = "SB"
                }
            }
        }

        // Adjust for uncalled bets
        val totalInvestment = hand.players.sumOf { it.investment }
        if (totalInvestment > hand.totalPot && hand.players.isNotEmpty()) {
            val excess = totalInvestment - hand.totalPot
            val maxInvestor = hand.players.maxByOrNull { it.investment }
            if (maxInvestor != null) {
                maxInvestor.investment -= excess
            }
        }

        // 2. Consolidate showdown status
        if (hand.wentToShowdown) {
            for (p in hand.players) {
                if (!p.folded) {
                    p.wentToShowdown = true
                }
            }
        } else if (hand.players.any { !it.isHero && it.cards != null }) {
            hand.wentToShowdown = true
            for (p in hand.players) {
                if (!p.folded && p.cards != null) {
                    p.wentToShowdown = true
                }
            }
        }

        hand.id = hand.handId ?: hand.gameId ?: java.util.UUID.randomUUID().toString()
        return hand
    }
    
    private fun parseActionLine(line: String, hand: ParsedHand, street: String) {
        // Actions look like: "22:53:05 - jmenfouu: Posts SB 50"
        val actionPart = if (line.contains(" - ")) line.substringAfter(" - ") else line
        val playerName = actionPart.substringBefore(":").trim()
        val player = hand.players.find { it.name.equals(playerName, ignoreCase = true) } ?: return
        
        val action = actionPart.substringAfter(":").trim().lowercase()
        val amountMatch = Regex("(\\d+\\.?\\d*)").find(action)
        val amount = amountMatch?.groupValues?.get(1)?.toDoubleOrNull() ?: 0.0
        
        if (action.contains("all-in")) {
            player.isAllIn = true
            if (hand.allInStreet == null) {
                hand.allInStreet = street
            }
        }

        when {
            action.contains("raises to") -> {
                val totalTo = Regex("to (\\d+\\.?\\d*)").find(action)?.groupValues?.get(1)?.toDoubleOrNull() ?: amount
                val added = totalTo - player.streetInvestment
                if (added > 0) {
                    player.investment += added
                    player.streetInvestment = totalTo
                }
            }
            action.contains("posts") || action.contains("calls") || action.contains("bets") || action.contains("all-in") -> {
                player.investment += amount
                player.streetInvestment += amount
            }
            action.contains("folds") -> {
                player.folded = true
            }
        }
    }
    
    private fun parseCardLine(line: String, hand: ParsedHand) {
        val actionPart = if (line.contains(" - ")) line.substringAfter(" - ") else line
        
        if (actionPart.contains("does not show")) {
            val name = actionPart.substringBefore(" does not show").trim()
            val player = hand.players.find { it.name.equals(name, ignoreCase = true) }
            if (player != null) {
                hand.wentToShowdown = true
            }
            return
        }

        // More permissive regex to match cards in various formats [Kc 2d] or [Kc 2d 3h]
        val cardsMatch = Regex("\\[([\\dAKQJT10][hsdc](?: [\\dAKQJT10][hsdc])*)\\]").find(actionPart)
        if (cardsMatch != null) {
            val cards = cardsMatch.groupValues[1]
            val namePart = actionPart.substringBefore("[").trim()
            
            val playerNameRaw = when {
                actionPart.startsWith("Dealt to ") -> actionPart.substringAfter("Dealt to ").substringBefore("[").trim()
                namePart.contains(" shows") -> namePart.substringBefore(" shows").trim()
                namePart.contains(" mucks") -> namePart.substringBefore(" mucks").trim()
                namePart.contains(" showed") -> namePart.substringBefore(" showed").trim()
                namePart.endsWith(":") -> namePart.substringBefore(":").trim()
                else -> namePart
            }
            
            // Clean player name
            val playerName = playerNameRaw.replace("Seat \\d+: ".toRegex(), "").trim()
            
            if (playerName.isNotEmpty()) {
                val player = hand.players.find { it.name.equals(playerName, ignoreCase = true) }
                if (player != null) {
                    player.cards = cards
                    // Only mark as showdown if it's NOT the hero's hole cards (which are always present)
                    // or if it's explicitly shown/mucked by someone, OR if it's a villain revealed card
                    if (actionPart.contains("shows") || actionPart.contains("showed") || actionPart.contains("mucks") || (!player.isHero && !actionPart.startsWith("Dealt to "))) {
                        hand.wentToShowdown = true
                    }
                }
            }
        }
    }
    
    private fun parseBoardLine(line: String, section: String, hand: ParsedHand) {
        val match = Regex("\\[(.*?)\\]").find(line)
        if (match != null) {
            val cards = match.groupValues[1]
            when (section) {
                "FLOP" -> hand.flop = cards
                "TURN" -> {
                    val parts = cards.split(" ")
                    if (parts.isNotEmpty()) hand.turn = parts.last()
                }
                "RIVER" -> {
                    val parts = cards.split(" ")
                    if (parts.isNotEmpty()) hand.river = parts.last()
                }
            }
        }
}

    private fun parseSummaryLine(line: String, hand: ParsedHand) {
        val lowerLine = line.lowercase()
        
        val finishMatch = Regex("""(\S+)\s+finished\s+(\d+)(?:st|nd|rd|th)""").find(line)
        if (finishMatch != null) {
            val playerName = finishMatch.groupValues[1].trim()
            val finishPos = finishMatch.groupValues[2].toIntOrNull() ?: 0
            val player = hand.players.find { it.name.equals(playerName, ignoreCase = true) }
            if (player != null && finishPos > 0) {
                player.place = finishPos
            }
        }
        
        if (lowerLine.contains("wins main pot") || lowerLine.contains("wins side pot") || lowerLine.contains("collected pot") || lowerLine.contains("wins pot") || (lowerLine.contains("wins") && lowerLine.contains("pot"))) {
            val potMatch = Regex("""^(?:[0-9:]+\s*-\s*)?(.+?)\s+(?:wins|collected).+?pot""").find(line)
            val playerName = potMatch?.groupValues?.get(1)?.trim() ?: return

            val player = hand.players.find { it.name.equals(playerName, ignoreCase = true) } ?: return
            val amountMatch = Regex("""(?:pot of |pot )(\d+\.?\d*)""").find(line)
            val amount = amountMatch?.groupValues?.get(1)?.toDoubleOrNull() ?: 0.0
            player.winnings += amount

            if (player.isAllIn && hand.players.any { it.name != player.name && it.isAllIn }) {
                hand.wentToShowdown = true
            }
        }
    }
    
    private fun detectSection(line: String): String? {
        return when {
            line.contains("*** HEADER ***") -> "HEADER"
            line.contains("*** PLAYERS ***") -> "PLAYERS"
            line.contains("*** HOLE CARDS ***") -> "HOLE_CARDS"
            line.contains("*** PRE-FLOP ***") -> "PREFLOP"
            line.contains("*** FLOP ***") -> "FLOP"
            line.contains("*** TURN ***") -> "TURN"
            line.contains("*** RIVER ***") -> "RIVER"
            line.contains("*** SHOWDOWN ***") -> "SHOWDOWN"
            line.contains("*** SUMMARY ***") -> "SUMMARY"
            else -> null
        }
    }
    
    private fun parseHeaderLine(line: String, hand: ParsedHand) {
        when {
            line.startsWith("Site:") -> hand.room = line.substringAfter(":").trim()
            line.startsWith("Game Name:") -> hand.gameName = line.substringAfter(":").trim()
            line.startsWith("Game ID:") -> hand.gameId = line.substringAfter(":").trim()
            line.startsWith("Hand ID:") -> hand.handId = line.substringAfter(":").trim()
            line.startsWith("Date & Time:") -> {
                val dateStr = line.substringAfter(":").replace("(UTC)", "").trim()
                try {
                    val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
                    hand.dateTime = LocalDateTime.parse(dateStr, formatter)
                } catch (e: Exception) {
                    hand.dateTime = LocalDateTime.now()
                }
            }
            line.startsWith("Table ID:") -> hand.tableId = line.substringAfter(":").trim()
            line.startsWith("Blinds:") -> {
                val blinds = line.substringAfter(":").trim()
                val parts = blinds.split("/")
                if (parts.size == 2) {
                    hand.sb = parts[0].toDoubleOrNull() ?: 0.0
                    hand.bb = parts[1].toDoubleOrNull() ?: 0.0
                }
            }
            line.startsWith("Total Pot:") || line.contains("Total Pot") -> {
                val match = Regex("(\\d+\\.?\\d*)").find(line)
                hand.totalPot = match?.groupValues?.get(1)?.toDoubleOrNull() ?: 0.0
            }
        }
    }
    
    private fun parsePlayerLine(line: String, hand: ParsedHand): String? {
        if (line.contains("Seat ")) {
            val regex = Pattern.compile("Seat (\\d+): (.+?) \\((\\d+)\\)(.*)")
            val matcher = regex.matcher(line)
            if (matcher.find()) {
                val name = matcher.group(2)
                val extra = matcher.group(4)
                val isHero = extra.contains("Hero")
                
                val player = ParsedPlayer(
                    name = name,
                    stack = matcher.group(3).toInt(),
                    isHero = isHero,
                    position = extractPosition(extra)
                )
                
                // Also check for cards in player line
                val cardsMatch = Regex("\\[([\\dAKQJT][hsdc](?: [\\dAKQJT][hsdc])*)\\]").find(extra)
                if (cardsMatch != null) {
                    player.cards = cardsMatch.groupValues[1]
                }
                
                hand.players.add(player)
                return if (isHero) name else null
            }
        }
        return null
    }
    
    private fun extractPosition(positionStr: String): String {
        val upper = positionStr.uppercase()
        return when {
            upper.contains("BTN") && upper.contains("SB") -> "BTN SB"
            upper.contains("BTN") -> "BTN"
            upper.contains("SB") -> "SB"
            upper.contains("BB") -> "BB"
            upper.contains("CO") -> "CO"
            upper.contains("MP") -> "MP"
            upper.contains("UTG") -> "UTG"
            else -> "Unknown"
        }
    }
}

data class ParseResult(
    val success: Boolean,
    val hands: List<ParsedHand>,
    val count: Int,
    val error: String? = null
)

data class ParsedHand(
    var id: String = "",
    var handId: String? = null,
    var gameId: String? = null,
    var gameName: String? = null,
    var room: String = "",
    var tableId: String? = null,
    var dateTime: LocalDateTime = LocalDateTime.now(),
    var sb: Double = 0.0,
    var bb: Double = 0.0,
    var totalPot: Double = 0.0,
    var flop: String? = null,
    var turn: String? = null,
    var river: String? = null,
    var result: String = "",
    var wentToShowdown: Boolean = false,
    var playerCount: Int = 0,
    var allInStreet: String? = null,
    var preflopAction: String = "",
    var flopAction: String = "",
    var turnAction: String = "",
    var riverAction: String = "",
    val players: MutableList<ParsedPlayer> = mutableListOf()
)

data class ParsedPlayer(
    val name: String,
    var stack: Int = 0,
    var isHero: Boolean = false,
    var position: String = "",
    var cards: String? = null,
    var folded: Boolean = false,
    var isAllIn: Boolean = false,
    var winnings: Double = 0.0,
    var investment: Double = 0.0,
    var streetInvestment: Double = 0.0,
    var wentToShowdown: Boolean = false,
    var place: Int = 0
)
