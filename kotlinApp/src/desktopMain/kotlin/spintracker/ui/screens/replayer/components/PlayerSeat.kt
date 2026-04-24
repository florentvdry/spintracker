package spintracker.ui.screens.replayer.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import spintracker.ui.Primary400
import spintracker.ui.Dark400
import spintracker.ui.screens.replayer.models.ReplayerPlayer

@Composable
fun PlayerSeat(player: ReplayerPlayer) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Card(
            colors = CardDefaults.cardColors(containerColor = if (player.isHero) Color(0xFF1e3a5f) else Dark400),
            shape = RoundedCornerShape(8.dp),
            border = if (player.isHero) BorderStroke(2.dp, Primary400) else null
        ) {
            Column(modifier = Modifier.padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                androidx.compose.material3.Text(player.name, color = if (player.isHero) Primary400 else Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                androidx.compose.material3.Text("%.0f".format(player.currentStack), color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                if (player.holeCards.isNotEmpty()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                        player.holeCards.chunked(2).forEach { c ->
                            val isRed = c.contains("♥") || c.contains("♦")
                            androidx.compose.material3.Text(c, color = if (isRed) Color(0xFFef4444) else Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}
