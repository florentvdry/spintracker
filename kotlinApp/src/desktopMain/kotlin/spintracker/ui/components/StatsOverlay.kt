package spintracker.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import spintracker.models.PlayerStats
import spintracker.ui.*

@Composable
fun StatsOverlay(stats: PlayerStats, visible: Boolean) {
    if (!visible) return

    Popup(
        alignment = Alignment.TopEnd,
        offset = androidx.compose.ui.unit.IntOffset(-20, 20),
        properties = PopupProperties(focusable = false, dismissOnClickOutside = true)
    ) {
        Card(
            modifier = Modifier
                .width(220.dp)
                .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(8.dp)),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1a1f2e).copy(alpha = 0.95f)),
            shape = RoundedCornerShape(8.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    "STATS",
                    color = Color.White.copy(alpha = 0.4f),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp
                )
                
                Spacer(modifier = Modifier.height(8.dp))
                
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    StatBox("VPIP", "%.1f".format(stats.vpip), Color(0xFF10b981))
                    StatBox("PFR", "%.1f".format(stats.pfr), Color(0xFFef4444))
                    StatBox("3BET", "%.1f".format(stats.threeBet), Color(0xFFf59e0b))
                }
                
                Spacer(modifier = Modifier.height(12.dp))
                Divider(color = Color.White.copy(alpha = 0.05f))
                Spacer(modifier = Modifier.height(8.dp))
                
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Hands", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp)
                    Text("${stats.handsPlayed}", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
                
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Profit", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp)
                    Text("%.2f €".format(stats.profit), 
                        color = if (stats.profit >= 0) Color(0xFF10b981) else Color(0xFFef4444), 
                        fontSize = 12.sp, 
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}

@Composable
private fun StatBox(label: String, value: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, color = Color.White.copy(alpha = 0.4f), fontSize = 10.sp)
        Text(value, color = color, fontSize = 16.sp, fontWeight = FontWeight.Black)
    }
}