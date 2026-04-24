# HUD Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the HUD (Heads-Up Display) implementation from the SpinTracker application including all related code, database tables, migrations, and UI components.

**Architecture:** Delete HUD component files, remove HUD-related database migrations and settings, remove HUD usage from SpinTrackerApp.kt and SettingsScreen.kt, clean up related test files, and verify the application compiles and runs without HUD functionality.

**Tech Stack:** Kotlin, Jetpack Compose for Desktop, SQLite

---

## File Structure Overview

**Files to Delete:**
- `src/desktopMain/kotlin/spintracker/ui/components/HUD.kt` - HUD component
- `src/desktopMain/kotlin/spintracker/tests/HUDComponentTest.kt` - HUD test
- `src/desktopMain/kotlin/spintracker/tests/Migration014Test.kt` - Migration 014 test (HUD-specific)
- `src/desktopMain/kotlin/spintracker/data/migrations/Migration014_HUD.kt` - HUD migration

**Files to Modify:**
- `src/desktopMain/kotlin/spintracker/ui/SpinTrackerApp.kt` - Remove HUD overlay usage
- `src/desktopMain/kotlin/spintracker/ui/screens/SettingsScreen.kt` - Remove HUD config section
- `src/desktopMain/kotlin/spintracker/data/Database.kt` - Remove HUD settings methods and migration registration
- `src/desktopMain/kotlin/spintracker/data/migrations/Migration013_PT4ParityLowPriority.kt` - Remove HUD config insert (if present)

**Files to Keep:**
- `Migration004_ActionFlags.kt` - Keep (action flags used for other purposes)
- `Migration007_StatsCache.kt` - Keep (stats cache used for other purposes)

---

### Task 1: Delete HUD Component Files

**Files:**
- Delete: `src/desktopMain/kotlin/spintracker/ui/components/HUD.kt`
- Delete: `src/desktopMain/kotlin/spintracker/tests/HUDComponentTest.kt`

- [ ] **Step 1: Verify HUD component files exist**

Run: `ls src/desktopMain/kotlin/spintracker/ui/components/HUD.kt`
Expected: File exists

Run: `ls src/desktopMain/kotlin/spintracker/tests/HUDComponentTest.kt`
Expected: File exists

- [ ] **Step 2: Delete HUD.kt component file**

Run: `rm src/desktopMain/kotlin/spintracker/ui/components/HUD.kt`
Expected: File deleted successfully

- [ ] **Step 3: Delete HUDComponentTest.kt test file**

Run: `rm src/desktopMain/kotlin/spintracker/tests/HUDComponentTest.kt`
Expected: File deleted successfully

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove HUD component files"
```

---

### Task 2: Delete HUD Migration and Test Files

**Files:**
- Delete: `src/desktopMain/kotlin/spintracker/data/migrations/Migration014_HUD.kt`
- Delete: `src/desktopMain/kotlin/spintracker/tests/Migration014Test.kt`

- [ ] **Step 1: Verify migration files exist**

Run: `ls src/desktopMain/kotlin/spintracker/data/migrations/Migration014_HUD.kt`
Expected: File exists

Run: `ls src/desktopMain/kotlin/spintracker/tests/Migration014Test.kt`
Expected: File exists

- [ ] **Step 2: Delete Migration014_HUD.kt**

Run: `rm src/desktopMain/kotlin/spintracker/data/migrations/Migration014_HUD.kt`
Expected: File deleted successfully

- [ ] **Step 3: Delete Migration014Test.kt**

Run: `rm src/desktopMain/kotlin/spintracker/tests/Migration014Test.kt`
Expected: File deleted successfully

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove HUD migration and test files"
```

---

### Task 3: Update SpinTrackerApp.kt - Remove HUD Overlay

**Files:**
- Modify: `src/desktopMain/kotlin/spintracker/ui/SpinTrackerApp.kt`

- [ ] **Step 1: Read current SpinTrackerApp.kt to find HUD usages**

Current HUD-related code (lines ~21-22, ~55-68, ~280-283):
```kotlin
import spintracker.ui.components.HUDOverlay
import spintracker.ui.components.HUDState

var showHUD by remember { mutableStateOf(false) }
var hudOpacity by remember { mutableStateOf(0.9f) }
var hudPosition by remember { mutableStateOf(spintracker.ui.components.HUDPosition.TOP_RIGHT) }
// ... loading HUD settings from database

// HUD Overlay
HUDOverlay(
    state = HUDState(visible = showHUD, opacity = hudOpacity, position = hudPosition),
    onClose = { showHUD = false }
)
```

