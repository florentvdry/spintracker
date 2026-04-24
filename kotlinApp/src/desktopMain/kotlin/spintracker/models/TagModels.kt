package spintracker.models

data class Tag(
    val id: Long = 0,
    val name: String = "",
    val colorCode: String = "#808080",
    val playerCount: Int = 0
)

data class PlayerTag(
    val playerId: Long = 0,
    val tagId: Long = 0
)

data class Note(
    val id: Long = 0,
    val playerId: Long = 0,
    val playerName: String = "",
    val content: String = "",
    val colorCode: String = "#FFFFFF",
    val isAuto: Boolean = false,
    val createdAt: String = ""
)
