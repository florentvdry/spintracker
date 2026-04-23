package spintracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
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
import spintracker.ui.*
import spintracker.ui.components.RoomIcon

@Composable
fun HandHistoryScreen(refreshKey: Int, heroName: String, dateRange: String, buyIn: String) {
    val tournaments = remember(refreshKey, heroName, dateRange, buyIn) {
        appState.getTournaments(heroName)
    }
    
    var selectedTournament by remember { mutableStateOf<Map<String, Any?>?>(null) }
    var tournamentHands by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var isLoadingHands by remember { mutableStateOf(false) }
    
    LaunchedEffect(selectedTournament) {
        if (selectedTournament != null) {
            isLoadingHands = true
            val gameId = selectedTournament?.get("gameId") as? String ?: ""
            tournamentHands = appState.getHandsByGameId(gameId, heroName)
            isLoadingHands = false
        } else {
            tournamentHands = emptyList()
        }
    }
    
    Column(modifier = Modifier.fillMaxSize()) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("Tournaments", style = MaterialTheme.typography.headlineLarge, color = Color.White)
                Text("View your tournament history", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodyMedium)
            }
        }
        Spacer(modifier = Modifier.height(24.dp))
        
        Card(
            modifier = Modifier.fillMaxSize(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                TableHeader()
                Divider(color = Dark100)
                
                if (tournaments.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.History, null, tint = Color.White.copy(alpha = 0.3f), modifier = Modifier.size(64.dp))
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("Import hands to see tournaments", color = Color.White.copy(alpha = 0.5f))
                        }
                    }
                } else {
                    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                        tournaments.forEach { tournament ->
                            val isSelected = selectedTournament != null && 
                                            selectedTournament?.get("gameId") == tournament.get("gameId") &&
                                            selectedTournament?.get("dateTime") == tournament.get("dateTime")
                            
                            TournamentRow(
                                tournament = tournament,
                                isSelected = isSelected,
                                onSelect = { 
                                    selectedTournament = if (isSelected) null else tournament 
                                },
                                onReplay = { }
                            )
                            
                            if (isSelected) {
                                HandsExpansion(tournamentHands, isLoadingHands, heroName)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun TableHeader() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Dark400)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            Icons.Default.KeyboardArrowRight,
            null,
            tint = Color.Transparent,
            modifier = Modifier.size(20.dp).width(40.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        
        Text("Date", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp, modifier = Modifier.width(140.dp))
        Text("Room", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp, modifier = Modifier.width(100.dp))
        Text("Buy-in", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp, modifier = Modifier.width(80.dp))
        Text("Hands", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.End)
        Text("Avg CEV", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp, modifier = Modifier.width(100.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
        Text("Result", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp, modifier = Modifier.width(100.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
        Spacer(modifier = Modifier.width(40.dp))
    }
}

@Composable
fun TournamentRow(
    tournament: Map<String, Any?>,
    isSelected: Boolean,
    onSelect: () -> Unit,
    onReplay: () -> Unit
) {
    val dateTime = tournament.get("dateTime") as? String ?: ""
    val room = tournament.get("room") as? String ?: ""
    val buyIn = tournament.get("buyIn") as? Double ?: 0.0
    val handCount = tournament.get("handCount") as? Int ?: 0
    val avgCev = tournament.get("avgCev") as? Double ?: 0.0
    val netProfit = tournament.get("netProfit") as? Double ?: 0.0
    
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (isSelected) Color(0xFF1a1f2e) else DarkSurface)
            .clickable(onClick = onSelect)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            if (isSelected) Icons.Default.KeyboardArrowDown else Icons.Default.KeyboardArrowRight,
            null,
            tint = if (isSelected) Primary400 else Color.White.copy(alpha = 0.3f),
            modifier = Modifier.size(20.dp).width(40.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        
        Text(
            dateTime.replace("T", " ").substring(0, 16),
            color = Color.White.copy(alpha = 0.8f),
            fontSize = 13.sp,
            modifier = Modifier.width(140.dp)
        )
        
        Row(modifier = Modifier.width(100.dp), verticalAlignment = Alignment.CenterVertically) {
            RoomIcon(room, 14)
            Spacer(modifier = Modifier.width(6.dp))
            Text(room.uppercase(), color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        
        Text("${buyIn}€", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium, modifier = Modifier.width(80.dp))
        
        Text("$handCount", color = Color.White.copy(alpha = 0.5f), fontSize = 13.sp, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.End)
        
        Text(
            "%.1f".format(avgCev),
            color = when {
                avgCev > 0 -> Color(0xFF10b981)
                avgCev < 0 -> Color(0xFFef4444)
                else -> Color.White.copy(alpha = 0.5f)
            },
            fontSize = 13.sp,
            modifier = Modifier.width(100.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.End
        )
        
        Text(
            "%+.2f€".format(netProfit),
            color = if (netProfit >= 0) Color(0xFF10b981) else Color(0xFFef4444),
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.width(100.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.End
        )
        
        IconButton(
            onClick = onReplay,
            modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(Color.Transparent)
        ) {
            Icon(Icons.Default.PlayArrow, null, tint = Color.White.copy(alpha = 0.5f), modifier = Modifier.size(18.dp))
        }
    }
    
    Divider(color = Dark100, thickness = 1.dp)
}

@Composable
fun HandsExpansion(hands: List<Map<String, Any?>>, isLoading: Boolean, heroName: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF0d1117))
            .padding(start = 64.dp, end = 16.dp, top = 8.dp, bottom = 8.dp)
    ) {
        if (isLoading) {
            Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Primary400, strokeWidth = 2.dp)
            }
        } else if (hands.isEmpty()) {
            Text("No hands found", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp, modifier = Modifier.padding(16.dp))
        } else {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Spacer(modifier = Modifier.width(40.dp))
                Text("Time", color = Color.White.copy(alpha = 0.4f), fontSize = 11.sp, modifier = Modifier.width(140.dp))
                Text("Cards", color = Color.White.copy(alpha = 0.4f), fontSize = 11.sp, modifier = Modifier.width(100.dp))
                Text("Position", color = Color.White.copy(alpha = 0.4f), fontSize = 11.sp, modifier = Modifier.width(100.dp))
                Text("CEV", color = Color.White.copy(alpha = 0.4f), fontSize = 11.sp, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.End)
                Text("Result", color = Color.White.copy(alpha = 0.4f), fontSize = 11.sp, modifier = Modifier.width(100.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
                Spacer(modifier = Modifier.width(40.dp))
            }
            
            hands.forEach { hand ->
                HandRow(hand)
            }
        }
    }
}

@Composable
fun HandRow(hand: Map<String, Any?>) {
    val dateTime = hand.get("dateTime") as? String ?: ""
    val position = hand.get("heroPosition") as? String ?: ""
    val playerCount = hand.get("playerCount") as? Int ?: 0
    val ev = hand.get("ev") as? Double ?: 0.0
    val netResult = hand.get("netResult") as? Double ?: 0.0
    val heroCards = hand.get("heroCards") as? String ?: ""
    
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Spacer(modifier = Modifier.width(40.dp))
        
        Text(
            dateTime.replace("T", " ").substring(11, 19),
            color = Color.White.copy(alpha = 0.4f),
            fontSize = 11.sp,
            modifier = Modifier.width(140.dp)
        )
        
        Text(
            heroCards.ifEmpty { "—" },
            color = Color.White.copy(alpha = 0.7f),
            fontSize = 11.sp,
            modifier = Modifier.width(100.dp)
        )
        
        Row(modifier = Modifier.width(100.dp)) {
            Surface(
                color = Dark400,
                shape = RoundedCornerShape(4.dp)
            ) {
                Text(
                    "${position.ifEmpty { "?" }} (${if (playerCount == 2) "HU" else "3W"})",
                    color = Color.White.copy(alpha = 0.5f),
                    fontSize = 10.sp,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                )
            }
        }
        
        Text(
            "%.0f".format(ev),
            color = when {
                ev > 0 -> Color(0xFF10b981).copy(alpha = 0.8f)
                ev < 0 -> Color(0xFFef4444).copy(alpha = 0.8f)
                else -> Color.White.copy(alpha = 0.4f)
            },
            fontSize = 11.sp,
            modifier = Modifier.weight(1f),
            textAlign = androidx.compose.ui.text.style.TextAlign.End
        )
        
        Text(
            "%+.0f".format(netResult),
            color = when {
                netResult > 0 -> Color(0xFF10b981)
                netResult < 0 -> Color(0xFFef4444)
                else -> Color.White.copy(alpha = 0.4f)
            },
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.width(100.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.End
        )
        
        IconButton(
            onClick = { },
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(Color.Transparent)
        ) {
            Icon(Icons.Default.PlayArrow, null, tint = Color.White.copy(alpha = 0.3f), modifier = Modifier.size(14.dp))
        }
    }
    
    Divider(color = Dark100.copy(alpha = 0.3f), thickness = 1.dp)
}