- [ ] **Step 2: Remove HUD imports**

Remove these lines:
```kotlin
import spintracker.ui.components.HUDOverlay
import spintracker.ui.components.HUDState
```

- [ ] **Step 3: Remove HUD state variables**

Remove these lines:
```kotlin
var showHUD by remember { mutableStateOf(false) }
var hudOpacity by remember { mutableStateOf(0.9f) }
var hudPosition by remember { mutableStateOf(spintracker.ui.components.HUDPosition.TOP_RIGHT) }
```

- [ ] **Step 4: Remove HUD settings loading code**

Remove the LaunchedEffect that loads HUD settings (approximately lines 60-70):
```kotlin
LaunchedEffect(Unit) {
    val settings = appState.database.getHUDSettings()
    showHUD = settings?.showHUD ?: false
    hudOpacity = settings?.opacity?.toFloat() ?: 0.9f
    hudPosition = when (settings?.position) {
        "TOP_LEFT" -> spintracker.ui.components.HUDPosition.TOP_LEFT
        "TOP_RIGHT" -> spintracker.ui.components.HUDPosition.TOP_RIGHT
        "BOTTOM_LEFT" -> spintracker.ui.components.HUDPosition.BOTTOM_LEFT
        "BOTTOM_RIGHT" -> spintracker.ui.components.HUDPosition.BOTTOM_RIGHT
        else -> spintracker.ui.components.HUDPosition.TOP_RIGHT
    }
}
```

- [ ] **Step 5: Remove HUDOverlay composable**

Remove the HUD Overlay section (approximately lines 280-283):
```kotlin
// HUD Overlay
HUDOverlay(
    state = HUDState(visible = showHUD, opacity = hudOpacity, position = hudPosition),
    onClose = { showHUD = false }
)
```

- [ ] **Step 6: Verify compilation**

Run: `./gradlew compileKotlin`
Expected: BUILD SUCCESSFUL (no references to HUDOverlay or HUDState)

- [ ] **Step 7: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/ui/SpinTrackerApp.kt
git commit -m "refactor: remove HUD overlay from SpinTrackerApp"
```

---

### Task 4: Update SettingsScreen.kt - Remove HUD Config Section

**Files:**
- Modify: `src/desktopMain/kotlin/spintracker/ui/screens/SettingsScreen.kt`

- [ ] **Step 1: Read current SettingsScreen.kt to find HUD usages**

Current HUD-related code:
- Line 109: `HUDConfigSection(...)` call
- Lines 250-380: `HUDConfigSection` composable function

- [ ] **Step 2: Remove HUDConfigSection call from Settings screen**

Remove line 109 and surrounding spacing:
```kotlin
HUDConfigSection(
    appState = appState,
    refreshKey = refreshKey,
    onSettingsSaved = onRefresh
)

