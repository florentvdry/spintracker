package spintracker.ui.components.range

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import spintracker.models.RangeHandStats
import spintracker.ui.*

private val CARDS = listOf('A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2')

private val ACTION_COLORS = mapOf(
    "AllIn" to Color(0xFFB71C1C),
    "Raise4BB" to Color(0xFFF97316),
    "Raise2_3BB" to Color(0xFFEF4444),
    "Raise" to Color(0xFFF44336),
    "Bet" to Color(0xFFFF9800),
    "Call" to Color(0xFF4CAF50),
    "Check" to Color(0xFF9E9E9E),
    "Fold" to Color(0xFF2196F3),
    "None" to Color(0xFF1E293B)
)

data class CellSize(
    val width: Int,
    val height: Int,
    val fontSize: Int,
    val countFontSize: Int
)

@Composable
fun RangeGrid(
    data: Map<String, RangeHandStats>,
    size: String = "lg",
    onCellClick: (String, RangeHandStats) -> Unit,
    selectedHand: String? = null
) {
    val cellSize = when (size) {
        "sm" -> CellSize(24, 24, 8, 6)
        "md" -> CellSize(36, 36, 10, 8)
        else -> CellSize(48, 48, 12, 10)
    }

    val maxCount = remember(data) {
        data.values.maxOfOrNull { it.totalCount } ?: 1
    }

    Card(
        modifier = Modifier,
        colors = CardDefaults.cardColors(containerColor = Dark200),
        shape = RoundedCornerShape(8.dp)
    ) {
        Box(
            modifier = Modifier
                .padding(4.dp)
        ) {
            Column(
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                CARDS.forEach { card1 ->
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        CARDS.forEach { card2 ->
                            val hand = getHandName(card1, card2)
                            val stats = data[hand] ?: RangeHandStats(hand = hand)
                            
                            RangeCell(
                                hand = hand,
                                stats = stats,
                                size = cellSize,
                                maxCount = maxCount,
                                isSelected = selectedHand == hand,
                                onClick = { onCellClick(hand, stats) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RangeCell(
    hand: String,
    stats: RangeHandStats,
    size: CellSize,
    maxCount: Int,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val backgroundBrush = getCellBackground(stats, maxCount)
    val hasData = stats.totalCount > 0
    
    Box(
        modifier = Modifier
            .size(size.width.dp, size.height.dp)
            .background(
                brush = backgroundBrush,
                shape = RoundedCornerShape(4.dp)
            )
            .then(
                if (isSelected) {
                    Modifier.border(2.dp, Color.White, RoundedCornerShape(4.dp))
                } else {
                    Modifier.border(0.5.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(4.dp))
                }
            )
            .then(
                if (hasData) {
                    Modifier.clickable(onClick = onClick)
                } else {
                    Modifier
                }
            )
            .padding(2.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = hand.replace("s", "").replace("o", ""),
                color = if (hasData) Color.White else Color.Gray,
                fontSize = size.fontSize.sp,
                fontWeight = if (hasData) FontWeight.Medium else FontWeight.Normal
            )
            
            if (hasData && size != CellSize(24, 24, 8, 6)) {
                Text(
                    text = stats.totalCount.toString(),
                    color = Color.White.copy(alpha = 0.9f),
                    fontSize = size.countFontSize.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

private fun getCellBackground(stats: RangeHandStats, maxCount: Int): Brush {
    if (stats.totalCount == 0) {
        return SolidColor(Dark100)
    }

    val volumeOpacity = 0.3f + (0.7f * (stats.totalCount.toFloat() / maxCount.toFloat()))
    
    if (stats.actions.isEmpty()) {
        return SolidColor(ACTION_COLORS["None"]!!.copy(alpha = volumeOpacity))
    }

    val dominantAction = stats.actions.maxByOrNull { it.value }?.key
    if (dominantAction != null) {
        val dominantPercent = (stats.actions[dominantAction] ?: 0).toFloat() / stats.totalCount.toFloat()
        if (dominantPercent > 0.95f) {
            return SolidColor(ACTION_COLORS[dominantAction]!!.copy(alpha = volumeOpacity))
        }
    }

    val sortedActions = stats.actions.toSortedMap(compareBy { getActionOrder(it) })
    var currentPercent = 0f
    val stops = mutableListOf<Pair<Float, Color>>()
    
    sortedActions.forEach { (action, count) ->
        if (count > 0) {
            val percent = (count.toFloat() / stats.totalCount.toFloat())
            val color = ACTION_COLORS[action] ?: ACTION_COLORS["None"]!!
            stops.add(currentPercent to color.copy(alpha = volumeOpacity))
            stops.add((currentPercent + percent) to color.copy(alpha = volumeOpacity))
            currentPercent += percent
        }
    }

    if (stops.isEmpty()) {
        return SolidColor(Dark100)
    }

    return Brush.verticalGradient(
        colorStops = stops.map { it.first to it.second }.toTypedArray()
    )
}

private fun getActionOrder(action: String): Int {
    return when (action) {
        "AllIn" -> 0
        "Raise4BB" -> 1
        "Raise2_3BB" -> 2
        "Raise" -> 3
        "Bet" -> 4
        "Call" -> 5
        "Check" -> 6
        "Fold" -> 7
        else -> 8
    }
}

private fun getHandName(card1: Char, card2: Char): String {
    return when {
        card1 == card2 -> "$card1$card2"
        CARDS.indexOf(card1) < CARDS.indexOf(card2) -> "$card1${card2}s"
        else -> "$card2${card1}o"
    }
}
