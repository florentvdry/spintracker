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
import spintracker.ui.*

@Composable
fun SettingsScreen(refreshKey: Int, heroName: String, onHeroNameChange: (String) -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text("Settings", style = MaterialTheme.typography.headlineMedium, color = Color.White)
        Text("Configure SpinTracker", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodySmall)
        Spacer(modifier = Modifier.height(24.dp))
        
        Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Database", color = Color.White, style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(16.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Server Status", color = Color.White)
                    Text("Active", color = SuccessGreen, style = MaterialTheme.typography.labelMedium)
                }
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("About", color = Color.White, style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(8.dp))
                Text("SpinTracker v1.0.0", color = Color.White)
            }
        }
    }
}