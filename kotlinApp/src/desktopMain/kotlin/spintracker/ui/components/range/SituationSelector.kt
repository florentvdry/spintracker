package spintracker.ui.components.range

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import spintracker.models.AnalysisFilters
import spintracker.models.Player
import spintracker.ui.*

data class SituationOption(
    val id: String,
    val situationId: String,
    val label: String,
    val sequence: List<String>,
    val positions: List<String>
)

@Composable
fun SituationSelector(
    filters: AnalysisFilters,
    players: List<Player>,
    onChange: (AnalysisFilters) -> Unit
) {
    var isDropdownOpen by remember { mutableStateOf(false) }
    var searchTerm by remember { mutableStateOf("") }
    var selectedPosition by remember { mutableStateOf(filters.positions?.firstOrNull() ?: "") }

    val positions = if (filters.playerCount == 2) {
        listOf("SB", "BB")
    } else {
        listOf("BTN", "SB", "BB")
    }

    val situations = getSituations(filters.playerCount ?: 3, selectedPosition)
    val currentSitId = filters.situationId ?: ""

    val filteredPlayers = remember(players, searchTerm) {
        if (searchTerm.isEmpty()) players
        else players.filter { it.name.contains(searchTerm, ignoreCase = true) }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Dark200),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    PlayerCountSelector(
                        selected = filters.playerCount ?: 3,
                        onSelect = { count ->
                            onChange(filters.copy(playerCount = count, positions = emptyList(), actionSequence = emptyList(), situationId = ""))
                            selectedPosition = ""
                        }
                    )

                    PlayerDropdown(
                        selectedPlayer = filters.heroName ?: "Population",
                        filteredPlayers = filteredPlayers,
                        isOpen = isDropdownOpen,
                        searchTerm = searchTerm,
                        onOpenChange = { isDropdownOpen = it },
                        onSearchChange = { searchTerm = it },
                        onSelect = { name ->
                            onChange(filters.copy(heroName = name.ifBlank { null }))
                            isDropdownOpen = false
                        }
                    )

                    StackDepthFilter(
                        minStack = filters.minStackBB,
                        maxStack = filters.maxStackBB,
                        onMinChange = { onChange(filters.copy(minStackBB = it)) },
                        onMaxChange = { onChange(filters.copy(maxStackBB = it)) }
                    )
                }

                TextButton(
                    onClick = {
                        selectedPosition = ""
                        onChange(AnalysisFilters(
                            heroName = filters.heroName,
                            playerCount = filters.playerCount,
                            minStackBB = null,
                            maxStackBB = null,
                            positions = emptyList(),
                            actionSequence = emptyList(),
                            situationId = ""
                        ))
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = Color.Gray)
                ) {
                    Icon(Icons.Default.Refresh, null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Reset", fontSize = 11.sp)
                }
            }

            Spacer(modifier = Modifier.height(20.dp))
            Divider(color = Color.White.copy(alpha = 0.05f))
            Spacer(modifier = Modifier.height(20.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(32.dp)) {
                PositionSelector(
                    positions = positions,
                    selectedPosition = selectedPosition,
                    onSelect = { pos ->
                        selectedPosition = pos
                        val firstSit = situations.firstOrNull()
                        if (firstSit != null) {
                            onChange(filters.copy(
                                positions = listOf(pos),
                                actionSequence = firstSit.sequence,
                                situationId = firstSit.situationId
                            ))
                        }
                    }
                )

                SituationGrid(
                    situations = situations,
                    currentSitId = currentSitId,
                    onSelect = { sit ->
                        onChange(filters.copy(
                            positions = sit.positions,
                            actionSequence = sit.sequence,
                            situationId = sit.situationId
                        ))
                    }
                )
            }
        }
    }
}

