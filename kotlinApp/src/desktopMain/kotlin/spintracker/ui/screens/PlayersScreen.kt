package spintracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import spintracker.data.AppState
import spintracker.ui.*

@Composable
fun PlayersScreen(refreshKey: Int, heroName: String, dateRange: String, buyIn: String) {
    val appState = AppState()
    val players = appState.getAllPlayers()
    
    Column(modifier = Modifier.fillMaxSize()) {
        Text("Players", style = MaterialTheme.typography.headlineMedium, color = Color.White)
        Text("${players.size} players", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodySmall)
        Spacer(modifier = Modifier.height(24.dp))
        Card(modifier = Modifier.fillMaxSize(), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
            if (players.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("No players", color = Color.White.copy(alpha = 0.5f))
                }
            } else {
                Column(modifier = Modifier.padding(16.dp)) {
                    players.forEach { player ->
                        Row(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text(player.name, color = Color.White, fontWeight = FontWeight.Medium)
                            if (player.isReg) {
                                Text("Reg", color = Primary400, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
            }
        }
    }
}