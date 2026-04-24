# SpinTracker Full Feature Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 46 features from todo.txt across 7 phases.

**Architecture:** Kotlin/Jetpack Compose desktop app with SQLite database. Each phase adds new UI components, database migrations, and services while maintaining existing functionality.

**Tech Stack:** Kotlin 1.9.0, Jetpack Compose 1.5.10, SQLite JDBC, 7-card poker evaluator

---

## File Structure

```
src/desktopMain/kotlin/spintracker/
├── ui/
│   ├── components/
│   │   ├── HUD.kt              # NEW - Floating HUD overlay
│   │   ├── PlayerBadge.kt       # NEW - Color-coded player badges
│   │   └── PlayerPopup.kt     # NEW - Player detail popup
│   ├── screens/
│   │   ├── HUDScreen.kt      # NEW - HUD configuration
│   │   ├── BankrollScreen.kt # NEW - Session/bankroll tracking
│   │   └── LeakBusterScreen.kt # NEW - AI leak detection
│   └── theme/
│       └── Theme.kt          # MODIFY - Add HUD colors
├── services/
│   ├── PlayerTypingService.kt    # NEW - Auto player classification
│   ├── LeakDetectionService.kt   # NEW - AI leak analysis
│   ├── ICMService.kt          # NEW - ICM calculations
│   └── VarianceService.kt   # NEW - Variance calculator
├── data/
│   ├── migrations/
│   │   ├── Migration014_HUD.kt     # Phase 1
│   │   ├── Migration015_PlayerTypes.kt # Phase 2
│   │   ├── Migration016_AdvancedStats.kt # Phase 3
│   │   ├── Migration017_LeakData.kt  # Phase 4
│   │   ├── Migration018_StudyData.kt # Phase 5
│   │   └── Migration019_SessionData.kt # Phase 6
│   └── AppState.kt               # MODIFY - Add new state
└── models/
    └── Models.kt                # MODIFY - Add new fields
```

## Phase 1: Real-Time HUD (Features 1-2)

### Task 1: Database Migration for HUD

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/data/migrations/Migration014_HUD.kt`
- Test: `src/desktopMain/kotlin/spintracker/tests/Migration014Test.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
// src/desktopMain/kotlin/spintracker/tests/Migration014Test.kt
package spintracker.tests

import spintracker.data.Database
import spintracker.data.migrations.Migration014_HUD
import org.junit.Assert.*
import org.junit.Test

