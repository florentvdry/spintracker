package spintracker.ui.screens.replayer.models

data class ReplayerPlayer(
    val name: String,
    val position: String,
    val stackSize: Double,
    val holeCards: String,
    val isHero: Boolean,
    var currentStack: Double = stackSize,
    var isFolded: Boolean = false,
    var bet: Double = 0.0
)
