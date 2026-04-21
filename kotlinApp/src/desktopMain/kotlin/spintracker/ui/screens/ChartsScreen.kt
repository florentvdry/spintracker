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
import androidx.compose.ui.unit.dp
import spintracker.ui.*

@Composable
fun ChartsScreen(heroName: String, dateRange: String, buyIn: String) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text("Charts", style = MaterialTheme.typography.headlineMedium, color = Color.White)
        Text("View statistics", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodySmall)
        Spacer(modifier = Modifier.height(24.dp))
        Card(modifier = Modifier.fillMaxSize(), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Coming soon", color = Color.White.copy(alpha = 0.5f))
            }
        }
    }
}