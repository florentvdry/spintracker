package spintracker.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
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
import spintracker.ui.Dark400
import spintracker.ui.DiscordBlue
import spintracker.ui.Primary400

enum class NavScreen(val title: String, val icon: ImageVector, val route: String) {
    Dashboard("Dashboard", Icons.Default.Dashboard, "/"),
    Tournaments("Tournaments", Icons.Default.History, "/tournaments"),
    RangeResearch("Ranges", Icons.Default.Grid3x3, "/ranges"),
    Charts("Charts", Icons.Default.BarChart, "/charts"),
    Players("Players", Icons.Default.People, "/players"),
    Settings("Settings", Icons.Default.Settings, "/settings")
}

@Composable
fun Sidebar(selectedScreen: NavScreen, onScreenSelected: (NavScreen) -> Unit) {
    Column(modifier = Modifier.width(256.dp).fillMaxHeight().background(Dark400)) {
        Column(modifier = Modifier.fillMaxWidth().padding(24.dp)) {
            Text("SpinTracker", style = MaterialTheme.typography.headlineSmall, color = Color.White, fontWeight = FontWeight.Bold)
        }
        Divider(color = Color.White.copy(alpha = 0.1f))
        Column(modifier = Modifier.fillMaxWidth().weight(1f).padding(12.dp)) {
            NavScreen.entries.forEach { screen ->
                val isActive = selectedScreen == screen
                Row(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(if (isActive) Primary400.copy(alpha = 0.1f) else Color.Transparent).clickable { onScreenSelected(screen) }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(screen.icon, screen.title, tint = if (isActive) Primary400 else Color.White.copy(alpha = 0.7f), modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(screen.title, color = if (isActive) Primary400 else Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        Divider(color = Color.White.copy(alpha = 0.1f))
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.Center) {
            IconButton(onClick = { }) { Icon(Icons.Default.Forum, "Discord", tint = DiscordBlue, modifier = Modifier.size(24.dp)) }
        }
    }
}