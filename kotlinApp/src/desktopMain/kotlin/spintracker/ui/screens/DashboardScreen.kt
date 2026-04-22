package spintracker.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.onPointerEvent
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.isSecondaryPressed
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import spintracker.data.AppState
import spintracker.ui.*
import spintracker.models.GraphPoint

@Composable
fun DashboardScreen(refreshKey: Int, heroName: String, dateRange: String, buyIn: String) {
    val stats = remember(refreshKey, heroName, dateRange, buyIn) { 
        appState.getDashboardStats(heroName) 
    }
    
    val graphData = remember(refreshKey, heroName, dateRange, buyIn) {
        appState.getGraphData(heroName)
    }
    
    Column(modifier = Modifier.fillMaxSize()) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("Dashboard", style = MaterialTheme.typography.headlineLarge, color = Color.White)
                Text("Track your spin and go performance", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodyMedium)
            }
            if (heroName.isNotEmpty()) {
                AssistChip(onClick = { }, label = { Text("Hero: $heroName", style = MaterialTheme.typography.labelMedium) })
            }
        }
        Spacer(modifier = Modifier.height(24.dp))
        
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Card(modifier = Modifier.weight(1f), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.TrendingUp, null, tint = Color(0xFF10b981), modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Profit", style = MaterialTheme.typography.titleMedium, color = Color.White)
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    val profit = stats.totalProfit
                    Text("%.2f €".format(profit), style = MaterialTheme.typography.headlineMedium, color = if (profit >= 0) Color(0xFF10b981) else Color(0xFFef4444))
                }
            }
            Card(modifier = Modifier.weight(1f), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.BarChart, null, tint = Color(0xFF3b82f6), modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Activity", style = MaterialTheme.typography.titleMedium, color = Color.White)
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("Tournaments", color = Color.White.copy(alpha = 0.5f)); Text("${stats.totalTournaments}", color = Color.White) }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("Hands", color = Color.White.copy(alpha = 0.5f)); Text("${stats.totalHands}", color = Color.White) }
                }
            }
            Card(modifier = Modifier.weight(1f), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.EmojiEvents, null, tint = Color(0xFFf59e0b), modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Win Rate", style = MaterialTheme.typography.titleMedium, color = Color.White)
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    val winRate = if (stats.totalTournaments > 0) (stats.tournamentsWon.toDouble() / stats.totalTournaments) * 100 else 0.0
                    Text("%.1f%%".format(winRate), style = MaterialTheme.typography.headlineMedium, color = Color.White)
                }
            }
            Card(modifier = Modifier.weight(1f), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.PieChart, null, tint = Color(0xFF8b5cf6), modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("CEV by Position", style = MaterialTheme.typography.titleMedium, color = Color.White)
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("Global: %.1f".format(stats.avgChipsEv), color = Color.White, style = MaterialTheme.typography.bodyMedium)
                    Spacer(modifier = Modifier.height(8.dp))
                    val totalTournaments = stats.totalTournaments.coerceAtLeast(1)
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("3-Way", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.labelSmall)
                            Spacer(modifier = Modifier.height(4.dp))
                            val cevBtn3W = (stats.cevByPosition["Button 3W"] ?: 0.0) / totalTournaments
                            val cevSb3W = (stats.cevByPosition["3Way Small Blind"] ?: 0.0) / totalTournaments
                            val cevBb3W = (stats.cevByPosition["3Way BigBlinds"] ?: 0.0) / totalTournaments
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("BTN", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodySmall)
                                Text("%.1f".format(cevBtn3W), color = if (cevBtn3W >= 0) Color(0xFF22c55e) else Color(0xFFef4444), style = MaterialTheme.typography.bodySmall)
                            }
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("SB", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodySmall)
                                Text("%.1f".format(cevSb3W), color = if (cevSb3W >= 0) Color(0xFF22c55e) else Color(0xFFef4444), style = MaterialTheme.typography.bodySmall)
                            }
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("BB", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodySmall)
                                Text("%.1f".format(cevBb3W), color = if (cevBb3W >= 0) Color(0xFF22c55e) else Color(0xFFef4444), style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Heads-Up", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.labelSmall)
                            Spacer(modifier = Modifier.height(4.dp))
                            val cevHuSb = (stats.cevByPosition["HeadsUp SB"] ?: 0.0) / totalTournaments
                            val cevHuBb = (stats.cevByPosition["HeadsUp BB"] ?: 0.0) / totalTournaments
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("SB", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodySmall)
                                Text("%.1f".format(cevHuSb), color = if (cevHuSb >= 0) Color(0xFF22c55e) else Color(0xFFef4444), style = MaterialTheme.typography.bodySmall)
                            }
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("BB", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodySmall)
                                Text("%.1f".format(cevHuBb), color = if (cevHuBb >= 0) Color(0xFF22c55e) else Color(0xFFef4444), style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Card(modifier = Modifier.weight(2f).height(500.dp), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text("Chip Evolution", color = Color.White, style = MaterialTheme.typography.titleMedium)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            LegendItem("Net", Color(0xFF10b981))
                            LegendItem("EV", Color(0xFFf59e0b))
                            LegendItem("Showdown", Color(0xFF3b82f6))
                            LegendItem("Non-Showdown", Color(0xFFef4444))
                        }
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    if (graphData.size > 1) {
                        ChipEvolutionGraph(graphData, modifier = Modifier.fillMaxSize())
                    } else {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text("No data for $heroName. Try importing hands or selecting another hero.", color = Color.White.copy(alpha = 0.5f))
                        }
                    }
                }
            }
            Card(modifier = Modifier.weight(1f).height(500.dp), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Recent Sessions", color = Color.White, style = MaterialTheme.typography.titleMedium)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Recent activity will appear here", color = Color.White.copy(alpha = 0.5f))
                }
            }
        }
    }
}

