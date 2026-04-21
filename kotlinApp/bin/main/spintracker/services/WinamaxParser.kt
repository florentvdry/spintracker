package spintracker.services

import spintracker.models.*
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.regex.Pattern

class WinamaxParser {
    private val handSeparator = "\n\n\n" // Winamax hands are separated by 3 newlines
    
    fun detectFormat(content: String): Boolean {
        return content.contains("Winamax Poker")
    }
    
    fun parseFile(content: String): ParseResult {
        return try {
            // Winamax hands usually start with "Winamax Poker - "
            val handTexts = content.split(Regex("(?=Winamax Poker - )"))
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
        
        val hand = ParsedHand(room = "Winamax")
        var currentSection = "HEADER"
        var heroName: String? = null
        
        for (line in lines) {
            // Section Detection
            val newSection = when {
                line.startsWith("Winamax Poker - ") -> "HEADER"
                line.startsWith("Table: ") -> "TABLE"
                line.startsWith("Seat ") && line.contains(":") -> "PLAYERS"
                line.startsWith("*** ANTE/BLINDS ***") -> "BLINDS"
                line.startsWith("*** PRE-FLOP ***") -> "PREFLOP"
                line.startsWith("*** FLOP ***") -> "FLOP"
                line.startsWith("*** TURN ***") -> "TURN"
                line.startsWith("*** RIVER ***") -> "RIVER"
                line.startsWith("*** SHOW DOWN ***") -> "SHOWDOWN"
                line.startsWith("*** SUMMARY ***") -> "SUMMARY"
                else -> null
            }
            
            if (newSection != null) {
                currentSection = newSection
                if (currentSection == "PREFLOP" || currentSection == "FLOP" || currentSection == "TURN" || currentSection == "RIVER") {
                    hand.players.forEach { it.streetInvestment = 0.0 }
                }
                if (currentSection == "SHOWDOWN" || currentSection == "SUMMARY") {
                    hand.wentToShowdown = true
                }
                if (currentSection == "HEADER") {
                    parseHeaderLine(line, hand)
                }
                continue
            }
            
            when (currentSection) {
                "TABLE" -> parseTableLine(line, hand)
                "PLAYERS" -> { heroName = parsePlayerLine(line, hand) ?: heroName }
                "BLINDS", "PREFLOP", "FLOP", "TURN", "RIVER" -> parseActionLine(line, hand)
                "SHOWDOWN" -> parseShowdownLine(line, hand)
                "SUMMARY" -> parseSummaryLine(line, hand)
            }
            
            // For result log
            val resultLine = if (heroName != null) line.replace(heroName, "Hero") else line
            hand.result += resultLine + "\n"
        }
        
        // Post-processing: Adjust for uncalled bets
        val totalInvestment = hand.players.sumOf { it.investment }
        if (totalInvestment > hand.totalPot && hand.players.isNotEmpty()) {
            val maxInvestor = hand.players.maxByOrNull { it.investment }
            if (maxInvestor != null) {
                val excess = totalInvestment - hand.totalPot
                maxInvestor.investment -= excess
            }
        }
        
        hand.id = hand.handId ?: hand.gameId ?: java.util.UUID.randomUUID().toString()
        return hand
    }
    
    private fun parseHeaderLine(line: String, hand: ParsedHand) {
        // Winamax Poker - Tournament "Expresso" buyIn: 0.93€ + 0.07€ level: 2 - HandId: #4707488493780074497-6-1776261096 - Holdem no limit (15/30) - 2026/04/15 13:51:36 UTC
        val handIdMatch = Regex("HandId: #([\\d-]+)").find(line)
        hand.handId = handIdMatch?.groupValues?.get(1)
        hand.gameId = hand.handId?.substringBefore("-")
        
        val blindsMatch = Regex("\\((\\d+)/(\\d+)\\)").find(line)
        if (blindsMatch != null) {
            hand.sb = blindsMatch.groupValues[1].toDoubleOrNull() ?: 0.0
            hand.bb = blindsMatch.groupValues[2].toDoubleOrNull() ?: 0.0
        }
        
        val dateMatch = Regex("(\\d{4}/\\d{2}/\\d{2} \\d{2}:\\d{2}:\\d{2})").find(line)
        if (dateMatch != null) {
            try {
                val formatter = DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm:ss")
                hand.dateTime = LocalDateTime.parse(dateMatch.groupValues[1], formatter)
            } catch (e: Exception) {}
        }
    }
    
    private fun parseTableLine(line: String, hand: ParsedHand) {
        // Table: 'Expresso(1096047576)#0' 3-max (real money) Seat #3 is the button
        if (line.startsWith("Table: ")) {
            hand.tableId = line.substringAfter("'").substringBefore("'")
        }
    }
    
    private fun parsePlayerLine(line: String, hand: ParsedHand): String? {
        // Seat 1: riickyy777 (380)
        if (line.startsWith("Seat ")) {
            val match = Regex("Seat (\\d+): (.+?) \\((\\d+)\\)").find(line)
            if (match != null) {
                val seat = match.groupValues[1]
                val name = match.groupValues[2]
                val stack = match.groupValues[3].toIntOrNull() ?: 0
                
                // Hero is usually detected via "Dealt to HeroName" line in BLINDS/PREFLOP section
                // But we add them all now
                hand.players.add(ParsedPlayer(name = name, stack = stack))
            }
        }
        return null
    }
    
    private fun parseActionLine(line: String, hand: ParsedHand) {
        // Dealt to Nelfrot-YT [5d 7d]
        if (line.startsWith("Dealt to ")) {
            val name = line.substringAfter("Dealt to ").substringBefore("[").trim()
            val cards = line.substringAfter("[").substringBefore("]")
            val player = hand.players.find { it.name == name }
            if (player != null) {
                player.isHero = true
                player.cards = cards
            }
            return
        }
        
        // Actions look like: "riickyy777 posts small blind 15"
        // "riickyy777 calls 15"
        // "CG_Boss2336 bets 60"
        // "Nelfrot-YT raises 60 to 120"
        // "Nelfrot-YT folds"
        
        val player = hand.players.find { line.startsWith(it.name) } ?: return
        val action = line.substringAfter(player.name).trim().lowercase()
        
        val amountMatch = Regex("(\\d+)").find(action)
        val amount = amountMatch?.groupValues?.get(1)?.toDoubleOrNull() ?: 0.0
        
        when {
            action.contains("raises") && action.contains("to") -> {
                val totalTo = Regex("to (\\d+)").find(action)?.groupValues?.get(1)?.toDoubleOrNull() ?: amount
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
    
    private fun parseShowdownLine(line: String, hand: ParsedHand) {
        // riickyy777 shows [8h 7s] (Straight Queen high)
        if (line.contains("shows")) {
            val name = line.substringBefore(" shows").trim()
            val cards = line.substringAfter("[").substringBefore("]")
            hand.players.find { it.name == name }?.cards = cards
        }
    }
    
    private fun parseSummaryLine(line: String, hand: ParsedHand) {
        // Total pot 790 | No rake
        if (line.startsWith("Total pot ")) {
            hand.totalPot = Regex("Total pot (\\d+)").find(line)?.groupValues?.get(1)?.toDoubleOrNull() ?: 0.0
        }
        
        // Seat 1: riickyy777 (small blind) showed [8h 7s] and won 760 with Straight Queen high
        if (line.contains("won ")) {
            val nameMatch = Regex("Seat \\d+: (.+?) \\(").find(line)
            val name = nameMatch?.groupValues?.get(1) ?: line.substringAfter(": ").substringBefore(" ")
            val amountMatch = Regex("won (\\d+)").find(line)
            val amount = amountMatch?.groupValues?.get(1)?.toDoubleOrNull() ?: 0.0
            hand.players.find { it.name == name }?.winnings = amount
        }
    }
}
