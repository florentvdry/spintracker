package spintracker.ui

import androidx.compose.foundation.background
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.io.File
import javax.swing.JFileChooser
import spintracker.data.AppState
import spintracker.models.DashboardStats
import spintracker.models.Hand
import spintracker.models.Player
import spintracker.ui.theme.SpinTrackerTheme

val Dark500 = Color(0xFF1a1f2e)
val Dark400 = Color(0xFF1e2433)
val Dark300 = Color(0xFF252b3d)
val Dark100 = Color(0xFF3d4555)
val Dark50 = Color(0xFF4a5568)
val Primary400 = Color(0xFF14b8a6)
val DarkSurface = Color(0xFF252b3d)

enum class NavScreen(val title: String, val icon: ImageVector) {
    Dashboard("Dashboard", Icons.Default.Dashboard),
    HandHistory("Hands", Icons.Default.History),
    Ranges("Ranges", Icons.Default.Grid3x3),
    Charts("Charts", Icons.Default.BarChart),
    Players("Players", Icons.Default.People),
    Settings("Settings", Icons.Default.Settings)
}

val appState = AppState()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SpinTrackerApp() {
    SpinTrackerTheme {
        var selectedScreen by remember { mutableStateOf(NavScreen.Dashboard) }
        var refreshKey by remember { mutableIntStateOf(0) }
        
        Row(modifier = Modifier.fillMaxSize().background(Dark500)) {
            Sidebar(selectedScreen) { selectedScreen = it }
            
            Column(modifier = Modifier.fillMaxSize()) {
                Header(selectedScreen)
                
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Dark500)
                        .padding(24.dp)
                ) {
                    when (selectedScreen) {
                        NavScreen.Dashboard -> DashboardScreen(refreshKey)
                        NavScreen.HandHistory -> HandHistoryScreen(refreshKey)
                        NavScreen.Ranges -> RangesScreen()
                        NavScreen.Charts -> ChartsScreen()
                        NavScreen.Players -> PlayersScreen(refreshKey)
                        NavScreen.Settings -> SettingsScreen(refreshKey)
                    }
                }
            }
        }
    }
}

@Composable
private fun Sidebar(selectedScreen: NavScreen, onScreenSelected: (NavScreen) -> Unit) {
    Column(
        modifier = Modifier
            .width(256.dp)
            .fillMaxHeight()
            .background(Dark400)
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("SpinTracker", style = MaterialTheme.typography.headlineSmall, color = Color.White)
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        NavScreen.entries.forEach { screen ->
            val isActive = selectedScreen == screen
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (isActive) Primary400.copy(alpha = 0.1f) else Color.Transparent)
                    .clickable { onScreenSelected(screen) }
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    screen.icon,
                    contentDescription = screen.title,
                    tint = if (isActive) Primary400 else Color.White.copy(alpha = 0.7f),
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    screen.title,
                    color = if (isActive) Primary400 else Color.White.copy(alpha = 0.7f),
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }
        
        Spacer(modifier = Modifier.weight(1f))
        
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(Color(0xFF5865F2).copy(alpha = 0.1f))
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Forum,
                contentDescription = "Discord",
                tint = Color(0xFF5865F2),
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text("Join Discord", color = Color(0xFF5865F2), style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun Header(screen: NavScreen) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Dark400)
            .padding(horizontal = 24.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            screen.title,
            style = MaterialTheme.typography.headlineMedium,
            color = Color.White
        )
        IconButton(onClick = { }) {
            Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Color.White)
        }
    }
}