@Composable
fun LegendItem(label: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(8.dp).background(color))
        Spacer(modifier = Modifier.width(4.dp))
        Text(label, color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.labelSmall)
    }
}

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun ChipEvolutionGraph(data: List<GraphPoint>, modifier: Modifier = Modifier) {
    var hoveredPoint by remember { mutableStateOf<GraphPoint?>(null) }
    var mouseX by remember { mutableStateOf(0f) }
    
    // Zoom state
    var zoomRange by remember { mutableStateOf<IntRange?>(null) }
    var dragStart by remember { mutableStateOf<Float?>(null) }
    var dragCurrent by remember { mutableStateOf<Float?>(null) }
    
    val textMeasurer = androidx.compose.ui.text.rememberTextMeasurer()

    val filteredData = remember(data, zoomRange) {
        if (zoomRange == null) data
        else data.filter { it.x in zoomRange!! }
    }

    Box(modifier = modifier
        .padding(bottom = 24.dp, top = 8.dp, end = 8.dp)
        .onPointerEvent(PointerEventType.Move) { event ->
            val pos = event.changes.first().position
            mouseX = pos.x
        }
        .onPointerEvent(PointerEventType.Exit) { 
            hoveredPoint = null 
        }
        .onPointerEvent(PointerEventType.Press) { event ->
            // Secondary click (right click) to reset zoom
            if (event.buttons.isSecondaryPressed) {
                zoomRange = null
            }
        }
        .pointerInput(data, zoomRange) {
            detectDragGestures(
                onDragStart = { offset ->
                    dragStart = offset.x
                },
                onDrag = { change, _ ->
                    dragCurrent = change.position.x
                },
                onDragEnd = {
                    val start = dragStart ?: return@detectDragGestures
                    val end = dragCurrent ?: return@detectDragGestures
                    
                    if (Math.abs(start - end) > 20) {
                        val canvasWidth = size.width.toFloat()
                        val currentData = if (zoomRange == null) data else data.filter { it.x in zoomRange!! }
                        if (currentData.isNotEmpty()) {
                            val minX = currentData.first().x
                            val maxX = currentData.last().x
                            val rangeX = maxX - minX
                            
                            val zoomMinX = (minX + (Math.min(start, end) / canvasWidth) * rangeX).toInt()
                            val zoomMaxX = (minX + (Math.max(start, end) / canvasWidth) * rangeX).toInt()
                            
                            zoomRange = zoomMinX..zoomMaxX
                        }
                    }
                    dragStart = null
                    dragCurrent = null
                },
                onDragCancel = {
                    dragStart = null
                    dragCurrent = null
                }
            )
        }
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val width = size.width
            val height = size.height
            
            if (filteredData.isEmpty()) return@Canvas
            
            val firstX = filteredData.first().x
            val lastX = filteredData.last().x
            val rangeX = (lastX - firstX).coerceAtLeast(1).toFloat()
            
            // For hover logic, we need to find the point relative to mouseX
            val hoveredXInHands = (firstX + (mouseX / width) * rangeX).toInt()
            hoveredPoint = filteredData.minByOrNull { Math.abs(it.x - hoveredXInHands) }

            val allValues = filteredData.flatMap { listOf(it.ev, it.profit, it.showdown, it.nonShowdown) }
            val minVal = allValues.minOrNull()?.toFloat() ?: 0f
            val maxVal = allValues.maxOrNull()?.toFloat() ?: 0f
            val rangeY = (maxVal - minVal).coerceAtLeast(100f)
            
            fun getX(x: Int) = ((x - firstX).toFloat() / rangeX) * width
            fun getY(y: Double) = height - (((y.toFloat() - minVal) / rangeY) * height)
            
            // Draw zero line
            if (minVal < 0 && maxVal > 0) {
                val zeroY = getY(0.0)
                drawLine(
                    color = Color.White.copy(alpha = 0.05f),
                    start = Offset(0f, zeroY),
                    end = Offset(width, zeroY),
                    strokeWidth = 1f
                )
            }
            
            // Draw lines
            val lines = listOf(
                Triple(filteredData.map { it.ev }, Color(0xFFf59e0b), 2f),
                Triple(filteredData.map { it.showdown }, Color(0xFF3b82f6), 1.5f),
                Triple(filteredData.map { it.nonShowdown }, Color(0xFFef4444), 1.5f),
                Triple(filteredData.map { it.profit }, Color(0xFF10b981), 2.5f)
            )
            
            lines.forEach { (values, color, stroke) ->
                val path = Path().apply {
                    moveTo(getX(filteredData[0].x), getY(values[0]))
                    for (i in 1 until filteredData.size) {
                        lineTo(getX(filteredData[i].x), getY(values[i]))
                    }
                }
                drawPath(
                    path = path,
                    color = color,
                    style = Stroke(width = stroke, join = StrokeJoin.Round)
                )
            }

            // Draw Drag Selection Box
            if (dragStart != null && dragCurrent != null) {
                val start = dragStart!!
                val end = dragCurrent!!
                drawRect(
                    color = Color.White.copy(alpha = 0.1f),
                    topLeft = Offset(Math.min(start, end), 0f),
                    size = Size(Math.abs(start - end), height)
                )
            }

            // Draw Hover Overlay
            hoveredPoint?.let { pt ->
                val hx = getX(pt.x)
                
                drawLine(
                    color = Color.White.copy(alpha = 0.2f),
                    start = Offset(hx, 0f),
                    end = Offset(hx, height),
                    strokeWidth = 1f
                )
                
                // Tooltip
                val tooltipWidth = 140f
                val tooltipHeight = 110f
                var tx = hx + 10f
                if (tx + tooltipWidth > width) tx = hx - tooltipWidth - 10f
                
                drawRoundRect(
                    color = Color(0xFF1a1f2e).copy(alpha = 0.9f),
                    topLeft = Offset(tx, 10f),
                    size = Size(tooltipWidth, tooltipHeight),
                    cornerRadius = CornerRadius(4f, 4f)
                )
                
                val stats = listOf(
                    "Hands: ${pt.x}" to Color.White,
                    "Net: %.0f".format(pt.profit) to Color(0xFF10b981),
                    "EV: %.0f".format(pt.ev) to Color(0xFFf59e0b),
                    "SD: %.0f".format(pt.showdown) to Color(0xFF3b82f6),
                    "NSD: %.0f".format(pt.nonShowdown) to Color(0xFFef4444)
                )
                
                stats.forEachIndexed { index, (text, color) ->
                    drawText(
                        textMeasurer = textMeasurer,
                        text = text,
                        topLeft = Offset(tx + 8f, 15f + (index * 18f)),
                        style = TextStyle(color = color, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    )
                }
            }
        }
        
        if (zoomRange != null) {
            Button(
                onClick = { zoomRange = null },
                modifier = Modifier.align(Alignment.TopStart).padding(8.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color.Black.copy(alpha = 0.5f)),
                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
            ) {
                Icon(Icons.Default.ZoomOutMap, null, modifier = Modifier.size(14.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Reset Zoom", fontSize = 10.sp)
            }
        }
    }
}