package spintracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import spintracker.data.Database
import spintracker.models.AnalysisFilters
import spintracker.models.Player
import spintracker.models.RangeHandStats
import spintracker.ui.*
import spintracker.ui.components.range.RangeGrid
import spintracker.ui.components.range.SituationSelector
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

@Composable
fun RangeResearchScreen(
    heroName: String,
    dateRange: String,
    buyIn: String,
    onOpenReplayer: (String) -> Unit
) {
    val db = remember { Database() }
    val players = remember { db.getAllPlayers() }
    
    var localFilters by remember {
        mutableStateOf(AnalysisFilters(
            heroName = heroName.takeIf { it.isNotBlank() },
            situation = "Preflop",
            playerCount = 3
        ))
    }
    
    var opponentType by remember { mutableStateOf("all") }
    var rangeData by remember { mutableStateOf<Map<String, RangeHandStats>>(emptyMap()) }
    var rangeLoading by remember { mutableStateOf(false) }
    var selectedHand by remember { mutableStateOf<String?>(null) }
    var selectedStats by remember { mutableStateOf<RangeHandStats?>(null) }
    var selectedActionFilter by remember { mutableStateOf<String?>(null) }
    
    val dateFrom = if (dateRange == "all") null else "2024-01-01"
    val dateTo = if (dateRange == "all") null else LocalDateTime.now().toString()
    
    val combinedFilters = remember(localFilters, opponentType, dateFrom, dateTo) {
        localFilters.copy(
            dateFrom = dateFrom,
            dateTo = dateTo,
            opponentType = opponentType
        )
    }
    
    LaunchedEffect(combinedFilters) {
        rangeLoading = true
        selectedHand = null
        selectedStats = null
        try {
            rangeData = db.getRangeBreakdown(combinedFilters)
        } catch (e: Exception) {
            println("Error loading range data: ${e.message}")
        } finally {
            rangeLoading = false
        }
    }
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Dark400)
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        HeaderSection(
            onLoadPreset = { },
            onSaveConfig = { }
        )
        
        SituationSelector(
            filters = localFilters,
            players = players,
            onChange = { localFilters = it }
        )
        
        OpponentTypeSelector(
            selected = opponentType,
            onSelect = { opponentType = it }
        )
        
        Row(
            modifier = Modifier.fillMaxWidth().weight(1f),
            horizontalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            RangeMatrixSection(
                data = rangeData,
                loading = rangeLoading,
                selectedHand = selectedHand,
                onCellClick = { hand, stats ->
                    selectedHand = hand
                    selectedStats = stats
                    selectedActionFilter = null
                }
            )
            
            Column(
                modifier = Modifier.width(450.dp),
                verticalArrangement = Arrangement.spacedBy(24.dp)
            ) {
                SelectedHandStats(
                    hand = selectedHand,
                    stats = selectedStats,
                    actionFilter = selectedActionFilter,
                    onActionFilterChange = { selectedActionFilter = it }
                )
                
                HandHistoryList(
                    stats = selectedStats,
                    actionFilter = selectedActionFilter,
                    onHandClick = onOpenReplayer
                )
            }
        }
    }
}

@Composable
private fun HeaderSection(
    onLoadPreset: () -> Unit,
    onSaveConfig: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Dark300),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .background(Primary400.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                        .border(1.dp, Primary400.copy(alpha = 0.2f), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.Layers, null, tint = Primary400, modifier = Modifier.size(24.dp))
                }
                
                Column {
                    Text(
                        "Analyseur de Ranges",
                        color = Color.White,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        "Analysez les distributions de mains",
                        color = Color.Gray,
                        fontSize = 11.sp
                    )
                }
            }
            
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(
                    onClick = onLoadPreset,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.Gray),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Default.Upload, null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Charger", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
                
                Button(
                    onClick = onSaveConfig,
                    colors = ButtonDefaults.buttonColors(containerColor = Primary400),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Default.Save, null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Sauvegarder", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun OpponentTypeSelector(
    selected: String,
    onSelect: (String) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Dark300.copy(alpha = 0.5f)),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.People, null, tint = Color.Gray, modifier = Modifier.size(16.dp))
                Text(
                    "Type d'adversaire:",
                    color = Color.Gray,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OpponentTypeButton("all", "Tous", Icons.Default.People, selected, onSelect)
                OpponentTypeButton("reg", "Regs", Icons.Default.Star, selected, onSelect)
                OpponentTypeButton("fish", "Fish", Icons.Default.Favorite, selected, onSelect)
            }
        }
    }
}