Spacer(modifier = Modifier.height(24.dp))
```

- [ ] **Step 3: Remove HUDConfigSection composable function**

Remove the entire function (approximately lines 250-380):
```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HUDConfigSection(
    appState: AppState,
    refreshKey: Int,
    onSettingsSaved: () -> Unit
) {
    // ... entire function body ...
}
```

- [ ] **Step 4: Remove unused imports**

Check for and remove any imports only used by HUDConfigSection:
- `import androidx.compose.material3.ExperimentalMaterial3Api` (if only used for HUDConfigSection)
- `import androidx.compose.material3.Slider` (if only used for HUDConfigSection)
- `import androidx.compose.material3.SliderDefaults` (if only used for HUDConfigSection)
- `import androidx.compose.material3.FilterChip` (if only used for HUDConfigSection)
- `import androidx.compose.material3.FilterChipDefaults` (if only used for HUDConfigSection)

- [ ] **Step 5: Verify compilation**

Run: `./gradlew compileKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 6: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/ui/screens/SettingsScreen.kt
git commit -m "refactor: remove HUD config section from SettingsScreen"
```

---

### Task 5: Update Database.kt - Remove HUD Settings Methods and Migration

**Files:**
- Modify: `src/desktopMain/kotlin/spintracker/data/Database.kt`

- [ ] **Step 1: Read Database.kt to find HUD-related code**

Current HUD-related code:
- Line 53: `Migration014_HUD()` registration
- Lines 1746-1800: `HUDSettings` data class and methods

- [ ] **Step 2: Remove Migration014_HUD registration**

Find and remove this line from the migrations list:
```kotlin
Migration014_HUD()
```

- [ ] **Step 3: Remove HUDSettings data class**

Remove the data class (approximately lines 1746-1753):
```kotlin
data class HUDSettings(
    val id: Int,
    val showHUD: Boolean,
    val opacity: Double,
    val position: String,
    val fontSize: Int,
    val showStats: String
)
```

- [ ] **Step 4: Remove getHUDSettings() method**

Remove the method (approximately lines 1755-1779):
```kotlin
fun getHUDSettings(): HUDSettings? {
    // ... entire method ...
}
```

- [ ] **Step 5: Remove saveHUDSettings() method**

Remove the method (approximately lines 1781-1800):
```kotlin
fun saveHUDSettings(settings: HUDSettings) {
    // ... entire method ...
}
```

- [ ] **Step 6: Verify compilation**

Run: `./gradlew compileKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 7: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/data/Database.kt
git commit -m "refactor: remove HUD settings from Database.kt"
```

---

### Task 6: Clean Up Migration013 - Remove HUD Config Insert

**Files:**
- Modify: `src/desktopMain/kotlin/spintracker/data/migrations/Migration013_PT4ParityLowPriority.kt`

- [ ] **Step 1: Read Migration013 to find HUD config insert**

Current code (line 38):
```kotlin
"INSERT OR IGNORE INTO config (key, value, category, is_system) VALUES ('hud.refresh_ms', '1000', 'hud', 1)"
```

- [ ] **Step 2: Remove the HUD config insert line**

Remove this line from the migration:
```kotlin
"INSERT OR IGNORE INTO config (key, value, category, is_system) VALUES ('hud.refresh_ms', '1000', 'hud', 1)"
```

- [ ] **Step 3: Verify compilation**

Run: `./gradlew compileKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/data/migrations/Migration013_PT4ParityLowPriority.kt
git commit -m "refactor: remove HUD config from Migration013"
```

---

### Task 7: Final Verification and Testing

**Files:**
- Entire project

- [ ] **Step 1: Full compilation**

Run: `./gradlew compileKotlin`
Expected: No errors or warnings

- [ ] **Step 2: Run all tests**

Run:
```bash
./gradlew testImport
./gradlew testEquity
./gradlew testMigration
./gradlew testPlayerTyping
./gradlew testReplayerEquity
./gradlew testGTOComparison
```
Expected: All tests pass (note: testMigration014 and testHUD are deleted)

- [ ] **Step 3: Verify no HUD references remain**

Run: `grep -r "HUD\|hud\|HUDOverlay\|HUDState\|HUDSettings\|hud_settings" src/ --include="*.kt"`
Expected: No results (or only comments mentioning "HUD" in passing)

- [ ] **Step 4: Verify no Migration014 references remain**

Run: `grep -r "Migration014" src/ --include="*.kt"`
Expected: No results

- [ ] **Step 5: Check git status**

Run: `git status`
Expected: Clean working tree

- [ ] **Step 6: Final commit if needed**

```bash
git add -A
git commit -m "chore: verify HUD removal complete - all tests passing"
```

---

## Post-Removal Checklist

After all tasks complete:

- [ ] No references to HUD, HUDOverlay, HUDState, or HUDSettings remain
- [ ] No references to Migration014 remain
- [ ] No references to hud_settings table remain
- [ ] Application compiles without errors
- [ ] All remaining tests pass
- [ ] Application runs correctly without HUD
- [ ] Settings screen displays without HUD config section
- [ ] SpinTrackerApp renders without HUD overlay
- [ ] No unused imports
- [ ] Code follows consistent style

---

## Notes for Implementation

1. **Database migration:** The `hud_settings` table will remain in existing databases but will be ignored. This is acceptable - no need for a migration to drop the table since it won't be accessed.

2. **Migration numbering:** After removing Migration014, the migration sequence will have a gap. This is acceptable - migrations don't need to be renumbered.

3. **SpinTrackerApp.kt:** The HUD overlay was rendered on top of the main content. After removal, the app should render normally without any overlay.

4. **SettingsScreen.kt:** The HUD config section was a significant portion of the file. After removal, the settings screen will have fewer sections (General, Database, Maintenance, About).

5. **Be thorough:** Search for all variations: HUD, Hud, hud, HUDOverlay, HUDState, HUDSettings, HUDPosition, hud_settings.
