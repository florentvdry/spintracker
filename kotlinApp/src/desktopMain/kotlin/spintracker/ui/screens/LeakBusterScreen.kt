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
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import spintracker.services.Leak
import spintracker.services.LeakDetectionService
import spintracker.ui.DarkSurface
import spintracker.ui.Primary400

@Composable
fun LeakBusterScreen(heroName: String) {
    var leaks by remember { mutableStateOf<List<Leak>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var hasEnoughData by remember { mutableStateOf(true) }

    LaunchedEffect(heroName) {
        isLoading = true
        try {
            val playerStats = appState.database.getPlayerStatsByName(heroName)
            if (playerStats != null && playerStats.totalHands >= 100) {
                leaks = LeakDetectionService.detectLeaks(playerStats.playerId, heroName, appState.database)
            } else {
                hasEnoughData = playerStats != null && playerStats.totalHands >= 100
                leaks = emptyList()
            }
        } catch (e: Exception) {
            println("Error detecting leaks: ${e.message}")
            leaks = emptyList()
        }
        isLoading = false
    }

    val gtoDeviationScore = remember(leaks) {
        if (leaks.isEmpty()) 0.0
        else leaks.sumOf { it.impact }
    }

    val sortedLeaks = remember(leaks) {
        leaks.sortedByDescending { it.impact }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("Leak Buster", style = MaterialTheme.typography.headlineLarge, color = Color.White)
                Text("Detect and fix your poker leaks", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodyMedium)
            }
        }
        Spacer(modifier = Modifier.height(24.dp))

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Card(modifier = Modifier.weight(1f), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Analytics, null, tint = Color(0xFFf59e0b), modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("GTO Deviation Score", style = MaterialTheme.typography.titleMedium, color = Color.White)
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    val deviationColor = when {
                        gtoDeviationScore < 10 -> Color(0xFF22c55e)
                        gtoDeviationScore < 30 -> Color(0xFFf59e0b)
                        else -> Color(0xFFef4444)
                    }
                    Text("%.1f bb".format(gtoDeviationScore), style = MaterialTheme.typography.headlineMedium, color = deviationColor)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        when {
                            gtoDeviationScore < 10 -> "Good - Minor adjustments needed"
                            gtoDeviationScore < 30 -> "Moderate - Some leaks to address"
                            else -> "Critical - Significant leaks detected"
                        },
                        color = Color.White.copy(alpha = 0.5f),
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
            Card(modifier = Modifier.weight(1f), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Warning, null, tint = Color(0xFFef4444), modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Leaks Detected", style = MaterialTheme.typography.titleMedium, color = Color.White)
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("${leaks.size}", style = MaterialTheme.typography.headlineMedium, color = Color.White)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        if (leaks.isEmpty()) "No significant leaks found"
                        else "Focus on highest impact items",
                        color = Color.White.copy(alpha = 0.5f),
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        if (isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Color.White)
            }
        } else if (!hasEnoughData) {
            Card(modifier = Modifier.fillMaxSize(), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
                Box(modifier = Modifier.fillMaxSize().padding(48.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.Info, null, tint = Color(0xFF3b82f6), modifier = Modifier.size(48.dp))
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("Need More Data", color = Color.White, style = MaterialTheme.typography.titleLarge)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "Import at least 100 hands to enable leak detection.",
                            color = Color.White.copy(alpha = 0.5f),
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
        } else if (leaks.isEmpty()) {
            Card(modifier = Modifier.fillMaxSize(), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
                Box(modifier = Modifier.fillMaxSize().padding(48.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.CheckCircle, null, tint = Color(0xFF22c55e), modifier = Modifier.size(48.dp))
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("No Leaks Detected", color = Color.White, style = MaterialTheme.typography.titleLarge)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "Keep up the good play! Your play looks solid.",
                            color = Color.White.copy(alpha = 0.5f),
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
        } else {
            Text("Recommendations", color = Color.White, style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(12.dp))

            LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(sortedLeaks) { leak ->
                    LeakCard(leak = leak)
                }
            }
        }
    }
}

@Composable
private fun LeakCard(leak: Leak) {
    var showApplyDialog by remember { mutableStateOf(false) }
    var isApplied by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = DarkSurface)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val typeColor = when {
                            leak.impact > 20 -> Color(0xFFef4444)
                            leak.impact > 10 -> Color(0xFFf59e0b)
                            else -> Color(0xFF22c55e)
                        }
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .background(typeColor, RoundedCornerShape(4.dp))
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(leak.type, color = Color.White, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(leak.description, color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.bodyMedium)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("-%.1f bb".format(leak.impact), style = MaterialTheme.typography.titleMedium, color = Color(0xFFef4444), fontWeight = FontWeight.Bold)
                    Text("estimated loss", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.labelSmall)
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Divider(color = Color.White.copy(alpha = 0.1f))
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Recommendation", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.labelSmall)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(leak.recommendation, color = Color.White, style = MaterialTheme.typography.bodyMedium)
                }
                Spacer(modifier = Modifier.width(16.dp))
                if (isApplied) {
                    TextButton(
                        onClick = { },
                        enabled = false,
                        colors = ButtonDefaults.textButtonColors(contentColor = Color(0xFF22c55e))
                    ) {
                        Icon(Icons.Default.Check, null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Applied")
                    }
                } else {
                    Button(
                        onClick = { showApplyDialog = true },
                        colors = ButtonDefaults.buttonColors(containerColor = Primary400)
                    ) {
                        Text("Apply Fix", color = Color.White, style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
    }

    if (showApplyDialog) {
        AlertDialog(
            onDismissRequest = { showApplyDialog = false },
            title = { Text("Apply Fix: ${leak.type}") },
            text = {
                Column {
                    Text("This will mark this leak as addressed in your notes.")
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Recommendation: ${leak.recommendation}", color = Color.White.copy(alpha = 0.7f))
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        isApplied = true
                        showApplyDialog = false
                    }
                ) {
                    Text("Mark as Applied")
                }
            },
            dismissButton = {
                TextButton(onClick = { showApplyDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}