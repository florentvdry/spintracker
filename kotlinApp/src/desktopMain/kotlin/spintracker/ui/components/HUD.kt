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

data class HUDState(
    val visible: Boolean = false,
    val opacity: Float = 0.9f,
    val position: HUDPosition = HUDPosition.TOP_RIGHT
)

enum class HUDPosition { TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT }

@Composable
fun HUDOverlay(
    state: HUDState,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    if (!state.visible) return

    val alignment = when (state.position) {
        HUDPosition.TOP_LEFT -> Alignment.TopStart
        HUDPosition.TOP_RIGHT -> Alignment.TopEnd
        HUDPosition.BOTTOM_LEFT -> Alignment.BottomStart
        HUDPosition.BOTTOM_RIGHT -> Alignment.BottomEnd
    }

    val offset = when (state.position) {
        HUDPosition.TOP_LEFT -> androidx.compose.ui.unit.IntOffset(20, 20)
        HUDPosition.TOP_RIGHT -> androidx.compose.ui.unit.IntOffset(-20, 20)
        HUDPosition.BOTTOM_LEFT -> androidx.compose.ui.unit.IntOffset(20, -20)
        HUDPosition.BOTTOM_RIGHT -> androidx.compose.ui.unit.IntOffset(-20, -20)
    }

    Popup(
        alignment = alignment,
        offset = offset,
        properties = PopupProperties(focusable = false, dismissOnClickOutside = true)
    ) {
        Card(
            modifier = modifier
                .width(200.dp)
                .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(8.dp)),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1a1f2e).copy(alpha = state.opacity)),
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
                        "HUD",
                        color = Color.White.copy(alpha = 0.4f),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp
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
                
                Spacer(modifier = Modifier.height(8.dp))
                
                Text(
                    "Position: ${state.position.name}",
                    color = Color.White.copy(alpha = 0.7f),
                    fontSize = 12.sp
                )
            }
        }
    }
}