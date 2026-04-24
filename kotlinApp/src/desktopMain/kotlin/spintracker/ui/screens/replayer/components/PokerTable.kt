package spintracker.ui.screens.replayer.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import spintracker.ui.Dark400
import spintracker.ui.screens.replayer.models.ReplayerPlayer

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
                        androidx.compose.material3.Text("POT", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp)
                        Spacer(modifier = Modifier.width(8.dp))
                        androidx.compose.material3.Text("%.0f".format(pot), color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
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
