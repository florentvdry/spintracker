# Code Cleanup and Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove unused files, clean up dead code, and refactor spaghetti code for better maintainability.

**Architecture:** The SpinTracker project is a Kotlin Compose desktop application for poker hand tracking and analysis. It includes parsers for multiple poker rooms (Betclic, Winamax, PokerStars), equity calculation services, and various UI screens.

**Tech Stack:** Kotlin 1.9.0, JetBrains Compose 1.5.10, SQLite, Java 17

---

## Analysis Summary

### Unused Files Identified

1. **`kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/replayer.html`** - Standalone HTML file that is NOT used by the Kotlin app. The replayer functionality uses the Compose-based `ReplayerScreen.kt` component, not this HTML file. The frontend-vue/replayer.html is used by the Electron app (main.js), but the kotlinApp copy is orphaned.

2. **Potential dead code in large files** - Several files have grown large and may contain unused functions after recent HUD removal refactoring.

### Files Requiring Refactoring

1. **`Database.kt`** (2019 lines) - Large file with many responsibilities. Contains repetitive CRUD operations that could be modularized.

2. **`BetclicParser.kt`** (410 lines) - Complex parsing logic with long methods.

3. **`ReplayerScreen.kt`** (319 lines) - Contains both window management and composable content, could be split.

### Recent Cleanup Context

Recent commits show active cleanup efforts:
- `7e3b54b cleanup: remove dead code and unused files`
- `6293e5c cleanup: remove unused imports across project`
- `0f477b6 refactor: remove HUD component files`
- `b731670 refactor: remove HUD migration and test files`

---

## Task Breakdown

### Task 1: Remove Unused replayer.html from kotlinApp

**Files:**
- Delete: `kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/replayer.html`

- [ ] **Step 1: Verify the file is truly unused**

Run: `grep -r "replayer.html" --include="*.kt" kotlinApp/`
Expected: No results (the HTML file is not referenced by Kotlin code)

- [ ] **Step 2: Delete the unused file**

Run: `rm kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/replayer.html`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "cleanup: remove unused replayer.html from kotlinApp"
```

---

### Task 2: Audit Database.kt for Dead Code After HUD Removal

**Files:**
- Modify: `kotlinApp/src/desktopMain/kotlin/spintracker/data/Database.kt:1-2019`

- [ ] **Step 1: Search for HUD-related remnants**

Run: `grep -n "hud\|HUD\|Hud" kotlinApp/src/desktopMain/kotlin/spintracker/data/Database.kt`
Expected: Should find no results (HUD was removed in recent commits)

- [ ] **Step 2: Check for unused player stats functions**

Read Database.kt and look for functions related to player stats that may no longer be called after HUD removal. Look for:
- Functions that update HUD-related fields
- Functions that query HUD configuration

- [ ] **Step 3: Remove any dead code found**

If dead code is found, remove it. If none found, skip to Task 3.

- [ ] **Step 4: Commit (if changes made)**

```bash
git add kotlinApp/src/desktopMain/kotlin/spintracker/data/Database.kt
git commit -m "cleanup: remove dead HUD code from Database.kt"
```

---

### Task 3: Split ReplayerScreen.kt into Focused Components

**Files:**
- Modify: `kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/ReplayerScreen.kt:1-319`
- Create: `kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/replayer/ReplayerWindow.kt`
- Create: `kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/replayer/ReplayerContent.kt`
- Create: `kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/replayer/components/PokerTable.kt`
- Create: `kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/replayer/components/PlayerSeat.kt`
- Create: `kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/replayer/components/PlayingCard.kt`
- Create: `kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/replayer/components/EquityOverlay.kt`
- Create: `kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/replayer/models/ReplayerPlayer.kt`

- [ ] **Step 1: Create replayer subdirectory**

Run: `mkdir -p kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/replayer/components`
Run: `mkdir -p kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/replayer/models`

- [ ] **Step 2: Extract ReplayerPlayer data class**

Create: `kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/replayer/models/ReplayerPlayer.kt`

```kotlin
package spintracker.ui.screens.replayer.models

data class ReplayerPlayer(
    val name: String,
    val position: String,
    val stackSize: Double,
    val holeCards: String,
    val isHero: Boolean,
    var currentStack: Double = stackSize,
    var isFolded: Boolean = false,
    var bet: Double = 0.0
)
```

- [ ] **Step 3: Extract PlayingCard composable**

Create: `kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/replayer/components/PlayingCard.kt`

```kotlin
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
```

- [ ] **Step 4: Extract PlayerSeat composable**

Create: `kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/replayer/components/PlayerSeat.kt`

```kotlin
package spintracker.ui.screens.replayer.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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
import spintracker.ui.Primary400
import spintracker.ui.Dark400
import spintracker.ui.screens.replayer.models.ReplayerPlayer

