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
    val tournamentId: Long? = null
)

data class Player(
    val id: Long = 0,
    val name: String = "",
    val room: String = "",
    val isReg: Boolean = false,
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
    val position: Int = 0,
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
    val netResult: Double = 0.0
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

data class PlayerStats(
    val vpip: Double = 0.0,
    val pfr: Double = 0.0,
    val threeBet: Double = 0.0,
    val cBet: Double = 0.0,
    val handsPlayed: Int = 0,
    val profit: Double = 0.0
)