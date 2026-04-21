package spintracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.onPointerEvent
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import spintracker.data.AppState
import spintracker.ui.*
import spintracker.ui.components.StatsOverlay
import spintracker.models.PlayerStats

@OptIn(ExperimentalMaterial3Api::class, ExperimentalComposeUiApi::class)
@Composable
fun PlayersScreen(refreshKey: Int, heroName: String, dateRange: String, buyIn: String) {
    var searchQuery by remember { mutableStateOf("") }
    
    val players = remember(refreshKey, searchQuery) { 
        appState.getAllPlayers().filter { 
            it.name.contains(searchQuery, ignoreCase = true) 
        }
    }
    
    Column(modifier = Modifier.fillMaxSize()) {
        Text("Players", style = MaterialTheme.typography.headlineMedium, color = Color.White)
        Text("${players.size} players matches", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodySmall)
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Search bar
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Search player...", color = Color.White.copy(alpha = 0.3f)) },
            leadingIcon = { Icon(Icons.Default.Search, null, tint = Color.White.copy(alpha = 0.5f)) },
            trailingIcon = if (searchQuery.isNotEmpty()) {
                { IconButton(onClick = { searchQuery = "" }) { Icon(Icons.Default.Close, null, tint = Color.White) } }
            } else null,
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                focusedBorderColor = Primary400,
                unfocusedBorderColor = Color.White.copy(alpha = 0.1f),
                cursorColor = Primary400,
                focusedContainerColor = DarkSurface,
                unfocusedContainerColor = DarkSurface
            ),
            shape = RoundedCornerShape(8.dp),
            singleLine = true
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Card(modifier = Modifier.fillMaxSize(), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
            if (players.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(if (searchQuery.isEmpty()) "No players" else "No player matches '$searchQuery'", color = Color.White.copy(alpha = 0.5f))
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp)) {
                    // Header
                    item {
                        Row(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                            Text("Player", modifier = Modifier.weight(2f), color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.labelMedium)
                            Text("Hands", modifier = Modifier.weight(1f), color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.labelMedium)
                            Text("Profit", modifier = Modifier.weight(1f), color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.labelMedium)
                            Spacer(modifier = Modifier.width(48.dp)) // For action icon
                        }
                        Divider(color = Color.White.copy(alpha = 0.1f), modifier = Modifier.padding(bottom = 8.dp))
                    }
                    
                    items(players) { player ->
                        var isHovered by remember { mutableStateOf(false) }
                        var stats by remember { mutableStateOf<PlayerStats?>(null) }
                        
                        LaunchedEffect(isHovered) {
                            if (isHovered && stats == null) {
                                stats = appState.getPlayerStats(player.id)
                            }
                        }

                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .onPointerEvent(PointerEventType.Enter) { isHovered = true }
                                .onPointerEvent(PointerEventType.Exit) { isHovered = false }
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(2f)) {
                                    Text(player.name, color = Color.White, fontWeight = FontWeight.Bold)
                                    if (player.isReg) {
                                        Text("REGULAR", color = Primary400, style = MaterialTheme.typography.labelSmall)
                                    }
                                }
                                Text("${player.totalHands}", modifier = Modifier.weight(1f), color = Color.White)
                                Text("%.2f €".format(player.totalProfit), 
                                    modifier = Modifier.weight(1f), 
                                    color = if (player.totalProfit >= 0) Color(0xFF10b981) else Color(0xFFef4444),
                                    fontWeight = FontWeight.Bold
                                )
                                
                                IconButton(onClick = {
                                    appState.database.updatePlayerRegStatus(player.id, !player.isReg)
                                }) {
                                    Icon(
                                        if (player.isReg) Icons.Default.Star else Icons.Default.StarOutline,
                                        contentDescription = "Toggle reg",
                                        tint = if (player.isReg) Primary400 else Color.White.copy(alpha = 0.3f)
                                    )
                                }
                            }
                            
                            stats?.let {
                                StatsOverlay(stats = it, visible = isHovered)
                            }
                        }
                        Divider(color = Color.White.copy(alpha = 0.05f))
                    }
                }
            }
        }
    }
}