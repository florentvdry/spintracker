package spintracker.ui.screens

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import spintracker.data.Database
import spintracker.ui.*

enum class ChartPosition(val label: String, val dbFilter: String) {
    ALL("All Positions", ""),
    HU_SB("HU SB", "AND ph.position = 'SB' AND h.player_count = 2"),
    HU_BB("HU BB", "AND ph.position = 'BB' AND h.player_count = 2"),
    THREE_WAY_BTN("3W BTN", "AND ph.position = 'BTN' AND h.player_count = 3"),
    THREE_WAY_SB("3W SB", "AND ph.position = 'SB' AND h.player_count = 3"),
    THREE_WAY_BB("3W BB", "AND ph.position = 'BB' AND h.player_count = 3")
}

enum class ChartLine(val label: String, val color: Color) {
    CHIPS_WON("Chips Won", SuccessGreen),
    NET_EXPECTED("EV Chips", WarningYellow),
    WON_WITH_SHOWDOWN("Showdown Won", InfoBlue),
    WON_WITHOUT_SHOWDOWN("Non-Showdown Won", ErrorRed)
}

data class ChartDataPoint(
    val label: String,
    val chipsWon: Double,
    val netExpected: Double,
    val wonWithShowdown: Double,
    val wonWithoutShowdown: Double
)

