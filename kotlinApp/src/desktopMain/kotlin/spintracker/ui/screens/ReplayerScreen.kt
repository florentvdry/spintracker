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
    
    var players by remember { mutableStateOf(rawPlayers.map { it.copy() }) }
    var pot by remember { mutableDoubleStateOf(0.0) }
    var board by remember { mutableStateOf(listOf<String>()) }
    var currentActionText by remember { mutableStateOf("Ready") }
    
    val actions = remember(handData) { emptyList<Map<String, Any?>>() }
    val maxIndex = actions.size
    
    DisposableEffect(Unit) {
        onDispose { timer?.cancel() }
    }
    
    fun resetState() {
        players = rawPlayers.map { it.copy(currentStack = it.stackSize, isFolded = false, bet = 0.0) }
        pot = 0.0
        board = emptyList()
        currentIndex = 0
        currentActionText = "Ready"
    }
    
    Surface(modifier = Modifier.fillMaxSize(), color = Dark500) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().background(Dark400).padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Hand #$handId", color = Primary400, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.width(16.dp))
                    handData?.let {
                        Text("${it["room"] ?: ""} - ${it["buyIn"] ?: 0}€", color = Color.White.copy(alpha = 0.6f), fontSize = 14.sp)
                    }
                }
                IconButton(onClick = onClose) {
                    Icon(Icons.Default.Close, null, tint = Color.White.copy(alpha = 0.6f))
                }
            }
            
            Box(modifier = Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                PokerTable(players = players, board = board, pot = pot)
            }
            
            Row(
                modifier = Modifier.fillMaxWidth().background(Dark400).padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                    Text("$currentIndex", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp)
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
                    Text(currentActionText, color = Primary400, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
                }
            }
        }
    }
}

@Composable
fun PokerTable(players: List<ReplayerPlayer>, board: List<String>, pot: Double) {
    Box(modifier = Modifier.aspectRatio(2f).padding(32.dp)) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clip(RoundedCornerShape(100.dp))
                .background(Color(0xFF07251a))
                .border(8.dp, Color(0xFF16191d), RoundedCornerShape(100.dp))
        ) {
            Row(modifier = Modifier.align(Alignment.Center), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                repeat(5) {
                    PlayingCard(card = if (it < board.size) board[it] else null)
                }
            }
            
            if (pot > 0) {
                Card(
                    modifier = Modifier.align(Alignment.Center).offset(y = 60.dp),
                    colors = CardDefaults.cardColors(containerColor = Dark400),
                    shape = RoundedCornerShape(20.dp)
                ) {
                    Row(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("POT", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("%.0f".format(pot), color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
            
            players.forEachIndexed { idx, player ->
                val (align, offsetX, offsetY) = when (idx) {
                    0 -> Triple(Alignment.BottomCenter, 0.dp, (-30).dp)
                    1 -> Triple(Alignment.CenterEnd, 30.dp, 0.dp)
                    2 -> Triple(Alignment.TopCenter, 0.dp, 30.dp)
                    else -> Triple(Alignment.Center, 0.dp, 0.dp)
                }
                Box(modifier = Modifier.align(align).offset(x = offsetX, y = offsetY)) {
                    PlayerSeat(player = player)
                }
            }
        }
    }
}

@Composable
fun PlayingCard(card: String?) {
    val isRed = card?.let { it.contains("♥") || it.contains("♦") } ?: false
    Card(
        modifier = Modifier.size(50.dp, 70.dp),
        colors = CardDefaults.cardColors(containerColor = if (card != null) Color.White else Dark400),
        shape = RoundedCornerShape(4.dp),
        border = if (card != null) androidx.compose.foundation.BorderStroke(2.dp, if (isRed) Color(0xFFef4444) else Color(0xFF374151)) else null
    ) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            if (card != null) {
                Text(card, color = if (isRed) Color(0xFFdc2626) else Color(0xFF1f2937), fontSize = 18.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
fun PlayerSeat(player: ReplayerPlayer) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Card(
            colors = CardDefaults.cardColors(containerColor = if (player.isHero) Color(0xFF1e3a5f) else Dark400),
            shape = RoundedCornerShape(8.dp),
            border = if (player.isHero) androidx.compose.foundation.BorderStroke(2.dp, Primary400) else null
        ) {
            Column(modifier = Modifier.padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(player.name, color = if (player.isHero) Primary400 else Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Text("%.0f".format(player.currentStack), color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                if (player.holeCards.isNotEmpty()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                        player.holeCards.chunked(2).forEach { c ->
                            val isRed = c.contains("♥") || c.contains("♦")
                            Text(c, color = if (isRed) Color(0xFFef4444) else Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}

data class ReplayerPlayer(
    val name: String,
    val position: String,
    val stackSize: Double,
    val holeCards: String,
    val isHero: Boolean,
    var currentStack: Double = stackSize,
    var isFolded: Boolean = false,
    var bet: Double = 0.0
)
