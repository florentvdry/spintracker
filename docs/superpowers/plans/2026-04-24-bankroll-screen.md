# Bankroll Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a Bankroll tracking screen with a graph showing bankroll over time, drawdown line overlaid, and peak/trough markers.

**Architecture:** The BankrollScreen will follow the existing screen pattern (DashboardScreen, ChartsScreen) using Compose Canvas for graph rendering. It will query the Database for bankroll data and calculate drawdowns from peak values.

**Tech Stack:** Kotlin, Jetpack Compose Desktop, SQLite (existing Database class)

---

### Task 1: Add Bankroll to NavScreen enum

**Files:**
- Modify: `kotlinApp/src/desktopMain/kotlin/spintracker/ui/components/Sidebar.kt`

- [ ] **Step 1: Add Bankroll entry to NavScreen enum**

Add the following entry to the `NavScreen` enum in `Sidebar.kt:22-30`:

```kotlin
Bankroll("Bankroll", Icons.Default.ShowChart, "/bankroll"),
```

Place it after `Charts` and before `Players`.

- [ ] **Step 2: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/ui/components/Sidebar.kt
git commit -m "feat: add Bankroll nav screen entry"
```

---

### Task 2: Add bankroll data method to Database

**Files:**
- Modify: `kotlinApp/src/desktopMain/kotlin/spintracker/data/Database.kt`
- Test: (manual verification via existing getGraphData pattern)

- [ ] **Step 1: Add BankrollDataPoint data class**

Add near other data classes in Database.kt (around line 920):

```kotlin
data class BankrollDataPoint(
    val x: Int,
    val bankroll: Double,
    val peak: Double,
    val drawdown: Double,
    val isPeak: Boolean,
    val isTrough: Boolean
)
```

- [ ] **Step 2: Add getBankrollData function**

Add the function after `getGraphData` (around line 883):

```kotlin
fun getBankrollData(heroName: String? = null): List<BankrollDataPoint> {
    val conn = getConnection()
    val points = mutableListOf<BankrollDataPoint>()
    try {
        val sql = """
            SELECT ph.net_result
            FROM player_hands ph
            JOIN hands h ON ph.hand_id = h.id
            WHERE ph.player_name = ?
            ORDER BY h.date_time ASC
        """
        val stmt = conn.prepareStatement(sql)
        stmt.setString(1, heroName ?: "")
        
        val rs = stmt.executeQuery()
        var cumulativeBankroll = 0.0
        var peak = 0.0
        var count = 0
        
        points.add(BankrollDataPoint(0, 0.0, 0.0, 0.0, false, false))
        
        while (rs.next()) {
            val result = rs.getDouble(1)
            count++
            cumulativeBankroll += result
            peak = maxOf(peak, cumulativeBankroll)
            val drawdown = cumulativeBankroll - peak
            
            points.add(BankrollDataPoint(count, cumulativeBankroll, peak, drawdown, false, false))
        }
        
        rs.close()
        stmt.close()
        
        // Mark peaks and troughs
        for (i in 1 until points.size - 1) {
            val prev = points[i - 1]
            val curr = points[i]
            val next = points[i + 1]
            
            if (curr.bankroll > prev.bankroll && curr.bankroll > next.bankroll) {
                points[i] = curr.copy(isPeak = true)
            }
            if (curr.bankroll < prev.bankroll && curr.bankroll < next.bankroll) {
                points[i] = curr.copy(isTrough = true)
            }
        }
        
    } finally {
        conn.close()
    }
    return points
}
```

- [ ] **Step 3: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/data/Database.kt
git commit -m "feat: add getBankrollData with drawdown calculation"
```

---

### Task 3: Add getBankrollData to AppState

**Files:**
- Modify: `kotlinApp/src/desktopMain/kotlin/spintracker/data/AppState.kt`

- [ ] **Step 1: Add wrapper method**

Add after `getGraphData` (around line 136):

```kotlin
fun getBankrollData(hero: String? = null): List<spintracker.models.BankrollDataPoint> {
    return database.getBankrollData(hero ?: heroName)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/data/AppState.kt
git commit -m "feat: add getBankrollData to AppState"
```

---

### Task 4: Create BankrollScreen composable

