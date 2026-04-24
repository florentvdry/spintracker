package spintracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.material3.LocalTextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import spintracker.data.AppState
import spintracker.ui.*
import spintracker.models.PlayerStats
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

fun parseColorHex(hex: String): Color {
    return try {
        val cleanHex = hex.trimStart('#')
        when (cleanHex.length) {
            6 -> { val r = cleanHex.substring(0, 2).toInt(16); val g = cleanHex.substring(2, 4).toInt(16); val b = cleanHex.substring(4, 6).toInt(16); Color(r, g, b) }
            8 -> { val r = cleanHex.substring(0, 2).toInt(16); val g = cleanHex.substring(2, 4).toInt(16); val b = cleanHex.substring(4, 6).toInt(16); val a = cleanHex.substring(6, 8).toInt(16); Color(r, g, b, a) }
            else -> Color.Gray
        }
    } catch (e: Exception) { Color.Gray }
}

val appState = AppState()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayersScreen(refreshKey: Int, heroName: String, dateRange: String, buyIn: String) {
    var searchQuery by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf("all") }
    var page by remember { mutableStateOf(1) }
    val pageSize = 50
    
    var selectedPlayer by remember { mutableStateOf<spintracker.models.Player?>(null) }
    var playerHands by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var handsLoading by remember { mutableStateOf(false) }
    var handsPage by remember { mutableStateOf(1) }
    var totalHandsCount by remember { mutableStateOf(0) }
    var expandedHands by remember { mutableStateOf<Set<Long>>(emptySet()) }
    
    val allPlayers = remember(refreshKey) { 
        appState.getAllPlayers()
    }
    
    val filteredPlayers = remember(allPlayers, searchQuery, filter) {
        allPlayers.filter { player ->
            val matchesSearch = player.name.contains(searchQuery, ignoreCase = true)
            val matchesFilter = when (filter) {
                "reg" -> player.isReg
                "fish" -> !player.isReg
                else -> true
            }
            matchesSearch && matchesFilter
        }
    }
    
    val paginatedPlayers = remember(filteredPlayers, page, pageSize) {
        val start = (page - 1) * pageSize
        val end = minOf(start + pageSize, filteredPlayers.size)
        if (start >= filteredPlayers.size) emptyList() else filteredPlayers.subList(start, end)
    }
    
    val totalPages = remember(filteredPlayers, pageSize) {
        (filteredPlayers.size + pageSize - 1) / pageSize
    }
    
    LaunchedEffect(selectedPlayer) {
        if (selectedPlayer != null) {
            handsLoading = true
            handsPage = 1
            expandedHands = emptySet()
            playerHands = appState.getHandsAgainstPlayer(selectedPlayer!!.name, heroName, 20, 1)
            totalHandsCount = appState.getCountHandsAgainstPlayer(selectedPlayer!!.name, heroName)
            handsLoading = false
        } else {
            playerHands = emptyList()
        }
    }
    
    Column(modifier = Modifier.fillMaxSize().padding(24.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Primary400.copy(alpha = 0.1f))
                        .border(1.dp, Primary400.copy(alpha = 0.2f), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.People, null, tint = Primary400, modifier = Modifier.size(24.dp))
                }
                Spacer(modifier = Modifier.width(16.dp))
                Column {
                    Text("Players", style = MaterialTheme.typography.headlineMedium, color = Color.White, fontWeight = FontWeight.Bold)
                    Text("Manage and view opponent statistics", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodySmall)
                }
            }
            
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("all" to "All", "reg" to "Regs", "fish" to "Fish").forEach { (value, label) ->
                    val isSelected = filter == value
                    Button(
                        onClick = { 
                            filter = value
                            page = 1
                        },
                        modifier = Modifier.height(36.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isSelected) Primary400 else Dark400,
                            contentColor = if (isSelected) Color.White else Color.White.copy(alpha = 0.7f)
                        ),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 16.dp)
                    ) {
                        if (value == "reg") {
                            Icon(Icons.Default.Star, null, modifier = Modifier.size(16.dp), tint = if (isSelected) Color.White else Color(0xFFfbbf24))
                            Spacer(modifier = Modifier.width(4.dp))
                        } else if (value == "fish") {
                            Icon(Icons.Default.Pets, null, modifier = Modifier.size(16.dp), tint = if (isSelected) Color.White else Color(0xFF60a5fa))
                            Spacer(modifier = Modifier.width(4.dp))
                        }
                        Text(label, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                    }
                }
                
                Spacer(modifier = Modifier.width(16.dp))
                
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { 
                        searchQuery = it
                        page = 1
                    },
                    modifier = Modifier.width(256.dp).height(40.dp),
                    placeholder = { Text("Search player...", color = Color.White.copy(alpha = 0.3f), fontSize = 13.sp) },
                    leadingIcon = { Icon(Icons.Default.Search, null, tint = Color.White.copy(alpha = 0.5f), modifier = Modifier.size(18.dp)) },
                    trailingIcon = if (searchQuery.isNotEmpty()) {
                        { IconButton(onClick = { searchQuery = ""; page = 1 }) { Icon(Icons.Default.Close, null, tint = Color.White, modifier = Modifier.size(18.dp)) } }
                    } else null,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = Primary400,
                        unfocusedBorderColor = Color.White.copy(alpha = 0.1f),
                        cursorColor = Primary400,
                        focusedContainerColor = Dark400,
                        unfocusedContainerColor = Dark400
                    ),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true,
                    textStyle = LocalTextStyle.current.copy(fontSize = 13.sp)
                )
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Card(
            modifier = Modifier.fillMaxSize(),
            colors = CardDefaults.cardColors(containerColor = Dark200),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                PlayersTableHeader()
                Divider(color = Color.White.copy(alpha = 0.05f))
                
                if (paginatedPlayers.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.People, null, tint = Color.White.copy(alpha = 0.2f), modifier = Modifier.size(64.dp))
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                if (searchQuery.isEmpty() && filter == "all") "No players" 
                                else "No players match your filters",
                                color = Color.White.copy(alpha = 0.5f),
                                fontSize = 14.sp
                            )
                        }
                    }
                } else {
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        items(paginatedPlayers) { player ->
                            PlayerRow(
                                player = player,
                                onUpdateReg = { appState.database.updatePlayerRegStatus(player.id, !player.isReg) }
                            )
                            Divider(color = Color.White.copy(alpha = 0.05f))
                        }
                    }
                }
                
                if (totalPages > 1) {
                    Divider(color = Color.White.copy(alpha = 0.05f))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Page $page / $totalPages", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            IconButton(
                                onClick = { page = maxOf(1, page - 1) },
                                enabled = page > 1,
                                modifier = Modifier
                                    .size(32.dp)
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(if (page > 1) Dark400 else Dark400.copy(alpha = 0.5f))
                            ) {
                                Icon(Icons.Default.ChevronLeft, null, tint = if (page > 1) Color.White else Color.White.copy(alpha = 0.3f), modifier = Modifier.size(18.dp))
                            }
                            IconButton(
                                onClick = { page = minOf(totalPages, page + 1) },
                                enabled = page < totalPages,
                                modifier = Modifier
                                    .size(32.dp)
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(if (page < totalPages) Dark400 else Dark400.copy(alpha = 0.5f))
                            ) {
                                Icon(Icons.Default.ChevronRight, null, tint = if (page < totalPages) Color.White else Color.White.copy(alpha = 0.3f), modifier = Modifier.size(18.dp))
                            }
                        }
                    }
                }
            }
        }
    }
    
    selectedPlayer?.let { player ->
        PlayerHandsModal(
            player = player,
            hands = playerHands,
            loading = handsLoading,
            totalHands = totalHandsCount,
            heroName = heroName,
            onClose = { selectedPlayer = null },
            onLoadMore = {
                handsPage++
                handsLoading = true
                val newHands = appState.getHandsAgainstPlayer(player.name, heroName, 20, handsPage)
                playerHands = playerHands + newHands
                handsLoading = false
            },
            onToggleExpand = { handId ->
                expandedHands = if (handId in expandedHands) {
                    expandedHands - handId
                } else {
                    expandedHands + handId
                }
            },
            expandedHands = expandedHands
        )
    }
}