@Composable
fun ChartsScreen(
    heroName: String,
    dateRange: String,
    buyIn: String,
    db: Database
) {
    var chartPosition by remember { mutableStateOf(ChartPosition.ALL) }
    var visibleLines by remember {
        mutableStateOf(
            mapOf(
                ChartLine.CHIPS_WON to true,
                ChartLine.NET_EXPECTED to true,
                ChartLine.WON_WITH_SHOWDOWN to true,
                ChartLine.WON_WITHOUT_SHOWDOWN to true
            )
        )
    }
    
    var data by remember { mutableStateOf<List<ChartDataPoint>>(emptyList()) }
    var stats by remember { mutableStateOf<spintracker.models.DashboardStats?>(null) }
    var globalStats by remember { mutableStateOf<spintracker.models.DashboardStats?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    
    var boxPosition by remember { mutableStateOf(Offset(80f, 280f)) }
    var isDragging by remember { mutableStateOf(false) }
    var dragOffset by remember { mutableStateOf(Offset.Zero) }
    
    val positions = ChartPosition.values().toList()
    
    LaunchedEffect(heroName, dateRange, buyIn, chartPosition) {
        isLoading = true
        try {
            val chartData = db.getWinrateChartData(heroName, chartPosition)
            data = chartData
            
            val positionParam = if (chartPosition == ChartPosition.ALL) null else chartPosition.name
            stats = db.getDashboardStatsWithPosition(heroName, positionParam)
            globalStats = db.getDashboardStatsWithPosition(heroName, null)
        } finally {
            isLoading = false
        }
    }
    
    val finalStats = if (chartPosition == ChartPosition.ALL) globalStats else stats
    
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Charts", style = MaterialTheme.typography.headlineMedium, color = Color.White)
                Text("View statistics", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodySmall)
            }
            
            Box {
                var expanded by remember { mutableStateOf(false) }
                OutlinedButton(
                    onClick = { expanded = true },
                    colors = ButtonDefaults.outlinedButtonColors(
                        containerColor = Dark400,
                        contentColor = Color.White
                    ),
                    border = BorderStroke(1.dp, Dark200)
                ) {
                    Text(chartPosition.label)
                }
                DropdownMenu(
                    expanded = expanded,
                    onDismissRequest = { expanded = false },
                    modifier = Modifier.background(Dark400)
                ) {
                    positions.forEach { pos ->
                        DropdownMenuItem(
                            text = { Text(pos.label, color = Color.White) },
                            onClick = {
                                chartPosition = pos
                                expanded = false
                            }
                        )
                    }
                }
            }
        }
        
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            ChartLine.values().forEach { line ->
                val isVisible = visibleLines[line] == true
                Row(
                    modifier = Modifier
                        .clickable {
                            visibleLines = visibleLines + (line to !isVisible)
                        }
                        .alpha(if (isVisible) 1f else 0.4f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .background(line.color, RoundedCornerShape(5.dp))
                    )
                    Text(line.label, color = Color.White.copy(alpha = 0.7f), fontSize = 12.sp)
                }
            }
        }
        
        Card(
            modifier = Modifier.fillMaxSize(),
            colors = CardDefaults.cardColors(
                containerColor = DarkSurface
            ),
            shape = RoundedCornerShape(16.dp)
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                when {
                    isLoading -> {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = Primary400)
                        }
                    }
                    heroName.isEmpty() -> {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(
                                    Icons.Default.BarChart,
                                    null,
                                    modifier = Modifier.size(64.dp),
                                    tint = Color.White.copy(alpha = 0.3f)
                                )
                                Spacer(modifier = Modifier.height(16.dp))
                                Text("No hero selected", color = Color.White.copy(alpha = 0.5f))
                            }
                        }
                    }
                    data.isEmpty() -> {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(
                                    Icons.Default.BarChart,
                                    null,
                                    modifier = Modifier.size(64.dp),
                                    tint = Color.White.copy(alpha = 0.3f)
                                )
                                Spacer(modifier = Modifier.height(16.dp))
                                Text("No data available", color = Color.White.copy(alpha = 0.5f))
                            }
                        }
                    }
                    else -> {
                        LineChart(
                            data = data,
                            visibleLines = visibleLines,
                            boxPosition = boxPosition,
                            finalStats = finalStats,
                            globalStats = globalStats,
                            chartPosition = chartPosition,
                            onDragStart = { offset ->
                                isDragging = true
                                dragOffset = offset - boxPosition
                            },
                            onDrag = { offset ->
                                if (isDragging) {
                                    boxPosition = offset - dragOffset
                                }
                            },
                            onDragEnd = {
                                isDragging = false
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LineChart(
    data: List<ChartDataPoint>,
    visibleLines: Map<ChartLine, Boolean>,
    boxPosition: Offset,
    finalStats: spintracker.models.DashboardStats?,
    globalStats: spintracker.models.DashboardStats?,
    chartPosition: ChartPosition,
    onDragStart: (Offset) -> Unit,
    onDrag: (Offset) -> Unit,
    onDragEnd: () -> Unit
) {
    if (data.isEmpty()) return
    
    val padding = 60.dp
    
    val maxValue = data.maxOfOrNull { 
        listOf(
            if (visibleLines[ChartLine.CHIPS_WON] != false) it.chipsWon else Double.NEGATIVE_INFINITY,
            if (visibleLines[ChartLine.NET_EXPECTED] != false) it.netExpected else Double.NEGATIVE_INFINITY,
            if (visibleLines[ChartLine.WON_WITH_SHOWDOWN] != false) it.wonWithShowdown else Double.NEGATIVE_INFINITY,
            if (visibleLines[ChartLine.WON_WITHOUT_SHOWDOWN] != false) it.wonWithoutShowdown else Double.NEGATIVE_INFINITY
        ).maxOrNull() ?: 0.0
    } ?: 0.0
    
    val minValue = data.minOfOrNull {
        listOf(
            if (visibleLines[ChartLine.CHIPS_WON] != false) it.chipsWon else Double.POSITIVE_INFINITY,
            if (visibleLines[ChartLine.NET_EXPECTED] != false) it.netExpected else Double.POSITIVE_INFINITY,
            if (visibleLines[ChartLine.WON_WITH_SHOWDOWN] != false) it.wonWithShowdown else Double.POSITIVE_INFINITY,
            if (visibleLines[ChartLine.WON_WITHOUT_SHOWDOWN] != false) it.wonWithoutShowdown else Double.POSITIVE_INFINITY
        ).minOrNull() ?: 0.0
    } ?: 0.0
    
    val range = maxValue - minValue
    val yPadding = if (range == 0.0) 10.0 else range * 0.1
    
    fun scaleY(value: Double, height: Float): Float {
        return if (range == 0.0) height / 2
        else (height - ((value - minValue + yPadding) / (range + 2 * yPadding) * height)).toFloat()
    }
    
    fun scaleX(index: Int, width: Float): Float {
        return if (data.size <= 1) width / 2
        else (index.toFloat() / (data.size - 1) * width)
    }
    
    Box(modifier = Modifier.fillMaxSize()) {
        Canvas(modifier = Modifier.fillMaxSize().padding(padding)) {
            val width = size.width
            val height = size.height
            
            for (i in 0..4) {
                val y = height * i / 4
                drawLine(
                    color = Dark200,
                    start = Offset(0f, y),
                    end = Offset(width, y),
                    strokeWidth = 1f
                )
            }
            
            data.forEachIndexed { index, point ->
                val x = scaleX(index, width)
                
                if (visibleLines[ChartLine.CHIPS_WON] != false) {
                    val y = scaleY(point.chipsWon, height)
                    drawCircle(
                        color = ChartLine.CHIPS_WON.color,
                        radius = 3f,
                        center = Offset(x, y)
                    )
                }
                
                if (visibleLines[ChartLine.NET_EXPECTED] != false) {
                    val y = scaleY(point.netExpected, height)
                    drawCircle(
                        color = ChartLine.NET_EXPECTED.color,
                        radius = 3f,
                        center = Offset(x, y)
                    )
                }
            }
            
            if (visibleLines[ChartLine.CHIPS_WON] != false) {
                for (i in 0 until data.size - 1) {
                    val x1 = scaleX(i, width)
                    val y1 = scaleY(data[i].chipsWon, height)
                    val x2 = scaleX(i + 1, width)
                    val y2 = scaleY(data[i + 1].chipsWon, height)
                    drawLine(
                        color = ChartLine.CHIPS_WON.color,
                        start = Offset(x1, y1),
                        end = Offset(x2, y2),
                        strokeWidth = 2f
                    )
                }
            }
            
            if (visibleLines[ChartLine.NET_EXPECTED] != false) {
                for (i in 0 until data.size - 1) {
                    val x1 = scaleX(i, width)
                    val y1 = scaleY(data[i].netExpected, height)
                    val x2 = scaleX(i + 1, width)
                    val y2 = scaleY(data[i + 1].netExpected, height)
                    drawLine(
                        color = ChartLine.NET_EXPECTED.color,
                        start = Offset(x1, y1),
                        end = Offset(x2, y2),
                        strokeWidth = 2f
                    )
                }
            }
            
            if (visibleLines[ChartLine.WON_WITH_SHOWDOWN] != false) {
                for (i in 0 until data.size - 1) {
                    val x1 = scaleX(i, width)
                    val y1 = scaleY(data[i].wonWithShowdown, height)
                    val x2 = scaleX(i + 1, width)
                    val y2 = scaleY(data[i + 1].wonWithShowdown, height)
                    drawLine(
                        color = ChartLine.WON_WITH_SHOWDOWN.color,
                        start = Offset(x1, y1),
                        end = Offset(x2, y2),
                        strokeWidth = 2f
                    )
                }
            }
            
            if (visibleLines[ChartLine.WON_WITHOUT_SHOWDOWN] != false) {
                for (i in 0 until data.size - 1) {
                    val x1 = scaleX(i, width)
                    val y1 = scaleY(data[i].wonWithoutShowdown, height)
                    val x2 = scaleX(i + 1, width)
                    val y2 = scaleY(data[i + 1].wonWithoutShowdown, height)
                    drawLine(
                        color = ChartLine.WON_WITHOUT_SHOWDOWN.color,
                        start = Offset(x1, y1),
                        end = Offset(x2, y2),
                        strokeWidth = 2f
                    )
                }
            }
        }
        
        if (finalStats != null) {
            StatsOverlay(
                position = boxPosition,
                finalStats = finalStats,
                globalStats = globalStats,
                chartPosition = chartPosition,
                onDragStart = onDragStart,
                onDrag = onDrag,
                onDragEnd = onDragEnd
            )
        }
    }
}

@Composable
private fun StatsOverlay(
    position: Offset,
    finalStats: spintracker.models.DashboardStats?,
    globalStats: spintracker.models.DashboardStats?,
    chartPosition: ChartPosition,
    onDragStart: (Offset) -> Unit,
    onDrag: (Offset) -> Unit,
    onDragEnd: () -> Unit
) {
    var isPressed by remember { mutableStateOf(false) }
    var pressPosition by remember { mutableStateOf(Offset.Zero) }
    
    Card(
        modifier = Modifier
            .offset {
                IntOffset(position.x.toInt(), position.y.toInt())
            }
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        val event = awaitPointerEvent()
                        val change = event.changes.first()
                        when (change.pressed) {
                            true -> {
                                isPressed = true
                                pressPosition = change.position
                            }
                            false -> {
                                if (isPressed) {
                                    onDragEnd()
                                    isPressed = false
                                }
                            }
                        }
                        if (isPressed) {
                            onDragStart(pressPosition)
                            onDrag(change.position)
                        }
                        change.consume()
                        if (change.isConsumed) break
                    }
                }
            },
        colors = CardDefaults.cardColors(containerColor = Dark400),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp).width(200.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Stats", color = Color.White.copy(alpha = 0.5f), fontSize = 10.sp, fontWeight = FontWeight.Medium)
                Icon(Icons.Default.DragIndicator, null, tint = Color.White.copy(alpha = 0.3f), modifier = Modifier.size(16.dp))
            }
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("Tournaments", color = Color.White.copy(alpha = 0.5f), fontSize = 10.sp)
                Text(
                    "${if (chartPosition == ChartPosition.ALL) globalStats?.totalTournaments else finalStats?.totalTournaments}",
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
            }
            
            Spacer(modifier = Modifier.height(4.dp))
            
            val cev = finalStats?.avgChipsEv ?: 0.0
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("CEV", color = Color.White.copy(alpha = 0.5f), fontSize = 10.sp)
                Text(
                    "${if (cev >= 0) "+" else ""}${String.format("%.2f", cev)}",
                    color = if (cev >= 0) SuccessGreen else ErrorRed,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
            }
            
            if (globalStats?.cevByPosition?.isNotEmpty() == true) {
                Spacer(modifier = Modifier.height(8.dp))
                Divider(color = Dark200)
                Spacer(modifier = Modifier.height(8.dp))
                
                Row(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Heads-Up", color = Color.White.copy(alpha = 0.3f), fontSize = 8.sp)
                        Spacer(modifier = Modifier.height(4.dp))
                        PositionStatRow("SB", globalStats, "HU_SB", chartPosition)
                        PositionStatRow("BB", globalStats, "HU_BB", chartPosition)
                    }
                    
                    Spacer(modifier = Modifier.width(12.dp))
                    
                    Column(modifier = Modifier.weight(1f)) {
                        Text("3-Way", color = Color.White.copy(alpha = 0.3f), fontSize = 8.sp)
                        Spacer(modifier = Modifier.height(4.dp))
                        PositionStatRow("BTN", globalStats, "THREE_WAY_BTN", chartPosition)
                        PositionStatRow("SB", globalStats, "THREE_WAY_SB", chartPosition)
                        PositionStatRow("BB", globalStats, "THREE_WAY_BB", chartPosition)
                    }
                }
            }
        }
    }
}