@Composable
fun DashboardScreen(refreshKey: Int) {
    val stats by remember { mutableStateOf(appState.getDashboardStats()) }
    
    LaunchedEffect(refreshKey) {
        // Refreshtrigger
    }
    
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            StatCard(
                title = "Total Profit",
                value = "%.2f €".format(stats.totalProfit),
                modifier = Modifier.weight(1f),
                isPositive = stats.totalProfit >= 0
            )
            StatCard(
                title = "Activity",
                subStats = listOf(
                    "Tournaments" to stats.totalTournaments.toString(),
                    "Hands" to stats.totalHands.toString(),
                    "Avg Chips EV" to "%.1f".format(stats.avgChipsEv)
                ),
                modifier = Modifier.weight(1f)
            )
            StatCard(
                title = "Win Rate",
                value = "%.1f%%".format(stats.winRate),
                modifier = Modifier.weight(1f),
                isPositive = stats.winRate >= 0
            )
            StatCard(
                title = "CEV/Position",
                modifier = Modifier.weight(1f)
            )
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Card(
                modifier = Modifier.weight(2f).height(500.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Chip Evolution", color = Color.White, style = MaterialTheme.typography.titleMedium)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Profit / EV", color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.bodySmall)
                    if (stats.totalHands == 0) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text("No data - Import hands from Settings", color = Color.White.copy(alpha = 0.5f))
                        }
                    }
                }
            }
            
            Card(
                modifier = Modifier.weight(1f).height(500.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Recent Sessions", color = Color.White, style = MaterialTheme.typography.titleMedium)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Latest games", color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HandHistoryScreen(refreshKey: Int) {
    val hands by remember { mutableStateOf(appState.getHands(50)) }
    var resultFilter by remember { mutableStateOf("all") }
    
    val filteredHands = when (resultFilter) {
        "won" -> hands.filter { it.result > 0 }
        "lost" -> hands.filter { it.result < 0 }
        else -> hands
    }
    
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Result:", color = Color.White)
            listOf("all" to "All", "won" to "Won", "lost" to "Lost").forEach { (key, label) ->
                FilterChip(
                    selected = resultFilter == key,
                    onClick = { resultFilter = key },
                    label = { Text(label, color = if (resultFilter == key) Color.White else Color.White.copy(alpha = 0.7f)) },
                    colors = FilterChipDefaults.filterChipColors(
                        containerColor = DarkSurface,
                        selectedContainerColor = Primary400
                    )
                )
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                if (filteredHands.isEmpty()) {
                    Text("No hands imported", color = Color.White.copy(alpha = 0.5f))
                } else {
                    Text(
                        "${filteredHands.size} hands", 
                        color = Color.White.copy(alpha = 0.5f), 
                        style = MaterialTheme.typography.bodySmall
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    LazyColumn {
                        items(filteredHands.size) { index ->
                            HandRow(filteredHands[index])
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HandRow(hand: Hand) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(hand.handId.takeLast(20), color = Color.White, fontWeight = FontWeight.Medium)
            Text(hand.dateTime.toString().take(16), color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodySmall)
        }
        Text(
            "%.2f €".format(hand.result),
            color = if (hand.result >= 0) Color(0xFF10b981) else Color(0xFFef4444),
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
fun RangesScreen() {
    Column(modifier = Modifier.fillMaxSize()) {
        Text("Ranges", style = MaterialTheme.typography.headlineMedium, color = Color.White)
        Spacer(modifier = Modifier.height(16.dp))
        Card(
            modifier = Modifier.fillMaxSize(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface)
        ) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Range research in development", color = Color.White.copy(alpha = 0.5f))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChartsScreen() {
    var selectedPosition by remember { mutableStateOf("all") }
    var showProfit by remember { mutableStateOf(true) }
    var showEv by remember { mutableStateOf(true) }
    var showCev by remember { mutableStateOf(true) }
    
    val positions = listOf("all" to "All", "BTN" to "Button", "SB" to "Small Blind", "BB" to "Big Blind", "CO" to "Cutoff")
    
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Charts", style = MaterialTheme.typography.headlineMedium, color = Color.White)
                Text("View statistics by position", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodySmall)
            }
            
            Box {
                var expanded by remember { mutableStateOf(false) }
                OutlinedTextField(
                    value = positions.find { it.first == selectedPosition }?.second ?: "All",
                    onValueChange = {},
                    readOnly = true,
                    modifier = Modifier.clickable { expanded = true },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Primary400,
                        unfocusedBorderColor = Dark100
                    ),
                    trailingIcon = { Icon(Icons.Default.ArrowDropDown, null) }
                )
                DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                    positions.forEach { (value, label) ->
                        DropdownMenuItem(
                            text = { Text(label) },
                            onClick = { 
                                selectedPosition = value
                                expanded = false
                            }
                        )
                    }
                }
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            listOf(
                Triple("profit", "Profit", showProfit),
                Triple("ev", "EV", showEv),
                Triple("cev", "CEV", showCev)
            ).forEach { (key, label, _) ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = when (key) { "profit" -> showProfit; "ev" -> showEv; else -> showCev },
                        onCheckedChange = { when (key) { 
                            "profit" -> showProfit = it; "ev" -> showEv = it; else -> showCev = it 
                        }},
                        colors = CheckboxDefaults.colors(
                            checkedColor = when (key) { "profit" -> Color(0xFF10b981); "ev" -> Color(0xFF6366f1); else -> Color(0xFFf59e0b) }
                        )
                    )
                    Text(label, color = Color.White.copy(alpha = 0.7f))
                }
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Card(
            modifier = Modifier.fillMaxSize(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface)
        ) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Charts in development", color = Color.White.copy(alpha = 0.5f))
            }
        }
    }
}

@Composable
fun PlayersScreen(refreshKey: Int) {
    val players by remember { mutableStateOf(appState.getAllPlayers()) }
    
    Column(modifier = Modifier.fillMaxSize()) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                if (players.isEmpty()) {
                    Text("No players imported", color = Color.White.copy(alpha = 0.5f))
                } else {
                    LazyColumn {
                        items(players.size) { index ->
                            PlayerRow(players[index])
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PlayerRow(player: Player) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(player.name, color = Color.White, fontWeight = FontWeight.Medium)
            if (player.isReg) {
                Spacer(modifier = Modifier.width(8.dp))
                Text("Reg", color = Primary400, style = MaterialTheme.typography.labelSmall)
            }
        }
        IconButton(onClick = { 
            appState.database.updatePlayerRegStatus(player.id, !player.isReg)
        }) {
            Icon(
                if (player.isReg) Icons.Default.Star else Icons.Default.StarOutline,
                contentDescription = "Toggle reg",
                tint = if (player.isReg) Primary400 else Color.White.copy(alpha = 0.5f)
            )
        }
    }
}

@Composable
fun SettingsScreen(refreshKey: Int) {
    var showDeleteDialog by remember { mutableStateOf(false) }
    var textValue by remember { mutableStateOf(appState.heroName) }
    var importStatus by remember { mutableStateOf<String?>(null) }
    
    Column(modifier = Modifier.fillMaxSize()) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Hero Name", color = Color.White, style = MaterialTheme.typography.labelMedium)
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = textValue,
                    onValueChange = { newValue ->
                        textValue = newValue
                        appState.heroName = newValue
                    },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Primary400,
                        unfocusedBorderColor = Dark100
                    )
                )
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Button(
                onClick = {
                    try {
                        val chooser = JFileChooser()
                        chooser.fileSelectionMode = JFileChooser.FILES_ONLY
                        val result = chooser.showOpenDialog(null)
                        if (result == JFileChooser.APPROVE_OPTION) {
                            val file = chooser.selectedFile
                            if (file.extension == "txt") {
                                val imported = appState.importFile(file.absolutePath)
                                importStatus = "Imported $imported hands from ${file.name}"
                            } else {
                                importStatus = "Please select a .txt file"
                            }
                        }
                    } catch (e: Exception) {
                        importStatus = "Error: ${e.message}"
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = Primary400)
            ) {
                Icon(Icons.Default.Upload, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Import Hands")
            }
            
            Button(
                onClick = { showDeleteDialog = true },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFef4444))
            ) {
                Icon(Icons.Default.Delete, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Delete All Hands")
            }
        }
        
        importStatus?.let { status ->
            Spacer(modifier = Modifier.height(8.dp))
            Text(status, color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.bodySmall)
        }
        
        if (showDeleteDialog) {
            AlertDialog(
                onDismissRequest = { showDeleteDialog = false },
                title = { Text("Confirm Deletion") },
                text = { Text("This action is irreversible. All hands will be deleted.") },
                confirmButton = {
                    TextButton(onClick = { 
                        appState.deleteAllHands()
                        showDeleteDialog = false
                    }) {
                        Text("Delete", color = Color(0xFFef4444))
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showDeleteDialog = false }) {
                        Text("Cancel")
                    }
                }
            )
        }
    }
}

@Composable
fun StatCard(
    title: String,
    value: String? = null,
    subStats: List<Pair<String, String>>? = null,
    modifier: Modifier = Modifier,
    isPositive: Boolean? = null
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = DarkSurface)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.labelMedium)
            Spacer(modifier = Modifier.height(8.dp))
            if (value != null) {
                Text(
                    value,
                    style = MaterialTheme.typography.headlineSmall,
                    color = when (isPositive) {
                        true -> Color(0xFF10b981)
                        false -> Color(0xFFef4444)
                        null -> Color.White
                    }
                )
            }
            if (subStats != null) {
                subStats.forEach { (label, v) ->
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(label, color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodySmall)
                        Text(v, color = Color.White, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}