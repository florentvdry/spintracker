package spintracker.models

data class LookupAction(
    val id: Int = 0,
    val action: String = "",
    val description: String = ""
)

data class LookupPosition(
    val id: Int = 0,
    val shortName: String = "",
    val fullName: String = "",
    val isBlind: Boolean = false,
    val isEpo: Boolean = false,
    val isMp: Boolean = false,
    val isCo: Boolean = false,
    val isBtn: Boolean = false
)

data class LookupHandRank(
    val id: Int = 0,
    val rankName: String = "",
    val category: Int = 0,
    val groupDetails: String = ""
)

data class LookupSite(
    val id: Int = 0,
    val abbrev: String = "",
    val name: String = ""
)