@Composable
private fun OpponentTypeButton(
    type: String,
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    selected: String,
    onSelect: (String) -> Unit
) {
    val isSelected = selected == type
    Button(
        onClick = { onSelect(type) },
        colors = ButtonDefaults.buttonColors(
            containerColor = if (isSelected) Primary400 else Dark400
        ),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
        shape = RoundedCornerShape(8.dp)
    ) {
        Icon(icon, null, modifier = Modifier.size(14.dp))
        Spacer(modifier = Modifier.width(6.dp))
        Text(label, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun RowScope.RangeMatrixSection(
    data: Map<String, RangeHandStats>,
    loading: Boolean,
    selectedHand: String?,
    onCellClick: (String, RangeHandStats) -> Unit
) {
    Card(
        modifier = Modifier.weight(1f),
        colors = CardDefaults.cardColors(containerColor = Dark200),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Dark300.copy(alpha = 0.3f))
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Filter, null, tint = Primary400, modifier = Modifier.size(16.dp))
                    Text(
                        "Matrice de Range",
                        color = Color.White,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    ActionLegendItem("#EF4444", "2-3bb")
                    ActionLegendItem("#F97316", "4bb+")
                    ActionLegendItem("#FF9800", "Bet")
                    ActionLegendItem("#4CAF50", "Call")
                    ActionLegendItem("#9E9E9E", "Check")
                    ActionLegendItem("#B71C1C", "All-in")
                }
            }
            
            Box(modifier = Modifier.fillMaxSize().padding(24.dp)) {
                if (loading) {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(48.dp),
                            color = Primary400,
                            strokeWidth = 4.dp
                        )
                        Text(
                            "Chargement...",
                            color = Color.Gray,
                            fontSize = 14.sp
                        )
                    }
                } else {
                    Box(
                        modifier = Modifier.align(Alignment.Center),
                        contentAlignment = Alignment.Center
                    ) {
                        RangeGrid(
                            data = data,
                            size = "lg",
                            selectedHand = selectedHand,
                            onCellClick = onCellClick
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ActionLegendItem(color: String, label: String) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .background(Color(java.lang.Long.parseLong(color.removePrefix("#"), 16) or 0xFF000000), RoundedCornerShape(2.dp))
        )
        Text(label, color = Color.Gray, fontSize = 9.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun SelectedHandStats(
    hand: String?,
    stats: RangeHandStats?,
    actionFilter: String?,
    onActionFilterChange: (String?) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Dark200),
        shape = RoundedCornerShape(16.dp)
    ) {
        if (hand != null && stats != null) {
            Column(modifier = Modifier.padding(24.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Bottom
                ) {
                    Column {
                        Text(
                            "Main sélectionnée",
                            color = Primary400,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            hand,
                            color = Color.White,
                            fontSize = 48.sp,
                            fontWeight = FontWeight.Black,
                            lineHeight = 48.sp
                        )
                    }
                    
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            "Occurrences",
                            color = Color.Gray,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            stats.totalCount.toString(),
                            color = Color.White,
                            fontSize = 28.sp,
                            fontWeight = FontWeight.Black
                        )
                    }
                }
                
                Spacer(modifier = Modifier.height(20.dp))
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    StatBox(
                        label = "Profit Total",
                        value = "${stats.totalProfit.toInt()}",
                        suffix = "chips",
                        valueColor = if (stats.totalProfit >= 0) Color(0xFF22C55E) else Color(0xFFEF4444)
                    )
                    
                    StatBox(
                        label = "EV Realized",
                        value = String.format("%.1f", stats.totalEv),
                        suffix = "",
                        valueColor = if (stats.totalEv >= 0) Color(0xFFFBBF24) else Color(0xFFF97316)
                    )
                }
                
                Spacer(modifier = Modifier.height(20.dp))
                Divider(color = Color.White.copy(alpha = 0.05f))
                Spacer(modifier = Modifier.height(16.dp))
                
                Text(
                    "Distributions",
                    color = Color.Gray,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold
                )
                
                Spacer(modifier = Modifier.height(12.dp))
                
                ActionDistributionGrid(
                    actions = stats.actions,
                    totalCount = stats.totalCount,
                    selectedFilter = actionFilter,
                    onSelectFilter = onActionFilterChange
                )
            }
        } else {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(40.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(
                        Icons.Default.Info,
                        null,
                        tint = Color.White.copy(alpha = 0.2f),
                        modifier = Modifier.size(32.dp)
                    )
                    Text(
                        "Sélectionnez une main\ndans la matrice",
                        color = Color.Gray,
                        fontSize = 13.sp,
                        lineHeight = 18.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun RowScope.StatBox(
    label: String,
    value: String,
    suffix: String,
    valueColor: Color
) {
    Card(
        modifier = Modifier.weight(1f),
        colors = CardDefaults.cardColors(containerColor = Dark300.copy(alpha = 0.5f)),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                label,
                color = Color.Gray,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    value,
                    color = valueColor,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Black
                )
                if (suffix.isNotEmpty()) {
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        suffix,
                        color = Color.White.copy(alpha = 0.5f),
                        fontSize = 9.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun ActionDistributionGrid(
    actions: Map<String, Int>,
    totalCount: Int,
    selectedFilter: String?,
    onSelectFilter: (String?) -> Unit
) {
    val actionOrder = listOf("AllIn", "Raise4BB", "Raise2_3BB", "Raise", "Bet", "Call", "Check", "Fold", "None")
    val sortedActions = actions.filterKeys { it in actionOrder }.toSortedMap(compareBy { actionOrder.indexOf(it) })
    
    if (sortedActions.isEmpty()) {
        Text("Aucune donnée", color = Color.Gray, fontSize = 11.sp)
    } else {
        val actionList = sortedActions.toList()
        val chunkedActions = actionList.chunked((actionList.size + 1) / 2)

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            chunkedActions.forEach { rowActions ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    rowActions.forEach { (action, count) ->
                        val percent = if (totalCount > 0) (count * 100 / totalCount) else 0
                        val isSelected = selectedFilter == action
                        
                        val actionColor = when (action) {
                            "AllIn" -> Color(0xFFB71C1C)
                            "Raise4BB" -> Color(0xFFF97316)
                            "Raise2_3BB" -> Color(0xFFEF4444)
                            "Raise" -> Color(0xFFF44336)
                            "Bet" -> Color(0xFFFF9800)
                            "Call" -> Color(0xFF4CAF50)
                            "Check" -> Color(0xFF9E9E9E)
                            "Fold" -> Color(0xFF2196F3)
                            else -> Color(0xFF1E293B)
                        }
                        
                        Card(
                            modifier = Modifier
                                .weight(1f)
                                .clickable { onSelectFilter(if (isSelected) null else action) },
                            colors = CardDefaults.cardColors(
                                containerColor = if (isSelected) actionColor.copy(alpha = 0.4f) else actionColor.copy(alpha = 0.13f)
                            ),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Column(
                                modifier = Modifier.padding(10.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(
                                    action,
                                    color = Color.White.copy(alpha = 0.6f),
                                    fontSize = 8.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    "$percent%",
                                    color = Color.White,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Black
                                )
                                Text(
                                    "$count mains",
                                    color = Color.White.copy(alpha = 0.4f),
                                    fontSize = 9.sp
                                )
                            }
                        }
                    }
                    
                    if (rowActions.size < chunkedActions[0].size) {
                        repeat(chunkedActions[0].size - rowActions.size) {
                            Box(modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ColumnScope.HandHistoryList(
    stats: RangeHandStats?,
    actionFilter: String?,
    onHandClick: (String) -> Unit
) {
    Card(
        modifier = Modifier.weight(1f),
        colors = CardDefaults.cardColors(containerColor = Dark200),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Dark300.copy(alpha = 0.3f))
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.BarChart, null, tint = Primary400, modifier = Modifier.size(16.dp))
                    Text(
                        "Historique",
                        color = Color.White,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                
                TextButton(
                    onClick = { },
                    colors = ButtonDefaults.textButtonColors(contentColor = Primary400)
                ) {
                    Icon(Icons.Default.PlayArrow, null, modifier = Modifier.size(14.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Rejouer", fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }
            
            if (stats == null) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Icon(
                            Icons.Default.Layers,
                            null,
                            tint = Color.White.copy(alpha = 0.2f),
                            modifier = Modifier.size(48.dp)
                        )
                        Text(
                            "Sélectionnez une main\ndans la matrice",
                            color = Color.Gray,
                            fontSize = 13.sp,
                            lineHeight = 18.sp
                        )
                    }
                }
            } else {
                val filteredHands = if (actionFilter != null) {
                    stats.hands.filter { it.action.contains(actionFilter, ignoreCase = true) }
                } else {
                    stats.hands
                }
                
                if (filteredHands.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("Aucune main trouvée", color = Color.Gray, fontSize = 13.sp)
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        itemsIndexed(filteredHands) { idx, hand ->
                            HandHistoryItem(
                                index = idx,
                                hand = hand,
                                onClick = { onHandClick(hand.id) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HandHistoryItem(
    index: Int,
    hand: spintracker.models.RangeHandSummary,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = Dark400.copy(alpha = 0.5f)),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .background(Dark500, RoundedCornerShape(8.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    (index + 1).toString(),
                    color = Color.Gray,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        hand.action.uppercase(),
                        color = when (hand.action) {
                            "Raise", "AllIn" -> Color(0xFFEF4444)
                            "Call" -> Color(0xFF22C55E)
                            else -> Color(0xFF3B82F6)
                        },
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Black
                    )
                    
                    val dateStr = try {
                        hand.date.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
                    } catch (e: Exception) {
                        ""
                    }
                    Text(
                        dateStr,
                        color = Color.Gray.copy(alpha = 0.6f),
                        fontSize = 8.sp
                    )
                }
                
                Spacer(modifier = Modifier.height(4.dp))
                
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "${if (hand.profit >= 0) "+" else ""}${hand.profit.toInt()} chips",
                        color = if (hand.profit >= 0) Color(0xFF22C55E) else Color(0xFFEF4444),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                    
                    Box(
                        modifier = Modifier
                            .size(4.dp)
                            .background(Color.White.copy(alpha = 0.05f), RoundedCornerShape(2.dp))
                    )
                    
                    Text(
                        "EV: ${hand.ev?.let { String.format("%.1f", it) } ?: "—"}",
                        color = if ((hand.ev ?: 0.0) >= 0) Color(0xFFFBBF24).copy(alpha = 0.8f) else Color(0xFFF97316).copy(alpha = 0.8f),
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
            
            Icon(
                Icons.Default.ChevronRight,
                null,
                tint = Color.Gray,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}