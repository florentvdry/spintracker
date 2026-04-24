package spintracker.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import spintracker.ui.*
import spintracker.models.BankrollDataPoint
import spintracker.ui.appState

@Composable
fun BankrollScreen(heroName: String, dateRange: String, buyIn: String) {
    val bankrollData = remember(heroName, dateRange, buyIn) {
        appState.getBankrollData(heroName)
    }
    
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Bankroll", style = MaterialTheme.typography.headlineLarge, color = Color.White)
                Text("Track your bankroll over time", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.bodyMedium)
            }
        }
        Spacer(modifier = Modifier.height(24.dp))
        
        Card(
            modifier = Modifier.fillMaxWidth().height(500.dp),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Bankroll & Drawdown", color = Color.White, style = MaterialTheme.typography.titleMedium)
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        LegendItem("Bankroll", Primary400)
                        LegendItem("Drawdown", ErrorRed)
                    }
                }
                
                if (bankrollData.size > 1) {
                    BankrollGraph(bankrollData, modifier = Modifier.fillMaxSize())
                } else {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("No data for $heroName. Try importing hands or selecting another hero.", color = Color.White.copy(alpha = 0.5f))
                    }
                }
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            val currentBankroll = bankrollData.lastOrNull()?.bankroll ?: 0.0
            val peakBankroll = bankrollData.maxByOrNull { it.bankroll }?.bankroll ?: 0.0
            val maxDrawdown = bankrollData.minByOrNull { it.drawdown }?.drawdown ?: 0.0
            
            Card(modifier = Modifier.weight(1f), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.TrendingUp, null, tint = Primary400, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Current Bankroll", style = MaterialTheme.typography.titleMedium, color = Color.White)
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("%.2f €".format(currentBankroll), style = MaterialTheme.typography.headlineMedium, color = if (currentBankroll >= 0) SuccessGreen else ErrorRed)
                }
            }
            
            Card(modifier = Modifier.weight(1f), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.ArrowUpward, null, tint = WarningYellow, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Peak Bankroll", style = MaterialTheme.typography.titleMedium, color = Color.White)
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("%.2f €".format(peakBankroll), style = MaterialTheme.typography.headlineMedium, color = SuccessGreen)
                }
            }
            
            Card(modifier = Modifier.weight(1f), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.TrendingDown, null, tint = ErrorRed, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Max Drawdown", style = MaterialTheme.typography.titleMedium, color = Color.White)
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("%.2f €".format(maxDrawdown), style = MaterialTheme.typography.headlineMedium, color = ErrorRed)
                }
            }
        }
    }
}

@Composable
fun BankrollGraph(data: List<BankrollDataPoint>, modifier: Modifier = Modifier) {
    val textMeasurer = androidx.compose.ui.text.rememberTextMeasurer()
    
    Box(modifier = modifier.padding(bottom = 24.dp, top = 8.dp, end = 8.dp)) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val width = size.width
            val height = size.height
            
            if (data.isNotEmpty()) {
                val firstX = data.first().x
                val lastX = data.last().x
                val rangeX = (lastX - firstX).coerceAtLeast(1).toFloat()
                
                val bankrollValues = data.map { it.bankroll }
                val drawdownValues = data.map { it.drawdown }
                val allValues = bankrollValues + drawdownValues
                val minVal = allValues.minOrNull()?.toFloat() ?: 0f
                val maxVal = allValues.maxOrNull()?.toFloat() ?: 0f
                val rangeY = (maxVal - minVal).coerceAtLeast(100f)
                
                fun getX(x: Int) = ((x - firstX).toFloat() / rangeX) * width
                fun getY(y: Double) = height - (((y.toFloat() - minVal) / rangeY) * height)
                
                if (minVal < 0 && maxVal > 0) {
                    val zeroY = getY(0.0)
                    drawLine(
                        color = Color.White.copy(alpha = 0.05f),
                        start = Offset(0f, zeroY),
                        end = Offset(width, zeroY),
                        strokeWidth = 1f
                    )
                }
                
                val bankrollPath = Path().apply {
                    moveTo(getX(data[0].x), getY(data[0].bankroll))
                    for (i in 1 until data.size) {
                        lineTo(getX(data[i].x), getY(data[i].bankroll))
                    }
                }
                drawPath(
                    path = bankrollPath,
                    color = Primary400,
                    style = Stroke(width = 2.5f, join = androidx.compose.ui.graphics.StrokeJoin.Round)
                )
                
                val drawdownPath = Path().apply {
                    moveTo(getX(data[0].x), getY(data[0].drawdown))
                    for (i in 1 until data.size) {
                        lineTo(getX(data[i].x), getY(data[i].drawdown))
                    }
                }
                drawPath(
                    path = drawdownPath,
                    color = ErrorRed,
                    style = Stroke(width = 1.5f, join = androidx.compose.ui.graphics.StrokeJoin.Round)
                )
                
                data.filter { it.isPeak }.forEach { point ->
                    val x = getX(point.x)
                    val y = getY(point.bankroll)
                    drawCircle(
                        color = WarningYellow,
                        radius = 5f,
                        center = Offset(x, y)
                    )
                }
                
                data.filter { it.isTrough }.forEach { point ->
                    val x = getX(point.x)
                    val y = getY(point.bankroll)
                    drawCircle(
                        color = InfoBlue,
                        radius = 4f,
                        center = Offset(x, y)
                    )
                }
            }
        }
    }
}