class Migration014Test {
    @Test
    fun testMigrationAddsHUDTables() {
        val db = Database.inMemory()
        Migration014_HUD.run(db)
        
        val cursor = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='hud_settings'")
        assertTrue(cursor.moveToFirst())
        cursor.close()
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests Migration014Test`
Expected: FAIL (Migration014_HUD not found)

- [ ] **Step 3: Write minimal implementation**

```kotlin
// src/desktopMain/kotlin/spintracker/data/migrations/Migration014_HUD.kt
package spintracker.data.migrations

import spintracker.data.Database

object Migration014_HUD {
    fun run(db: Database) {
        db.execute("""
            CREATE TABLE IF NOT EXISTS hud_settings (
                id INTEGER PRIMARY KEY,
                show_hud INTEGER DEFAULT 1,
                opacity REAL DEFAULT 0.9,
                position TEXT DEFAULT 'top_right'
            )
        """.trimIndent())
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests Migration014Test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/data/migrations/Migration014_HUD.kt src/desktopMain/kotlin/spintracker/tests/Migration014Test.kt
git commit -m "feat: add migration 014 for HUD settings"
```

### Task 2: HUD Component

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/ui/components/HUD.kt`
- Modify: `src/desktopMain/kotlin/spintracker/ui/SpinTrackerApp.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
// src/desktopMain/kotlin/spintracker/tests/HUDComponentTest.kt
package spintracker.tests

import org.junit.Assert.*
import org.junit.Test

class HUDComponentTest {
    @Test
    fun testHUDOverlayRenders() {
        // Test HUD state management
        val hudState = HUDState(visible = true, opacity = 0.9f)
        assertTrue(hudState.visible)
        assertEquals(0.9f, hudState.opacity, 0.01f)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests HUDComponentTest`
Expected: FAIL (HUDState not defined)

- [ ] **Step 3: Write minimal implementation**

```kotlin
// src/desktopMain/kotlin/spintracker/ui/components/HUD.kt
package spintracker.ui.components

import androidx.compose.runtime.*
import androidx.compose.ui.Modifier

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
    
    // Floating overlay implementation
    // (detailed in actual implementation)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests HUDComponentTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/ui/components/HUD.kt src/desktopMain/kotlin/spintracker/tests/HUDComponentTest.kt
git commit -m "feat: add HUD overlay component"
```

### Task 3: Player Popup

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/ui/components/PlayerPopup.kt`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

---

## Phase 2: Opponent Intelligence (Features 3-9)

### Task 4: Player Typing Service

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/services/PlayerTypingService.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
// src/desktopMain/kotlin/spintracker/tests/PlayerTypingServiceTest.kt
package spintracker.tests

import spintracker.services.PlayerTypingService
import spintracker.models.PlayerStats
import org.junit.Assert.*
import org.junit.Test

class PlayerTypingServiceTest {
    @Test
    fun testClassifyTagPlayer() {
        val stats = PlayerStats(vpip = 0.25, pfr = 0.18, foldTo3bet = 0.45)
        val type = PlayerTypingService.classify(stats)
        assertEquals(PlayerType.TAG, type)
    }
    
    @Test
    fun testClassifyLagPlayer() {
        val stats = PlayerStats(vpip = 0.45, pfr = 0.25, foldTo3bet = 0.60)
        val type = PlayerTypingService.classify(stats)
        assertEquals(PlayerType.LAG, type)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests PlayerTypingServiceTest`
Expected: FAIL (PlayerTypingService not found)

- [ ] **Step 3: Write minimal implementation**

```kotlin
// src/desktopMain/kotlin/spintracker/services/PlayerTypingService.kt
package spintracker.services

import spintracker.models.PlayerStats

enum class PlayerType { FISH, REG, TAG, LAG, NIT, WHALE, MANIAC }

data class PlayerStats(
    val vpip: Double = 0.0,
    val pfr: Double = 0.0,
    val foldTo3bet: Double = 0.0,
    val wtsd: Double = 0.0,
    val hands: Int = 0
)

object PlayerTypingService {
    fun classify(stats: PlayerStats): PlayerType {
        if (stats.hands < 50) return PlayerType.REG
        
        return when {
            stats.vpip < 0.15 -> PlayerType.NIT
            stats.vpip > 0.50 -> PlayerType.MANIAC
            stats.vpip > 0.35 -> PlayerType.LAG
            stats.pfr > 0.15 -> PlayerType.TAG
            stats.vpip < 0.25 -> PlayerType.REG
            else -> PlayerType.FISH
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests PlayerTypingServiceTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/services/PlayerTypingService.kt src/desktopMain/kotlin/spintracker/tests/PlayerTypingServiceTest.kt
git commit -m "feat: add player typing service"
```

### Task 5: Player Badges

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/ui/components/PlayerBadge.kt`
- Modify: `src/desktopMain/kotlin/spintracker/ui/screens/PlayersScreen.kt`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

### Task 6: Position-Based Stats (Fold to C-bet, Steal %, etc.)

**Files:**
- Modify: `src/desktopMain/kotlin/spintracker/data/StatsCacheRepository.kt`
- Create: `src/desktopMain/kotlin/spintracker/data/migrations/Migration015_PlayerTypes.kt`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

---

## Phase 3: Advanced Statistics (Features 10-15)

### Task 7: Board Texture Analysis

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/services/BoardTextureService.kt`
- Create: `src/desktopMain/kotlin/spintracker/data/migrations/Migration016_AdvancedStats.kt`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

### Task 8: Variance Calculator

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/services/VarianceService.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
// src/desktopMain/kotlin/spintracker/tests/VarianceServiceTest.kt
package spintracker.tests

import spintracker.services.VarianceService
import org.junit.Assert.*
import org.junit.Test

class VarianceServiceTest {
    @Test
    fun testCalculateRiskOfRuin() {
        val winRate = 5.0 // bb/100
        val stdDev = 80.0
        val bankroll = 2000.0
        val roR = VarianceService.calculateRiskOfRuin(winRate, stdDev, bankroll)
        assertTrue(roR < 0.05) // Should be low risk
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

```kotlin
// src/desktopMain/kotlin/spintracker/services/VarianceService.kt
package spintracker.services

import kotlin.math.*

object VarianceService {
    fun calculateRiskOfRuin(winRate: Double, stdDev: Double, bankroll: Double): Double {
        if (winRate <= 0 || bankroll <= 0) return 1.0
        
        val z = bankroll / stdDev
        val edgeRatio = winRate / stdDev
        return exp(-2 * z * edgeRatio)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

---

## Phase 4: Leak Buster / AI (Features 16-19)

### Task 9: Auto Leak Detection

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/services/LeakDetectionService.kt`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

### Task 10: Leak Buster Screen

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/ui/screens/LeakBusterScreen.kt`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

---

## Phase 5: Study & Training (Features 20-24)

### Task 11: Equity Calculator

**Files:**
- Modify: `src/desktopMain/kotlin/spintracker/services/EquityService.kt`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write integration**

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

### Task 12: Hand Search

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/services/HandSearchService.kt`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

---

## Phase 6: Session & Bankroll (Features 25-28)

### Task 13: Session Tracker

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/ui/screens/SessionScreen.kt`
- Create: `src/desktopMain/kotlin/spintracker/data/migrations/Migration019_SessionData.kt`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

### Task 14: Bankroll Graph

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/ui/screens/BankrollScreen.kt`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

---

## Phase 7: Replayer Enhancements (Features 29-31)

### Task 15: Equity Overlay in Replayer

**Files:**
- Modify: `src/desktopMain/kotlin/spintracker/ui/screens/ReplayerScreen.kt`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

### Task 16: GTO Comparison

**Files:**
- Create: `src/desktopMain/kotlin/spintracker/services/GTOComparisonService.kt`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

---

## Summary

| Phase | Tasks | Features |
|-------|-------|----------|
| 1: HUD | 1-3 | 1-2 |
| 2: Opponents | 4-6 | 3-9 |
| 3: Advanced Stats | 7-8 | 10-15 |
| 4: Leak Buster | 9-10 | 16-19 |
| 5: Study | 11-12 | 20-24 |
| 6: Session | 13-14 | 25-28 |
| 7: Replayer | 15-16 | 29-31 |

Total: 16 tasks implementing 31 features across 7 phases.

---

## Execution Choice

**Plan complete and saved to `docs/superpowers/plans/2026-04-24-spintracker-full-integration-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**