@Composable
private fun PlayerCountSelector(
    selected: Int,
    onSelect: (Int) -> Unit
) {
    Column {
        Text("Table Size", color = Color.Gray, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        Row(
            modifier = Modifier.background(Dark400, RoundedCornerShape(8.dp)).padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            listOf(2 to "Heads-Up", 3 to "3-Max").forEach { (count, label) ->
                Button(
                    onClick = { onSelect(count) },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (selected == count) Primary400 else Dark400
                    ),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Text(label, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun PlayerDropdown(
    selectedPlayer: String,
    filteredPlayers: List<Player>,
    isOpen: Boolean,
    searchTerm: String,
    onOpenChange: (Boolean) -> Unit,
    onSearchChange: (String) -> Unit,
    onSelect: (String) -> Unit
) {
    Box {
        Column {
            Text("Target Player", color = Color.Gray, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Row(
                modifier = Modifier
                    .background(Dark400, RoundedCornerShape(8.dp))
                    .border(1.dp, Color.White.copy(alpha = 0.05f), RoundedCornerShape(8.dp))
                    .clickable { onOpenChange(true) }
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Person, null, tint = Primary400, modifier = Modifier.size(16.dp))
                Text(
                    selectedPlayer,
                    color = Color.White,
                    fontSize = 12.sp,
                    modifier = Modifier.weight(1f)
                )
                Icon(
                    if (isOpen) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    null,
                    tint = Color.Gray,
                    modifier = Modifier.size(16.dp)
                )
            }
        }

        if (isOpen) {
            Card(
                modifier = Modifier
                    .width(280.dp)
                    .align(Alignment.TopStart)
                    .offset(y = 60.dp),
                colors = CardDefaults.cardColors(containerColor = Dark300),
                shape = RoundedCornerShape(12.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 16.dp)
            ) {
                Column {
                    TextField(
                        value = searchTerm,
                        onValueChange = onSearchChange,
                        placeholder = { Text("Search...", fontSize = 11.sp) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Dark400,
                            unfocusedContainerColor = Dark400,
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent
                        ),
                        shape = RoundedCornerShape(8.dp),
                        textStyle = androidx.compose.ui.text.TextStyle(fontSize = 12.sp)
                    )

                    Divider(color = Color.White.copy(alpha = 0.05f))

                    LazyColumn(modifier = Modifier.heightIn(max = 300.dp)) {
                        item {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onSelect("") }
                                    .padding(12.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(32.dp)
                                        .background(Primary400.copy(alpha = 0.1f), RoundedCornerShape(16.dp)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(Icons.Default.Layers, null, tint = Primary400, modifier = Modifier.size(16.dp))
                                }
                                Text("Population", color = if (selectedPlayer.isEmpty()) Primary400 else Color.Gray, fontSize = 13.sp)
                            }
                        }

                        items(filteredPlayers) { player ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onSelect(player.name) }
                                    .padding(12.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(32.dp)
                                        .background(Dark400, RoundedCornerShape(16.dp)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        player.name.take(2).uppercase(),
                                        color = Color.Gray,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Column {
                                    Text(player.name, color = Color.White, fontSize = 13.sp)
                                    Text(
                                        "${String.format("%,d", player.totalHands)} hands",
                                        color = Color.Gray,
                                        fontSize = 10.sp
                                    )
                                }
                            }
                        }
                    }
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.3f))
                    .clickable { onOpenChange(false) }
            )
        }
    }
}

@Composable
private fun StackDepthFilter(
    minStack: Double?,
    maxStack: Double?,
    onMinChange: (Double?) -> Unit,
    onMaxChange: (Double?) -> Unit
) {
    Column {
        Text("Stack Depth", color = Color.Gray, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        Row(
            modifier = Modifier
                .background(Dark400, RoundedCornerShape(8.dp))
                .border(1.dp, Color.White.copy(alpha = 0.05f), RoundedCornerShape(8.dp))
                .padding(horizontal = 12.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Layers, null, tint = Color.Gray, modifier = Modifier.size(16.dp))
            OutlinedTextField(
                value = minStack?.toInt()?.toString() ?: "",
                onValueChange = { onMinChange(it.toIntOrNull()?.toDouble()) },
                placeholder = { Text("Min", fontSize = 11.sp) },
                modifier = Modifier.width(60.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Color.Transparent,
                    unfocusedBorderColor = Color.Transparent
                ),
                shape = RoundedCornerShape(4.dp)
            )
            Text("to", color = Color.Gray, fontSize = 11.sp)
            OutlinedTextField(
                value = maxStack?.toInt()?.toString() ?: "",
                onValueChange = { onMaxChange(it.toIntOrNull()?.toDouble()) },
                placeholder = { Text("Max", fontSize = 11.sp) },
                modifier = Modifier.width(60.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Color.Transparent,
                    unfocusedBorderColor = Color.Transparent
                ),
                shape = RoundedCornerShape(4.dp)
            )
        }
    }
}

@Composable
private fun PositionSelector(
    positions: List<String>,
    selectedPosition: String,
    onSelect: (String) -> Unit
) {
    Column(modifier = Modifier.width(200.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .background(Primary400, RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text("1", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
            Text("Position", color = Color(0xFF9CA3AF), fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }

        Spacer(modifier = Modifier.height(12.dp))

        positions.forEach { pos ->
            val isSelected = selectedPosition == pos
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onSelect(pos) },
                colors = CardDefaults.cardColors(
                    containerColor = if (isSelected) Primary400.copy(alpha = 0.1f) else Dark400
                ),
                shape = RoundedCornerShape(12.dp)
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(pos, color = if (isSelected) Primary400 else Color.Gray, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        Text(
                            when (pos) {
                                "BTN" -> "Button / Dealer"
                                "SB" -> "Small Blind"
                                "BB" -> "Big Blind"
                                else -> pos
                            },
                            color = Color.Gray.copy(alpha = 0.6f),
                            fontSize = 9.sp
                        )
                    }
                    if (isSelected) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .background(Primary400, RoundedCornerShape(4.dp))
                        )
                    }
                }
            }
            if (pos != positions.last()) {
                Spacer(modifier = Modifier.height(8.dp))
            }
        }
    }
}

@Composable
private fun RowScope.SituationGrid(
    situations: List<SituationOption>,
    currentSitId: String,
    onSelect: (SituationOption) -> Unit
) {
    Column(modifier = Modifier.weight(1f)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .background(Primary400, RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text("2", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
            Text("Situation", color = Color(0xFF9CA3AF), fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }

        Spacer(modifier = Modifier.height(12.dp))

        if (situations.isEmpty()) {
            Text("Select a position first", color = Color.Gray, fontSize = 12.sp)
        } else {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                situations.forEach { sit ->
                    val isSelected = currentSitId == sit.situationId
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onSelect(sit) },
                        colors = CardDefaults.cardColors(
                            containerColor = if (isSelected) Color.White.copy(alpha = 0.05f) else Dark400
                        ),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    sit.label,
                                    color = if (isSelected) Primary400 else Color.White,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                if (isSelected) {
                                    Badge {
                                        Text("Active", fontSize = 7.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            if (sit.sequence.isEmpty()) {
                                Badge(
                                    containerColor = Color(0xFF10B981).copy(alpha = 0.1f),
                                    contentColor = Color(0xFF10B981)
                                ) {
                                    Text("First to Act", fontSize = 8.sp, fontWeight = FontWeight.Bold)
                                }
                            } else {
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    sit.sequence.forEachIndexed { i, step ->
                                        val parts = step.split(":")
                                        if (parts.size == 2) {
                                            Card(
                                                colors = CardDefaults.cardColors(containerColor = Dark500),
                                                shape = RoundedCornerShape(4.dp)
                                            ) {
                                                Row(
                                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Text(parts[0], color = Color.Gray, fontSize = 8.sp, fontWeight = FontWeight.Medium)
                                                    Text(
                                                        parts[1].uppercase(),
                                                        color = getActionColor(parts[1]),
                                                        fontSize = 8.sp,
                                                        fontWeight = FontWeight.Bold
                                                    )
                                                }
                                            }
                                            if (i < sit.sequence.lastIndex) {
                                                Text("→", color = Color.Gray, fontSize = 10.sp)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Badge(
    containerColor: Color = Color.White.copy(alpha = 0.1f),
    contentColor: Color = Color.White,
    content: @Composable RowScope.() -> Unit
) {
    Box(
        modifier = Modifier
            .background(containerColor, RoundedCornerShape(4.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
        contentAlignment = Alignment.Center
    ) {
        Row(content = content)
    }
}

private fun getActionColor(action: String): Color {
    return when (action.lowercase()) {
        "raise" -> Color(0xFFEF4444)
        "call" -> Color(0xFF22C55E)
        "fold" -> Color(0xFF3B82F6)
        else -> Color.Gray
    }
}

private fun Int.toLocaleString(): String {
    return this.toString().reversed().chunked(3).joinToString(",").reversed()
}

private fun getSituations(playerCount: Int, position: String): List<SituationOption> {
    return when (playerCount to position) {
        3 to "BTN" -> listOf(
            SituationOption("rfi", "rfi", "Open Raise (RFI)", emptyList(), listOf("BTN")),
            SituationOption("limp", "limp", "Limp", emptyList(), listOf("BTN"))
        )
        3 to "SB" -> listOf(
            SituationOption("sb_rfi", "sb_rfi", "SB Open (BTN Fold)", listOf("BTN:fold"), listOf("SB")),
            SituationOption("vs_btn_open", "vs_btn_open", "vs BTN Open", listOf("BTN:raise"), listOf("SB")),
            SituationOption("vs_btn_limp", "vs_btn_limp", "vs BTN Limp", listOf("BTN:call"), listOf("SB"))
        )
        3 to "BB" -> listOf(
            SituationOption("vs_btn_open_sb_fold", "vs_btn_open_sb_fold", "vs BTN (SB Fold)", listOf("BTN:raise", "SB:fold"), listOf("BB")),
            SituationOption("vs_sb_open", "vs_sb_open", "vs SB Open", listOf("BTN:fold", "SB:raise"), listOf("BB")),
            SituationOption("vs_btn_open_sb_call", "vs_btn_open_sb_call", "vs BTN (SB Call)", listOf("BTN:raise", "SB:call"), listOf("BB")),
            SituationOption("vs_sb_limp", "vs_sb_limp", "vs SB Limp", listOf("BTN:fold", "SB:call"), listOf("BB")),
            SituationOption("vs_btn_limp_sb_limp", "vs_btn_limp_sb_limp", "vs Multiway Limp", listOf("BTN:call", "SB:call"), listOf("BB")),
            SituationOption("vs_btn_limp_sb_fold", "vs_btn_limp_sb_fold", "vs BTN Limp (SB Fold)", listOf("BTN:call", "SB:fold"), listOf("BB"))
        )
        2 to "SB" -> listOf(
            SituationOption("hu_sb_rfi", "hu_sb_rfi", "HU SB Open", emptyList(), listOf("SB")),
            SituationOption("hu_sb_limp", "hu_sb_limp", "HU SB Limp", emptyList(), listOf("SB"))
        )
        2 to "BB" -> listOf(
            SituationOption("hu_vs_sb_open", "hu_vs_sb_open", "HU vs SB Open", listOf("SB:raise"), listOf("BB")),
            SituationOption("hu_vs_sb_limp", "hu_vs_sb_limp", "HU vs SB Limp", listOf("SB:call"), listOf("BB"))
        )
        else -> emptyList()
    }
}
