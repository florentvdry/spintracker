package spintracker.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Pets
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import spintracker.services.PlayerType

@Composable
fun PlayerBadge(type: PlayerType, modifier: Modifier = Modifier) {
    val (icon, color) = when (type) {
        PlayerType.FISH -> Icons.Default.Pets to Color.Gray
        PlayerType.REG -> Icons.Default.Person to Color(0xFF3b82f6)
        PlayerType.TAG -> Icons.Default.Star to Color.Cyan
        PlayerType.LAG -> Icons.Default.Star to Color(0xFFf97316)
        PlayerType.NIT -> Icons.Default.Lock to Color.Red
        PlayerType.WHALE -> Icons.Default.Star to Color(0xFF9333ea)
        PlayerType.MANIAC -> Icons.Default.Psychology to Color.Red
    }

    Box(
        modifier = modifier
            .size(24.dp)
            .background(color, CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = type.name,
            tint = Color.White,
            modifier = Modifier.size(14.dp)
        )
    }
}