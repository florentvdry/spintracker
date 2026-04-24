package spintracker.ui.screens.replayer.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
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
import spintracker.services.EquityService

@Composable
fun EquityOverlay(equity: EquityService.EquityResult) {
    val equityPercent = (equity.win * 100).toInt()
    val equityColor = when {
        equityPercent >= 70 -> Color(0xFF22c55e)
        equityPercent >= 50 -> Color(0xFFeab308)
        equityPercent >= 30 -> Color(0xFFf97316)
        else -> Color(0xFFef4444)
    }
    
    Card(
        colors = CardDefaults.cardColors(containerColor = Dark400),
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(2.dp, equityColor)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            androidx.compose.material3.Text("EQUITY", color = Color.White.copy(alpha = 0.5f), fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(4.dp))
            androidx.compose.material3.Text(
                "$equityPercent%",
                color = equityColor,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold
            )
            if (equity.tie > 0.01) {
                Spacer(modifier = Modifier.height(4.dp))
                androidx.compose.material3.Text("Tie: ${(equity.tie * 100).toInt()}%", color = Color.White.copy(alpha = 0.4f), fontSize = 10.sp)
            }
        }
    }
}