@Composable
fun PlayersTableHeader() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Dark300.copy(alpha = 0.3f))
            .padding(horizontal = 24.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text("Player", color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(200.dp))
        Text("Hands", color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.End)
        Text("Profit", color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(120.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
        Text("Type", color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(140.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Text("Auto-detected", color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(120.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Text("Actions", color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(200.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
    }
}

@Composable
fun PlayerRow(player: spintracker.models.Player, onUpdateReg: () -> Unit) {
    var isUpdating by remember { mutableStateOf(false) }
    
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Dark200)
            .padding(horizontal = 24.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(modifier = Modifier.width(200.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Dark400),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    player.name.firstOrNull()?.uppercase() ?: "?",
                    color = Color.White.copy(alpha = 0.7f),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                player.name,
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1
            )
        }
        
        Text(
            player.totalHands.toString(),
            color = Color.White.copy(alpha = 0.7f),
            fontSize = 13.sp,
            modifier = Modifier.weight(1f),
            textAlign = androidx.compose.ui.text.style.TextAlign.End
        )
        
        Text(
            "%.0f".format(player.totalProfit),
            color = if (player.totalProfit >= 0) Color(0xFF10b981) else Color(0xFFef4444),
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.width(120.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.End
        )
        
        Box(modifier = Modifier.width(140.dp), contentAlignment = Alignment.Center) {
            Button(
                onClick = {
                    isUpdating = true
                    onUpdateReg()
                    isUpdating = false
                },
                enabled = !isUpdating,
                modifier = Modifier.height(28.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (player.isReg) Color(0xFFfbbf24).copy(alpha = 0.2f) else Color(0xFF60a5fa).copy(alpha = 0.2f),
                    contentColor = if (player.isReg) Color(0xFFfbbf24) else Color(0xFF60a5fa)
                ),
                shape = RoundedCornerShape(6.dp),
                contentPadding = PaddingValues(horizontal = 12.dp)
            ) {
                if (isUpdating) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(14.dp),
                        color = if (player.isReg) Color(0xFFfbbf24) else Color(0xFF60a5fa),
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(
                        if (player.isReg) Icons.Default.Star else Icons.Default.Pets,
                        null,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        if (player.isReg) "Reg" else "Fish",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
        
        Box(modifier = Modifier.width(120.dp), contentAlignment = Alignment.Center) {
            if (player.isRegForced) {
                Text("Manual", color = Color.White.copy(alpha = 0.4f), fontSize = 11.sp)
            } else if (player.totalHands >= 500) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(Icons.Default.Star, null, tint = Color(0xFF10b981), modifier = Modifier.size(12.dp))
                    Text("Auto", color = Color(0xFF10b981), fontSize = 11.sp, fontWeight = FontWeight.Medium)
                }
            } else {
                Text("-", color = Color.White.copy(alpha = 0.3f), fontSize = 11.sp)
            }
        }
        
        Row(
            modifier = Modifier.width(200.dp),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButton(
                onClick = { },
                enabled = false,
                colors = ButtonDefaults.textButtonColors(contentColor = Primary400)
            ) {
                Icon(Icons.Default.PlayArrow, null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Replay", fontSize = 11.sp, fontWeight = FontWeight.Medium)
            }
            Spacer(modifier = Modifier.width(8.dp))
            TextButton(
                onClick = { },
                enabled = false,
                colors = ButtonDefaults.textButtonColors(contentColor = Color.White.copy(alpha = 0.7f))
            ) {
                Icon(Icons.Default.StarOutline, null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    if (player.isReg) "Set Fish" else "Set Reg",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

@Composable
fun PlayerHandsModal(
    player: spintracker.models.Player,
    hands: List<Map<String, Any?>>,
    loading: Boolean,
    totalHands: Int,
    heroName: String,
    onClose: () -> Unit,
    onLoadMore: () -> Unit,
    onToggleExpand: (Long) -> Unit,
    expandedHands: Set<Long>
) {
    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(dismissOnBackPress = true, dismissOnClickOutside = true)
    ) {
        Card(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            colors = CardDefaults.cardColors(containerColor = Dark200),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Dark300.copy(alpha = 0.3f))
                        .padding(20.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(Primary400.copy(alpha = 0.1f))
                                .border(1.dp, Primary400.copy(alpha = 0.2f), RoundedCornerShape(10.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.People, null, tint = Primary400, modifier = Modifier.size(20.dp))
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                "Hands against ${player.name}",
                                color = Color.White,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                "$totalHands total hands • Hero: ${heroName.ifEmpty { "Not set" }}",
                                color = Color.White.copy(alpha = 0.5f),
                                fontSize = 11.sp
                            )
                        }
                    }
                    IconButton(
                        onClick = onClose,
                        modifier = Modifier
                            .size(32.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(Dark400)
                    ) {
                        Icon(Icons.Default.Close, null, tint = Color.White.copy(alpha = 0.7f), modifier = Modifier.size(18.dp))
                    }
                }
                
                Divider(color = Color.White.copy(alpha = 0.05f))
                
                if (loading && hands.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Primary400, strokeWidth = 2.dp)
                    }
                } else if (hands.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.People, null, tint = Color.White.copy(alpha = 0.2f), modifier = Modifier.size(48.dp))
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("No hands found", color = Color.White.copy(alpha = 0.5f), fontSize = 13.sp)
                        }
                    }
                } else {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                    ) {
                        HandsTableHeader()
                        hands.forEach { hand ->
                            val handId = hand["id"] as? Long ?: 0L
                            val isExpanded = handId in expandedHands
                            HandHistoryRow(
                                hand = hand,
                                isExpanded = isExpanded,
                                onToggleExpand = { onToggleExpand(handId) },
                                heroName = heroName
                            )
                        }
                        
                        if (hands.size < totalHands) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Button(
                                    onClick = onLoadMore,
                                    enabled = !loading,
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = Primary400,
                                        contentColor = Color.White
                                    ),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    if (loading) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(16.dp),
                                            color = Color.White,
                                            strokeWidth = 2.dp
                                        )
                                    } else {
                                        Text("Load more", fontSize = 13.sp, fontWeight = FontWeight.Medium)
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
fun HandsTableHeader() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Dark300.copy(alpha = 0.3f))
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            Icons.Default.ChevronRight,
            null,
            tint = Color.Transparent,
            modifier = Modifier.size(20.dp).width(32.dp)
        )
        Text("Date", color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(140.dp))
        Text("Cards", color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(100.dp))
        Text("Position", color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(100.dp))
        Text("Blinds", color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(80.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
        Text("CEV", color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(80.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
        Text("Result", color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(80.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
        Spacer(modifier = Modifier.width(40.dp))
    }
}

@Composable
fun HandHistoryRow(
    hand: Map<String, Any?>,
    isExpanded: Boolean,
    onToggleExpand: () -> Unit,
    heroName: String
) {
    val dateTime = hand["date_time"] as? String ?: ""
    val heroCards = hand["hero_cards"] as? String ?: ""
    val heroPosition = hand["hero_position"] as? String ?: ""
    val playerCount = hand["player_count"] as? Int ?: 2
    val blinds = hand["blinds"] as? Double ?: 0.0
    val evChips = hand["ev_chips"] as? Double ?: 0.0
    val heroProfit = hand["hero_profit"] as? Double ?: 0.0
    val wentToShowdown = hand["went_to_showdown"] as? Boolean ?: false
    val flop = hand["flop"] as? String ?: ""
    val turn = hand["turn"] as? String ?: ""
    val river = hand["river"] as? String ?: ""
    val room = hand["room"] as? String ?: ""
    val buyIn = hand["buy_in"] as? Double ?: 0.0
    
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(if (isExpanded) Dark300.copy(alpha = 0.5f) else Dark200)
                .clickable { onToggleExpand() }
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                if (isExpanded) Icons.Default.ExpandMore else Icons.Default.ChevronRight,
                null,
                tint = if (isExpanded) Primary400 else Color.White.copy(alpha = 0.3f),
                modifier = Modifier.size(20.dp).width(32.dp)
            )
            
            Column(modifier = Modifier.width(140.dp)) {
                val dateStr = try {
                    LocalDateTime.parse(dateTime.replace("T", " "), DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                        .format(DateTimeFormatter.ofPattern("MMM dd, yyyy"))
                } catch (e: Exception) {
                    dateTime.take(10)
                }
                val timeStr = try {
                    LocalDateTime.parse(dateTime.replace("T", " "), DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                        .format(DateTimeFormatter.ofPattern("HH:mm"))
                } catch (e: Exception) {
                    dateTime.drop(11).take(5)
                }
                Text(dateStr, color = Color.White.copy(alpha = 0.7f), fontSize = 12.sp)
                Text(timeStr, color = Color.White.copy(alpha = 0.4f), fontSize = 10.sp)
            }
            
            Text(
                heroCards.ifEmpty { "-" },
                color = Color.White.copy(alpha = 0.7f),
                fontSize = 12.sp,
                modifier = Modifier.width(100.dp)
            )
            
            Row(modifier = Modifier.width(100.dp), verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    color = when (heroPosition) {
                        "BB", "SB" -> Color(0xFFa855f7).copy(alpha = 0.2f)
                        "BTN" -> Color(0xFFf97316).copy(alpha = 0.2f)
                        else -> Dark400
                    },
                    shape = RoundedCornerShape(4.dp)
                ) {
                    Text(
                        heroPosition.ifEmpty { "?" },
                        color = when (heroPosition) {
                            "BB", "SB" -> Color(0xFFa855f7)
                            "BTN" -> Color(0xFFf97316)
                            else -> Color.White.copy(alpha = 0.5f)
                        },
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    "(${if (playerCount == 2) "HU" else "${playerCount}max"})",
                    color = Color.White.copy(alpha = 0.4f),
                    fontSize = 9.sp
                )
            }
            
            Text(
                "%.1f".format(blinds),
                color = Color.White.copy(alpha = 0.5f),
                fontSize = 11.sp,
                modifier = Modifier.width(80.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.End
            )
            
            Text(
                "%.1f".format(evChips),
                color = when {
                    evChips > 0 -> Color(0xFF10b981)
                    evChips < 0 -> Color(0xFFef4444)
                    else -> Color.White.copy(alpha = 0.5f)
                },
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.width(80.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.End
            )
            
            Text(
                "%+.0f".format(heroProfit),
                color = when {
                    heroProfit > 0 -> Color(0xFF10b981)
                    heroProfit < 0 -> Color(0xFFef4444)
                    else -> Color.White.copy(alpha = 0.5f)
                },
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.width(80.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.End
            )
            
            Spacer(modifier = Modifier.width(40.dp))
        }
        
        if (isExpanded) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Dark400.copy(alpha = 0.3f))
                    .padding(horizontal = 64.dp, vertical = 16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(24.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Room:", color = Color.White.copy(alpha = 0.4f), fontSize = 10.sp)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(room.uppercase(), color = Color.White.copy(alpha = 0.7f), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Buy-in:", color = Color.White.copy(alpha = 0.4f), fontSize = 10.sp)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("${buyIn}€", color = Color.White.copy(alpha = 0.7f), fontSize = 10.sp)
                    }
                    if (wentToShowdown) {
                        Surface(
                            color = Dark400,
                            shape = RoundedCornerShape(4.dp)
                        ) {
                            Text(
                                "SD",
                                color = Color.White.copy(alpha = 0.5f),
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }
                }
                
                if (flop.isNotEmpty() || turn.isNotEmpty() || river.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Board:", color = Color.White.copy(alpha = 0.4f), fontSize = 10.sp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            flop.split(" ").filter { it.isNotEmpty() }.forEach { card ->
                                CardBadge(card)
                            }
                            if (turn.isNotEmpty()) {
                                CardBadge(turn)
                            }
                            if (river.isNotEmpty()) {
                                CardBadge(river)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun CardBadge(card: String) {
    if (card.isBlank()) return
    val suit = card.lastOrNull()
    val rank = card.dropLast(1)
    val suitColor = when (suit) {
        's', 'S' -> Color(0xFF10b981)
        'h', 'H' -> Color(0xFFef4444)
        'd', 'D' -> Color(0xFF3b82f6)
        'c', 'C' -> Color.White.copy(alpha = 0.7f)
        else -> Color.White
    }
    
    Surface(
        color = Dark300,
        shape = RoundedCornerShape(4.dp),
        modifier = Modifier.size(28.dp)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                rank,
                color = suitColor,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}