@Composable
private fun PositionStatRow(
    label: String,
    stats: spintracker.models.DashboardStats?,
    positionKey: String,
    chartPosition: ChartPosition
) {
    val totalTournaments = stats?.totalTournaments ?: 1
    val value = stats?.cevByPosition?.get(positionKey) ?: 0.0
    
    val displayValue = if (chartPosition == ChartPosition.ALL) {
        value / totalTournaments
    } else {
        val currentPosKey = when (chartPosition) {
            ChartPosition.HU_SB -> "HU_SB"
            ChartPosition.HU_BB -> "HU_BB"
            ChartPosition.THREE_WAY_BTN -> "THREE_WAY_BTN"
            ChartPosition.THREE_WAY_SB -> "THREE_WAY_SB"
            ChartPosition.THREE_WAY_BB -> "THREE_WAY_BB"
            else -> ""
        }
        if (positionKey == currentPosKey) value / totalTournaments else 0.0
    }
    
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, color = Color.White.copy(alpha = 0.5f), fontSize = 9.sp)
        Text(
            String.format("%.2f", displayValue),
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Medium
        )
    }
}

fun Database.getWinrateChartData(heroName: String, position: ChartPosition): List<ChartDataPoint> {
    val conn = getConnection()
    try {
        val positionFilter = position.dbFilter
        
        val sql = """
            SELECT ph.net_result, h.ev, 
                   CASE WHEN ph.went_to_showdown = 1 THEN ph.net_result ELSE 0 END as showdown,
                   CASE WHEN ph.went_to_showdown = 0 THEN ph.net_result ELSE 0 END as no_showdown,
                   h.date_time
            FROM player_hands ph
            JOIN hands h ON ph.hand_id = h.id
            WHERE ph.player_name = ? AND h.player_count <= 3 $positionFilter
            ORDER BY h.date_time ASC
        """
        val stmt = conn.prepareStatement(sql)
        stmt.setString(1, heroName)
        
        val rs = stmt.executeQuery()
        var cumulativeEv = 0.0
        var cumulativeProfit = 0.0
        var cumulativeShowdown = 0.0
        var cumulativeNonShowdown = 0.0
        
        val dailyData = mutableMapOf<String, MutableGraphData>()
        
        while (rs.next()) {
            val ev = rs.getDouble(2)
            val result = rs.getDouble(1)
            val showdown = rs.getDouble(3)
            val noShowdown = rs.getDouble(4)
            val dateTime = rs.getString(5)
            val dateKey = dateTime.split("T").firstOrNull() ?: dateTime
            
            cumulativeEv += ev
            cumulativeProfit += result
            cumulativeShowdown += showdown
            cumulativeNonShowdown += noShowdown
            
            if (!dailyData.containsKey(dateKey)) {
                dailyData[dateKey] = MutableGraphData(
                    label = dateKey,
                    chipsWon = 0.0,
                    netExpected = 0.0,
                    wonWithShowdown = 0.0,
                    wonWithoutShowdown = 0.0
                )
            }
            
            dailyData[dateKey] = dailyData[dateKey]!!.copy(
                chipsWon = cumulativeProfit,
                netExpected = cumulativeEv,
                wonWithShowdown = cumulativeShowdown,
                wonWithoutShowdown = cumulativeNonShowdown
            )
        }
        
        rs.close()
        stmt.close()
        
        return dailyData.values.map { data ->
            ChartDataPoint(
                label = data.label,
                chipsWon = data.chipsWon,
                netExpected = data.netExpected,
                wonWithShowdown = data.wonWithShowdown,
                wonWithoutShowdown = data.wonWithoutShowdown
            )
        }
    } finally {
        conn.close()
    }
}

