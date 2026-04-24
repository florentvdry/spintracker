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
import spintracker.ui.*
import spintracker.data.AppState
import spintracker.models.Hand

@Composable
fun SessionScreen(refreshKey: Int, heroName: String) {
    var sessionStartTime by remember { mutableStateOf<Long?>(null) }
    var isSessionActive by remember { mutableStateOf(false) }
    var handsPlayed by remember { mutableIntStateOf(0) }
    var sessionProfit by remember { mutableDoubleStateOf(0.0) }
    var currentHands by remember { mutableStateOf<List<Hand>>(emptyList()) }
    
    var stopLossLimit by remember { mutableDoubleStateOf(-50.0) }
    var winGoal by remember { mutableDoubleStateOf(50.0) }
    
    var showStopLossWarning by remember { mutableStateOf(false) }
    var showWinGoalReached by remember { mutableStateOf(false) }
    
    LaunchedEffect(refreshKey) {
        currentHands = appState.getHands(heroName, 100)
        val recentSession = appState.getRecentSessions(heroName, 1).firstOrNull()
        if (recentSession != null) {
            sessionStartTime = System.currentTimeMillis() - 3600000
            isSessionActive = true
            handsPlayed = recentSession.hands
            sessionProfit = recentSession.profit
        }
    }
    
    LaunchedEffect(sessionProfit) {
        if (isSessionActive) {
            if (sessionProfit <= stopLossLimit) {
                showStopLossWarning = true
            } else if (sessionProfit >= winGoal) {
                showWinGoalReached = true
            }
        }
    }
    
    val sessionDurationMinutes = remember(sessionStartTime) {
        if (sessionStartTime != null) {
            ((System.currentTimeMillis() - sessionStartTime!!) / 60000).toInt()
        } else 0
    }
    
    val hourlyRate = remember(sessionProfit, sessionDurationMinutes) {
        if (sessionDurationMinutes > 0) {
            (sessionProfit / sessionDurationMinutes) * 60
        } else 0.0
    }
    
    if (showStopLossWarning) {
        AlertDialog(
            onDismissRequest = { showStopLossWarning = false },
            title = { Text("Stop-Loss Reached") },
            text = { Text("You've reached your stop-loss limit of ${"%.2f €".format(stopLossLimit)}. Consider taking a break.") },
            confirmButton = {
                TextButton(onClick = { showStopLossWarning = false }) { Text("OK") }
            }
        )
    }
    
    if (showWinGoalReached) {
        AlertDialog(
            onDismissRequest = { showWinGoalReached = false },
            title = { Text("Win Goal Reached!") },
            text = { Text("Congratulations! You've reached your win goal of ${"%.2f €".format(winGoal)}.") },
            confirmButton = {
                TextButton(onClick = { showWinGoalReached = false }) { Text("Awesome!") }
            }
        )
    }
    
    Column(modifier = Modifier.fillMaxSize()) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("Session Tracker", style = MaterialTheme.typography.headlineLarge, color = Color.White)
                Text("Track your current session in real-time", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodyMedium)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (!isSessionActive) {
                    Button(
                        onClick = {
                            sessionStartTime = System.currentTimeMillis()
                            isSessionActive = true
                            handsPlayed = 0
                            sessionProfit = 0.0
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Primary400)
                    ) {
                        Icon(Icons.Default.PlayArrow, null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Start Session")
                    }
                } else {
                    Button(
                        onClick = {
                            isSessionActive = false
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFef4444))
                    ) {
                        Icon(Icons.Default.Stop, null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("End Session")
                    }
                }
            }
        }
        Spacer(modifier = Modifier.height(24.dp))
        
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Card(
                modifier = Modifier.weight(1f),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Timer, null, tint = Primary400, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Session Time", style = MaterialTheme.typography.titleMedium, color = Color.White)
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        if (isSessionActive) "${sessionDurationMinutes / 60}h ${sessionDurationMinutes % 60}m" else "--:--",
                        style = MaterialTheme.typography.headlineMedium,
                        color = Color.White
                    )
                }
            }
            
            Card(
                modifier = Modifier.weight(1f),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Speed, null, tint = Color(0xFF3b82f6), modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("€/hr", style = MaterialTheme.typography.titleMedium, color = Color.White)
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        "%.2f €".format(hourlyRate),
                        style = MaterialTheme.typography.headlineMedium,
                        color = if (hourlyRate >= 0) Color(0xFF10b981) else Color(0xFFef4444)
                    )
                }
            }
            
            Card(
                modifier = Modifier.weight(1f),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Casino, null, tint = Color(0xFFf59e0b), modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Hands", style = MaterialTheme.typography.titleMedium, color = Color.White)
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        "$handsPlayed",
                        style = MaterialTheme.typography.headlineMedium,
                        color = Color.White
                    )
                }
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        if (sessionProfit >= 0) Icons.Default.TrendingUp else Icons.Default.TrendingDown,
                        null,
                        tint = if (sessionProfit >= 0) Color(0xFF10b981) else Color(0xFFef4444),
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text("Session Profit/Loss", style = MaterialTheme.typography.titleLarge, color = Color.White)
                }
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    "%.2f €".format(sessionProfit),
                    style = MaterialTheme.typography.displaySmall,
                    color = if (sessionProfit >= 0) Color(0xFF10b981) else Color(0xFFef4444),
                    fontWeight = FontWeight.Bold
                )
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Text("Session Limits", style = MaterialTheme.typography.titleMedium, color = Color.White)
        Spacer(modifier = Modifier.height(8.dp))
        
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Card(
                modifier = Modifier.weight(1f),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.TrendingDown, null, tint = Color(0xFFef4444), modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Stop-Loss", color = Color.White.copy(alpha = 0.7f))
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = stopLossLimit.toString(),
                        onValueChange = { value -> stopLossLimit = value.toDoubleOrNull() ?: stopLossLimit },
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Color(0xFFef4444),
                            unfocusedTextColor = Color(0xFFef4444)
                        ),
                        singleLine = true
                    )
                }
            }
            
            Card(
                modifier = Modifier.weight(1f),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.TrendingUp, null, tint = Color(0xFF10b981), modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Win Goal", color = Color.White.copy(alpha = 0.7f))
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = winGoal.toString(),
                        onValueChange = { value -> winGoal = value.toDoubleOrNull() ?: winGoal },
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Color(0xFF10b981),
                            unfocusedTextColor = Color(0xFF10b981)
                        ),
                        singleLine = true
                    )
                }
            }
        }
    }
}