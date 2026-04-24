package spintracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.rememberWindowState
import spintracker.ui.*
import spintracker.services.EquityService
import spintracker.ui.screens.replayer.components.*
import spintracker.ui.screens.replayer.models.ReplayerPlayer

@Composable
fun ReplayerWindow(handId: String, heroName: String, onClose: () -> Unit) {
    val windowState = rememberWindowState(width = 1100.dp, height = 750.dp)
    
    Window(
        onCloseRequest = onClose,
        title = "SpinTracker Replayer - Hand #$handId",
        state = windowState
    ) {
        ReplayerContent(handId, heroName, onClose)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReplayerContent(handId: String, heroName: String, onClose: () -> Unit) {
    val handData = remember(handId) { appState.database.getHandReplayData(handId, heroName) }
    
    var currentIndex by remember { mutableIntStateOf(0) }
    var isPlaying by remember { mutableStateOf(false) }
    var timer by remember { mutableStateOf<java.util.Timer?>(null) }
    
    val rawPlayers = remember(handData) {
        (handData?.get("players") as? List<*>)?.mapNotNull { p ->
            (p as? Map<String, Any?>)?.let { map ->
                ReplayerPlayer(
                    name = map["name"] as? String ?: "",
                    position = map["position"] as? String ?: "",
                    stackSize = (map["stackSize"] as? Number)?.toDouble() ?: 0.0,
                    holeCards = map["holeCards"] as? String ?: "",
                    isHero = map["isHero"] as? Boolean ?: false
                )
            }
        } ?: emptyList()
    }
    
    val equityService = remember { EquityService() }
    var currentEquity by remember { mutableStateOf<EquityService.EquityResult?>(null) }
    
    var players by remember { mutableStateOf(rawPlayers.map { it.copy() }) }
    var pot by remember { mutableDoubleStateOf(0.0) }
    var board by remember { mutableStateOf(listOf<String>()) }
    var currentActionText by remember { mutableStateOf("Ready") }
    
    val actions = remember(handData) { emptyList<Map<String, Any?>>() }
    val maxIndex = actions.size
    
    DisposableEffect(Unit) {
        onDispose { timer?.cancel() }
    }
    
    LaunchedEffect(board, rawPlayers) {
        val hero = rawPlayers.find { it.isHero }
        if (hero == null || hero.holeCards.isEmpty()) {
            currentEquity = null
        } else {
            val villains = rawPlayers.filter { !it.isHero && it.holeCards.isNotEmpty() }
            if (villains.isNotEmpty()) {
                val boardStr = board.joinToString("")
                val villainCards = villains.map { it.holeCards }
                currentEquity = equityService.calculateMultiwayEquity(
                    heroCards = hero.holeCards,
                    villainCardsList = villainCards,
                    board = boardStr
                )
            }
        }
    }
    
    fun resetState() {
        players = rawPlayers.map { it.copy(currentStack = it.stackSize, isFolded = false, bet = 0.0) }
        pot = 0.0
        board = emptyList()
        currentIndex = 0
        currentActionText = "Ready"
        currentEquity = null
    }
    
    Surface(modifier = Modifier.fillMaxSize(), color = Dark500) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().background(Dark400).padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.material3.Text("Hand #$handId", color = Primary400, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.width(16.dp))
                    handData?.let {
                        androidx.compose.material3.Text("${it["room"] ?: ""} - ${it["buyIn"] ?: 0}€", color = Color.White.copy(alpha = 0.6f), fontSize = 14.sp)
                    }
                }
                IconButton(onClick = onClose) {
                    Icon(Icons.Default.Close, null, tint = Color.White.copy(alpha = 0.6f))
                }
            }
            
            Box(modifier = Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                PokerTable(players = players, board = board, pot = pot)
                currentEquity?.let { equity ->
                    Box(
                        modifier = Modifier.align(Alignment.TopEnd).offset(x = (-20).dp, y = 20.dp)
                    ) {
                        EquityOverlay(equity = equity)
                    }
                }
            }
            
            Row(
                modifier = Modifier.fillMaxWidth().background(Dark400).padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.material3.Text("$currentIndex", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp)
                    Spacer(modifier = Modifier.width(8.dp))
                    Slider(
                        value = currentIndex.toFloat(),
                        onValueChange = { },
                        valueRange = 0f..(maxIndex.toFloat().coerceAtLeast(1f)),
                        modifier = Modifier.weight(1f),
                        colors = SliderDefaults.colors(thumbColor = Primary400, activeTrackColor = Primary400)
                    )
                }
                Spacer(modifier = Modifier.width(16.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    IconButton(onClick = { resetState() }) {
                        Icon(Icons.Default.Replay, null, tint = Color.White.copy(alpha = 0.6f))
                    }
                    IconButton(onClick = { if (currentIndex > 0) currentIndex-- }) {
                        Icon(Icons.Default.SkipPrevious, null, tint = Color.White.copy(alpha = 0.6f))
                    }
                    FilledIconButton(onClick = {
                        if (isPlaying) {
                            timer?.cancel()
                            isPlaying = false
                        } else {
                            isPlaying = true
                            timer = java.util.Timer().apply {
                                scheduleAtFixedRate(object : java.util.TimerTask() {
                                    override fun run() {
                                        if (currentIndex < maxIndex) currentIndex++
                                        else {
                                            cancel()
                                            isPlaying = false
                                        }
                                    }
                                }, 500, 800)
                            }
                        }
                    }) {
                        Icon(if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow, null, tint = Color.White)
                    }
                    IconButton(onClick = { if (currentIndex < maxIndex) currentIndex++ }) {
                        Icon(Icons.Default.SkipNext, null, tint = Color.White.copy(alpha = 0.6f))
                    }
                }
                Spacer(modifier = Modifier.width(16.dp))
                Card(colors = CardDefaults.cardColors(containerColor = DarkSurface), shape = RoundedCornerShape(8.dp)) {
                    androidx.compose.material3.Text(currentActionText, color = Primary400, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
                }
            }
        }
    }
}