data class MutableGraphData(
    val label: String,
    val chipsWon: Double,
    val netExpected: Double,
    val wonWithShowdown: Double,
    val wonWithoutShowdown: Double
)

fun Database.getDashboardStatsWithPosition(heroName: String, position: String?): spintracker.models.DashboardStats {
    val conn = getConnection()
    try {
        val positionFilter = when (position) {
            null -> ""
            "HU_SB" -> "AND ph.position = 'SB' AND h.player_count = 2"
            "HU_BB" -> "AND ph.position = 'BB' AND h.player_count = 2"
            "THREE_WAY_BTN" -> "AND ph.position = 'BTN' AND h.player_count = 3"
            "THREE_WAY_SB" -> "AND ph.position = 'SB' AND h.player_count = 3"
            "THREE_WAY_BB" -> "AND ph.position = 'BB' AND h.player_count = 3"
            else -> ""
        }
        
        val stmt = conn.prepareStatement("""
            SELECT SUM(COALESCE(ph.net_won_adjusted, ph.net_result)), SUM(ph.net_result), COUNT(*),
                   COUNT(DISTINCT h.game_id)
            FROM hands h
            JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = ?
            WHERE h.player_count <= 3 $positionFilter
        """)
        stmt.setString(1, heroName)
        
        val rs = stmt.executeQuery()
        if (!rs.next()) return spintracker.models.DashboardStats()
        
        val totalEv = rs.getDouble(1)
        val totalEvChips = rs.getDouble(2)
        val totalHands = rs.getInt(3)
        val totalTournaments = rs.getInt(4)
        val avgChipsEv = if (totalTournaments > 0) totalEv / totalTournaments else 0.0
        
        rs.close()
        stmt.close()
        
        return spintracker.models.DashboardStats(
            totalProfit = 0.0,
            totalHands = totalHands,
            totalEv = totalEv,
            totalTournaments = totalTournaments,
            tournamentsWon = 0,
            chipsWonWithShowdown = 0.0,
            chipsWonWithoutShowdown = 0.0,
            avgChipsEv = avgChipsEv,
            cevByPosition = emptyMap()
        )
    } finally {
        conn.close()
    }
}