@Composable
fun PlayerSeat(player: ReplayerPlayer) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Card(
            colors = CardDefaults.cardColors(containerColor = if (player.isHero) Color(0xFF1e3a5f) else Dark400),
            shape = RoundedCornerShape(8.dp),
            border = if (player.isHero) BorderStroke(2.dp, Primary400) else null
        ) {
            Column(modifier = Modifier.padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                androidx.compose.material3.Text(player.name, color = if (player.isHero) Primary400 else Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                androidx.compose.material3.Text("%.0f".format(player.currentStack), color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                if (player.holeCards.isNotEmpty()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                        player.holeCards.chunked(2).forEach { c ->
                            val isRed = c.contains("♥") || c.contains("♦")
                            androidx.compose.material3.Text(c, color = if (isRed) Color(0xFFef4444) else Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 5: Extract EquityOverlay composable**

Create: `kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/replayer/components/EquityOverlay.kt`

```kotlin
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
```

- [ ] **Step 6: Extract PokerTable composable**

Create: `kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/replayer/components/PokerTable.kt`

```kotlin
package spintracker.ui.screens.replayer.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import spintracker.ui.Dark400
import spintracker.ui.screens.replayer.models.ReplayerPlayer

@Composable
fun PokerTable(players: List<ReplayerPlayer>, board: List<String>, pot: Double) {
    Box(modifier = Modifier.aspectRatio(2f).padding(32.dp)) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clip(RoundedCornerShape(100.dp))
                .background(Color(0xFF07251a))
                .border(8.dp, Color(0xFF16191d), RoundedCornerShape(100.dp))
        ) {
            Row(modifier = Modifier.align(Alignment.Center), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                repeat(5) {
                    PlayingCard(card = if (it < board.size) board[it] else null)
                }
            }
            
            if (pot > 0) {
                Card(
                    modifier = Modifier.align(Alignment.Center).offset(y = 60.dp),
                    colors = CardDefaults.cardColors(containerColor = Dark400),
                    shape = RoundedCornerShape(20.dp)
                ) {
                    Row(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        androidx.compose.material3.Text("POT", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp)
                        Spacer(modifier = Modifier.width(8.dp))
                        androidx.compose.material3.Text("%.0f".format(pot), color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
            
            players.forEachIndexed { idx, player ->
                val (align, offsetX, offsetY) = when (idx) {
                    0 -> Triple(Alignment.BottomCenter, 0.dp, (-30).dp)
                    1 -> Triple(Alignment.CenterEnd, 30.dp, 0.dp)
                    2 -> Triple(Alignment.TopCenter, 0.dp, 30.dp)
                    else -> Triple(Alignment.Center, 0.dp, 0.dp)
                }
                Box(modifier = Modifier.align(align).offset(x = offsetX, y = offsetY)) {
                    PlayerSeat(player = player)
                }
            }
        }
    }
}
```

- [ ] **Step 7: Rewrite ReplayerScreen.kt with extracted components**

Modify: `kotlinApp/src/desktopMain/kotlin/spintracker/ui/screens/ReplayerScreen.kt`

```kotlin
package spintracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.rememberWindowState
import spintracker.ui.*
import spintracker.services.EquityService
import spintracker.ui.screens.replayer.components.*
import spintracker.ui.screens.replayer.models.ReplayerPlayer

@Composable
fun ReplayerWindow(handId: String, heroName: String, onClose: () -> Unit) {
    val windowState = rememberWindowState(width = 1100.dp, height = 750.dp)
    
    Window(
        onCloseRequest = onClose,
        title = "SpinTracker Replayer - Hand #$handId",
        state = windowState
    ) {
        ReplayerContent(handId, heroName, onClose)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReplayerContent(handId: String, heroName: String, onClose: () -> Unit) {
    val handData = remember(handId) { appState.database.getHandReplayData(handId, heroName) }
    
    var currentIndex by remember { mutableIntStateOf(0) }
    var isPlaying by remember { mutableStateOf(false) }
    var timer by remember { mutableStateOf<java.util.Timer?>(null) }
    
    val rawPlayers = remember(handData) {
        (handData?.get("players") as? List<*>)?.mapNotNull { p ->
            (p as? Map<String, Any?>)?.let { map ->
                ReplayerPlayer(
                    name = map["name"] as? String ?: "",
                    position = map["position"] as? String ?: "",
                    stackSize = (map["stackSize"] as? Number)?.toDouble() ?: 0.0,
                    holeCards = map["holeCards"] as? String ?: "",
                    isHero = map["isHero"] as? Boolean ?: false
                )
            }
        } ?: emptyList()
    }
    
    val equityService = remember { EquityService() }
    var currentEquity by remember { mutableStateOf<EquityService.EquityResult?>(null) }
    
    var players by remember { mutableStateOf(rawPlayers.map { it.copy() }) }
    var pot by remember { mutableDoubleStateOf(0.0) }
    var board by remember { mutableStateOf(listOf<String>()) }
    var currentActionText by remember { mutableStateOf("Ready") }
    
    val actions = remember(handData) { emptyList<Map<String, Any?>>() }
    val maxIndex = actions.size
    
    DisposableEffect(Unit) {
        onDispose { timer?.cancel() }
    }
    
    LaunchedEffect(board, rawPlayers) {
        val hero = rawPlayers.find { it.isHero }
        if (hero == null || hero.holeCards.isEmpty()) {
            currentEquity = null
        } else {
            val villains = rawPlayers.filter { !it.isHero && it.holeCards.isNotEmpty() }
            if (villains.isNotEmpty()) {
                val boardStr = board.joinToString("")
                val villainCards = villains.map { it.holeCards }
                currentEquity = equityService.calculateMultiwayEquity(
                    heroCards = hero.holeCards,
                    villainCardsList = villainCards,
                    board = boardStr
                )
            }
        }
    }
    
    fun resetState() {
        players = rawPlayers.map { it.copy(currentStack = it.stackSize, isFolded = false, bet = 0.0) }
        pot = 0.0
        board = emptyList()
        currentIndex = 0
        currentActionText = "Ready"
        currentEquity = null
    }
    
    Surface(modifier = Modifier.fillMaxSize(), color = Dark500) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().background(Dark400).padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.material3.Text("Hand #$handId", color = Primary400, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.width(16.dp))
                    handData?.let {
                        androidx.compose.material3.Text("${it["room"] ?: ""} - ${it["buyIn"] ?: 0}€", color = Color.White.copy(alpha = 0.6f), fontSize = 14.sp)
                    }
                }
                IconButton(onClick = onClose) {
                    Icon(Icons.Default.Close, null, tint = Color.White.copy(alpha = 0.6f))
                }
            }
            
            Box(modifier = Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                PokerTable(players = players, board = board, pot = pot)
                currentEquity?.let { equity ->
                    Box(
                        modifier = Modifier.align(Alignment.TopEnd).offset(x = (-20).dp, y = 20.dp)
                    ) {
                        EquityOverlay(equity = equity)
                    }
                }
            }
            
            Row(
                modifier = Modifier.fillMaxWidth().background(Dark400).padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.material3.Text("$currentIndex", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp)
                    Spacer(modifier = Modifier.width(8.dp))
                    Slider(
                        value = currentIndex.toFloat(),
                        onValueChange = { },
                        valueRange = 0f..(maxIndex.toFloat().coerceAtLeast(1f)),
                        modifier = Modifier.weight(1f),
                        colors = SliderDefaults.colors(thumbColor = Primary400, activeTrackColor = Primary400)
                    )
                }
                Spacer(modifier = Modifier.width(16.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    IconButton(onClick = { resetState() }) {
                        Icon(Icons.Default.Replay, null, tint = Color.White.copy(alpha = 0.6f))
                    }
                    IconButton(onClick = { if (currentIndex > 0) currentIndex-- }) {
                        Icon(Icons.Default.SkipPrevious, null, tint = Color.White.copy(alpha = 0.6f))
                    }
                    FilledIconButton(onClick = {
                        if (isPlaying) {
                            timer?.cancel()
                            isPlaying = false
                        } else {
                            isPlaying = true
                            timer = java.util.Timer().apply {
                                scheduleAtFixedRate(object : java.util.TimerTask() {
                                    override fun run() {
                                        if (currentIndex < maxIndex) currentIndex++
                                        else {
                                            cancel()
                                            isPlaying = false
                                        }
                                    }
                                }, 500, 800)
                            }
                        }
                    }) {
                        Icon(if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow, null, tint = Color.White)
                    }
                    IconButton(onClick = { if (currentIndex < maxIndex) currentIndex++ }) {
                        Icon(Icons.Default.SkipNext, null, tint = Color.White.copy(alpha = 0.6f))
                    }
                }
                Spacer(modifier = Modifier.width(16.dp))
                Card(colors = CardDefaults.cardColors(containerColor = DarkSurface), shape = RoundedCornerShape(8.dp)) {
                    androidx.compose.material3.Text(currentActionText, color = Primary400, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
                }
            }
        }
    }
}
```

- [ ] **Step 8: Verify compilation**

Run: `./gradlew compileKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: split ReplayerScreen into focused components"
```

---

### Task 4: Run All Tests

**Files:**
- Test: All test files

- [ ] **Step 1: Run import test**

Run: `./gradlew testImport`
Expected: Test passes

- [ ] **Step 2: Run equity test**

Run: `./gradlew testEquity`
Expected: Test passes

- [ ] **Step 3: Run migration test**

Run: `./gradlew testMigration`
Expected: Test passes

- [ ] **Step 4: Run player typing test**

Run: `./gradlew testPlayerTyping`
Expected: Test passes

- [ ] **Step 5: Run replayer equity test**

Run: `./gradlew testReplayerEquity`
Expected: Test passes

- [ ] **Step 6: Run GTO comparison test**

Run: `./gradlew testGTOComparison`
Expected: Test passes

---

## Self-Review Checklist

- [ ] All unused files identified and removed
- [ ] No dead code remains after HUD removal
- [ ] ReplayerScreen properly split into focused components
- [ ] All tests pass
- [ ] No compilation errors
- [ ] Git commits are atomic and well-described

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-24-cleanup-unused-files-refactor.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
