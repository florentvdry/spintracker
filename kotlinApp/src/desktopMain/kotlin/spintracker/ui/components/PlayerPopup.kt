package spintracker.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties

data class PlayerPopupState(
    val playerId: Long? = null,
    val playerName: String = "",
    val visible: Boolean = false,
    val vpip: Double = 0.0,
    val pfr: Double = 0.0,
    val totalHands: Int = 0,
    val notes: String = ""
)

@Composable
fun PlayerPopup(
    state: PlayerPopupState,
    onClose: () -> Unit,
    onPlayHand: (handId: String) -> Unit,
    modifier: Modifier = Modifier
) {
    if (!state.visible || state.playerId == null) return

    val alignment = Alignment.TopEnd
    val offset = androidx.compose.ui.unit.IntOffset(-20, 20)

    Popup(
        alignment = alignment,
        offset = offset,
        properties = PopupProperties(focusable = false, dismissOnClickOutside = true),
        onDismissRequest = onClose
    ) {
        Card(
            modifier = modifier.width(220.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1a1f2e)),
            shape = RoundedCornerShape(8.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        state.playerName,
                        color = Color.White,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        "×",
                        color = Color.White.copy(alpha = 0.5f),
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier
                            .clickable(onClick = onClose)
                            .padding(2.dp)
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    StatItem("VPIP", "${state.vpip}%")
                    StatItem("PFR", "${state.pfr}%")
                    StatItem("Hands", "${state.totalHands}")
                }

                if (state.notes.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        state.notes,
                        color = Color.White.copy(alpha = 0.6f),
                        fontSize = 11.sp,
                        maxLines = 2
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                Button(
                    onClick = { onPlayHand(state.playerId.toString()) },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("View Hands", fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun StatItem(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            value,
            color = Color.White,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold
        )
        Text(
            label,
            color = Color.White.copy(alpha = 0.5f),
            fontSize = 10.sp
        )
    }
}