package spintracker.models

import java.time.LocalDateTime

data class Hand(
    val id: Long = 0,
    val handId: String = "",
    val gameId: String = "",
    val tableName: String = "",
    val room: String = "",
    val dateTime: LocalDateTime = LocalDateTime.now(),
    val heroName: String = "",
    val heroPosition: Int = 0,
    val playerCount: Int = 2,
    val bigBlind: Double = 0.0,
    val handRank: Int = 0,
    val handType: String = "",
    val result: Double = 0.0,
    val ev: Double = 0.0,
    val wentToShowdown: Boolean = false,
    val rawContent: String = "",
    val tournamentId: Long? = null,
    val buyIn: Double = 0.0,
    val prizePool: Double = 0.0,
    val multiplier: Int = 1,
    val position: Int = 0
)

data class Player(
    val id: Long = 0,
    val name: String = "",
    val room: String = "",
    val isReg: Boolean = false,
    val isRegForced: Boolean = false,
    val totalHands: Int = 0,
    val totalProfit: Double = 0.0,
    val notes: String = ""
)

data class Tournament(
    val id: Long = 0,
    val gameId: String = "",
    val tournamentName: String = "",
    val buyIn: Double = 0.0,
    val fee: Double = 0.0,
    val currency: String = "EUR",
    val speed: String = "Fast",
    val maxPlayers: Int = 0,
    val playerCount: Int = 2,
    val result: Double = 0.0,
    val dateTime: LocalDateTime = LocalDateTime.now(),
    val place: Int? = null,
    val prize: Double? = null,
    val rake: Double = 0.0
)

data class PlayerHand(
    val id: Long = 0,
    val handId: Long = 0,
    val playerId: Long = 0,
    val playerName: String = "",
    val position: String = "",
    val stackSize: Double = 0.0,
    val isHero: Boolean = false,
    val holeCards: String? = null,
    val preflopAction: String? = null,
    val flopAction: String? = null,
    val turnAction: String? = null,
    val riverAction: String? = null,
    val showdownCards: String? = null,
    val finalHand: String? = null,
    val finalHandRank: Int? = null,
    val winnings: Double = 0.0,
    val netResult: Double = 0.0,
    val netWonAdjusted: Double = 0.0,
    val place: Int = 0,
    val wentToShowdown: Boolean = false
)

data class DashboardStats(
    val totalProfit: Double = 0.0,
    val totalHands: Int = 0,
    val totalTournaments: Int = 0,
    val tournamentsWon: Int = 0,
    val winRate: Double = 0.0,
    val totalEv: Double = 0.0,
    val avgChipsEv: Double = 0.0,
    val bigBlindsPer100: Double = 0.0,
    val chipsWonWithShowdown: Double = 0.0,
    val chipsWonWithoutShowdown: Double = 0.0,
    val cevByPosition: Map<String, Double> = emptyMap()
)

data class GraphPoint(
    val x: Int,
    val ev: Double,
    val profit: Double,
    val showdown: Double,
    val nonShowdown: Double
)

data class Session(
    val startTime: String,
    val endTime: String,
    val room: String,
    val tournaments: Int,
    val hands: Int,
    val profit: Double
)

data class PlayerStats(
    val vpip: Double = 0.0,
    val pfr: Double = 0.0,
    val threeBet: Double = 0.0,
    val cBet: Double = 0.0,
    val handsPlayed: Int = 0,
    val profit: Double = 0.0
)

data class RangeHandSummary(
    val id: String,
    val date: LocalDateTime,
    val profit: Double,
    val ev: Double?,
    val action: String
)

data class RangeHandStats(
    val hand: String = "",
    val totalCount: Int = 0,
    val totalProfit: Double = 0.0,
    val totalEv: Double = 0.0,
    val actions: Map<String, Int> = emptyMap(),
    val hands: List<RangeHandSummary> = emptyList()
)

data class AnalysisFilters(
    val heroName: String? = null,
    val situation: String? = null,
    val action: String? = null,
    val minStackBB: Double? = null,
    val maxStackBB: Double? = null,
    val positions: List<String>? = null,
    val playerCount: Int? = null,
    val actionSequence: List<String>? = null,
    val situationId: String? = null,
    val dateFrom: String? = null,
    val dateTo: String? = null,
    val opponentType: String? = null
)