**Files:**
- Create: `kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/BankrollScreen.kt`

- [ ] **Step 1: Create BankrollScreen.kt with basic structure**

```kotlin
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
import spintracker.data.appState
import spintracker.ui.*

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
                Spacer(modifier = Modifier.height(16.dp))
                
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
        
        // Stats cards
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
fun LegendItem(label: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(12.dp).background(color, RoundedCornerShape(2.dp)))
        Spacer(modifier = Modifier.width(4.dp))
        Text(label, color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
fun BankrollGraph(data: List<spintracker.models.BankrollDataPoint>, modifier: Modifier = Modifier) {
    val textMeasurer = androidx.compose.ui.text.rememberTextMeasurer()
    
    Box(modifier = modifier.padding(bottom = 24.dp, top = 8.dp, end = 8.dp)) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val width = size.width
            val height = size.height
            
            if (data.isNotEmpty()) {
                val firstX = data.first().x
                val lastX = data.last().x
                val rangeX = (lastX - firstX).coerceAtLeast(1).toFloat()
                
                // Calculate Y range including drawdown
                val bankrollValues = data.map { it.bankroll }
                val drawdownValues = data.map { it.drawdown }
                val allValues = bankrollValues + drawdownValues
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
                
                // Draw bankroll line
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
                
                // Draw drawdown line (inverted for visual clarity - below zero line)
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
                
                // Draw peak markers
                data.filter { it.isPeak }.forEach { point ->
                    val x = getX(point.x)
                    val y = getY(point.bankroll)
                    drawCircle(
                        color = WarningYellow,
                        radius = 5f,
                        center = Offset(x, y)
                    )
                }
                
                // Draw trough markers
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
```

- [ ] **Step 2: Add BankrollDataPoint to Models.kt**

Add to `kotlinApp/src/desktopMain/kotlin/spintracker/models/Models.kt` after GraphPoint:

```kotlin
data class BankrollDataPoint(
    val x: Int,
    val bankroll: Double,
    val peak: Double,
    val drawdown: Double,
    val isPeak: Boolean,
    val isTrough: Boolean
)
```

- [ ] **Step 3: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/ui/screens/BankrollScreen.kt src/desktopMain/kotlin/spintracker/models/Models.kt
git commit -m "feat: create BankrollScreen with graph and drawdown"
```

---

### Task 5: Add BankrollScreen to SpinTrackerApp navigation

**Files:**
- Modify: `kotlinApp/src/desktopMain/kotlin/spintracker/ui/SpinTrackerApp.kt`

- [ ] **Step 1: Add import**

Add after other screen imports (around line 32):

```kotlin
import spintracker.ui.screens.BankrollScreen
```

- [ ] **Step 2: Add Bankroll case to when expression**

Add in the `when (selectedScreen)` block (around line 127), after Charts:

```kotlin
NavScreen.Bankroll -> BankrollScreen(heroName, dateRange, buyIn)
```

- [ ] **Step 3: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/ui/SpinTrackerApp.kt
git commit -m "feat: add BankrollScreen to navigation"
```

---

### Task 6: Verify and test

**Files:**
- All modified files

- [ ] **Step 1: Build the project**

```bash
./gradlew build
```

Expected: Build succeeds with no errors

- [ ] **Step 2: Run the application**

```bash
./gradlew run
```

Expected: Application starts, "Bankroll" appears in sidebar navigation

- [ ] **Step 3: Final commit if all passes**

```bash
git add .
git commit -m "chore: verify bankroll screen build"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ Graph of bankroll over time - BankrollGraph composable
- ✅ Drawdown line overlaid - Red drawdown line in same canvas
- ✅ Peak/trough markers - Yellow peaks, blue troughs as circles
- ✅ Navigation integration - NavScreen enum + when clause

**2. Placeholder scan:**
- ✅ No TBD/TODO patterns
- ✅ All code shown inline
- ✅ Exact file paths provided

**3. Type consistency:**
- ✅ BankrollDataPoint defined in Models.kt
- ✅ Consistent naming with existing screens (heroName, dateRange, buyIn params)
- ✅ Uses existing color scheme (Primary400, ErrorRed, etc.)
