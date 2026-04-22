package spintracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import spintracker.data.AppState
import spintracker.ui.*

@Composable
fun SettingsScreen(refreshKey: Int, heroName: String, onHeroNameChange: (String) -> Unit, onDataDeleted: () -> Unit = {}) {
    var showDeleteConfirm by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize()) {
        Text("Settings", style = MaterialTheme.typography.headlineMedium, color = Color.White)
        Text("Manage your preferences and database", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodySmall)
        
        Spacer(modifier = Modifier.height(32.dp))
        
        // General Section
        Text("DATABASE MANAGEMENT", color = Color.White.copy(alpha = 0.4f), style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp)
        Spacer(modifier = Modifier.height(16.dp))
        
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Clear Database", color = Color.White, fontWeight = FontWeight.Bold)
                        Text("Permanently delete all imported hands and statistics.", color = Color.White.copy(alpha = 0.5f), fontSize = 13.sp)
                    }
                    
                    Button(
                        onClick = { showDeleteConfirm = true },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFef4444).copy(alpha = 0.1f)),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFef4444).copy(alpha = 0.5f)),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Icon(Icons.Default.DeleteForever, null, tint = Color(0xFFef4444), modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Delete All Hands", color = Color(0xFFef4444), fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        
        if (showDeleteConfirm) {
            AlertDialog(
                onDismissRequest = { showDeleteConfirm = false },
                title = { Text("Are you absolutely sure?") },
                text = { Text("This action cannot be undone. All your hands, tournaments and calculated statistics will be lost forever.") },
                confirmButton = {
                    TextButton(
                        onClick = {
                            appState.deleteAllHands()
                            showDeleteConfirm = false
                            onDataDeleted()
                        },
                        colors = ButtonDefaults.textButtonColors(contentColor = Color(0xFFef4444))
                    ) {
                        Text("Yes, Delete Everything", fontWeight = FontWeight.Bold)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showDeleteConfirm = false }) {
                        Text("Cancel", color = Color.White)
                    }
                },
                containerColor = Dark400,
                titleContentColor = Color.White,
                textContentColor = Color.White.copy(alpha = 0.7f)
            )
        }
    }
}