package spintracker.ui.screens.replayer.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
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
import spintracker.ui.Dark400

@Composable
fun PlayingCard(card: String?) {
    val isRed = card?.let { it.contains("♥") || it.contains("♦") } ?: false
    Card(
        modifier = Modifier.size(50.dp, 70.dp),
        colors = CardDefaults.cardColors(containerColor = if (card != null) Color.White else Dark400),
        shape = RoundedCornerShape(4.dp),
        border = if (card != null) BorderStroke(2.dp, if (isRed) Color(0xFFef4444) else Color(0xFF374151)) else null
    ) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            if (card != null) {
                androidx.compose.material3.Text(card, color = if (isRed) Color(0xFFdc2626) else Color(0xFF1f2937), fontSize = 18.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}
