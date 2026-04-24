package spintracker.services

data class DatabaseInfo(
    val id: String,
    val name: String,
    val fileName: String,
    val filePath: String,
    val createdAt: String,
    val lastUsedAt: String,
    val isActive: Boolean,
    val handsCount: Int = 0
)
