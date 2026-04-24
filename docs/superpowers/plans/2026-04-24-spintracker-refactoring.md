# SpinTracker Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the SpinTracker application to follow good practices, remove API client dependencies, and improve maintainability.

**Architecture:** Remove ApiClient and all API-related code, consolidate database management to local-only operations, clean up unused imports and code, ensure all references to API are removed or replaced with local equivalents.

**Tech Stack:** Kotlin, Jetpack Compose for Desktop, SQLite, kotlinx.coroutines

---

## File Structure Overview

**Files to Delete:**
- `src/desktopMain/kotlin/spintracker/services/ApiClient.kt` - API client (not needed)

**Files to Modify:**
- `src/desktopMain/kotlin/spintracker/data/AppState.kt` - Remove ApiClient usage and API methods
- `src/desktopMain/kotlin/spintracker/ui/screens/SettingsScreen.kt` - Remove API version check

**Files to Review for Cleanup:**
- All service files for unused imports
- All UI files for dead code related to API

**Keep As-Is (Core Functionality):**
- Database layer: `data/Database.kt`, `data/migrations/*`
- Repositories: `data/*Repository.kt`
- Models: `models/*.kt`
- Parsers: `parsers/*.kt`
- Services: `services/*.kt` (except ApiClient)
- UI screens and components

---

### Task 1: Remove ApiClient.kt File

**Files:**
- Delete: `src/desktopMain/kotlin/spintracker/services/ApiClient.kt`

- [ ] **Step 1: Verify ApiClient is only used in AppState.kt and SettingsScreen.kt**

Run: `grep -r "ApiClient" src/desktopMain/kotlin/ --include="*.kt"`
Expected: Only AppState.kt imports and uses ApiClient

- [ ] **Step 2: Delete the ApiClient.kt file**

Run: `rm src/desktopMain/kotlin/spintracker/services/ApiClient.kt`
Expected: File deleted successfully

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove ApiClient.kt - switching to local-only database operations"
```

---

### Task 2: Update AppState.kt - Remove ApiClient Dependencies

**Files:**
- Modify: `src/desktopMain/kotlin/spintracker/data/AppState.kt`

- [ ] **Step 1: Read current AppState.kt to understand all API usages**

Already done - ApiClient is used for:
- `checkServerStatus()` (line 64)
- `getAppVersion()` (line 68 - already returns local "1.0.0")
- `getDatabases()` (line 72)
- `createDatabase()` (line 76)
- `setActiveDatabase()` (line 80)
- `deleteDatabase()` (line 84)
- `renameDatabase()` (line 88)
- `exportData()` (line 105)

- [ ] **Step 2: Remove ApiClient import and instance**

Remove these lines:
```kotlin
import spintracker.services.ApiClient
import spintracker.services.DatabaseInfo
```

Remove this line:
```kotlin
val apiClient = ApiClient()
```

- [ ] **Step 3: Remove or refactor API methods**

Remove these methods entirely (they won't be needed):
- `suspend fun checkServerStatus(): Boolean`
- `suspend fun getDatabases(): List<DatabaseInfo>`
- `suspend fun createDatabase(name: String): Result<DatabaseInfo>`
- `suspend fun setActiveDatabase(id: String): Result<Unit>`
- `suspend fun deleteDatabase(id: String): Result<Unit>`
- `suspend fun renameDatabase(id: String, name: String): Result<Unit>`

Keep `getAppVersion()` but make it non-suspend and return constant:
```kotlin
fun getAppVersion(): String {
    return "1.0.0"
}
```

Change `exportData()` to use local implementation:
```kotlin
fun exportData(): Result<String> {
    return exportDataLocal()
}
```

- [ ] **Step 4: Verify the file compiles**

Run: `./gradlew compileKotlin`
Expected: Compilation succeeds without errors

- [ ] **Step 5: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/data/AppState.kt
git commit -m "refactor: remove ApiClient dependencies from AppState"
```

---

### Task 3: Update SettingsScreen.kt - Remove API Version Check

**Files:**
- Modify: `src/desktopMain/kotlin/spintracker/ui/screens/SettingsScreen.kt`

- [ ] **Step 1: Read current SettingsScreen.kt to find API usage**

Line 55: `appVersion = appState.apiClient.getAppVersion()`

- [ ] **Step 2: Update loadVersion function**

Change from:
```kotlin
suspend fun loadVersion() {
    appVersion = appState.apiClient.getAppVersion()
}
```

To:
```kotlin
fun loadVersion() {
    appVersion = appState.getAppVersion()
}
```

- [ ] **Step 3: Remove unused imports**

Check for and remove:
- `import spintracker.services.DatabaseInfo` (if only used for API)

- [ ] **Step 4: Verify the file compiles**

Run: `./gradlew compileKotlin`
Expected: Compilation succeeds without errors

- [ ] **Step 5: Commit**

```bash
git add src/desktopMain/kotlin/spintracker/ui/screens/SettingsScreen.kt
git commit -m "refactor: update SettingsScreen to use local version check"
```

---

### Task 4: Clean Up Unused Imports Across Project

**Files:**
- All Kotlin files in `src/desktopMain/kotlin/spintracker/`

- [ ] **Step 1: Find files with unused imports**

Run: `./gradlew compileKotlin --warning-mode all 2>&1 | grep "unused"`
Or manually check files with IDE

- [ ] **Step 2: Check for common unused import patterns**

Search for these potentially unused imports:
- `kotlinx.coroutines.*` in UI files that don't use suspend functions
- `java.net.*` or `java.io.*` not actually used
- Any import related to API/HTTP

- [ ] **Step 3: Remove unused imports from each file**

Use IDE auto-optimize or manually remove

- [ ] **Step 4: Verify compilation**

Run: `./gradlew compileKotlin`
Expected: No warnings or errors

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "cleanup: remove unused imports across project"
```

---

### Task 5: Remove Dead Code and Unused Files

**Files:**
- Review all files in `src/desktopMain/kotlin/spintracker/`

- [ ] **Step 1: Check for unused service methods**

Review each service file for methods that are never called:
- Look for `@Suppress("UNUSED")` or IDE warnings
- Check for public methods with no callers

- [ ] **Step 2: Check for unused UI components**

Review `ui/components/` for components not used in any screen:
```bash
grep -r "ComponentName" src/desktopMain/kotlin/spintracker/ui/screens/ --include="*.kt"
```

- [ ] **Step 3: Check for unused test files**

Review `tests/` directory - keep all tests even if they seem unused (they may be manual tests)

- [ ] **Step 4: Remove truly unused files**

Only remove files that are:
- Clearly marked as deprecated
- Have no references anywhere in the codebase
- Are duplicates or old versions

- [ ] **Step 5: Verify compilation and tests**

Run: `./gradlew compileKotlin`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "cleanup: remove dead code and unused files"
```

---

### Task 6: Verify DatabaseInfo Usage

**Files:**
- Check if `DatabaseInfo` data class is still needed

- [ ] **Step 1: Search for DatabaseInfo usage**

Run: `grep -r "DatabaseInfo" src/desktopMain/kotlin/ --include="*.kt"`

- [ ] **Step 2: Determine if DatabaseInfo should be kept or removed**

If only used by API code being removed:
- Remove the data class from wherever it's defined (likely in models or services)

If used locally:
- Keep it and ensure it's in the right package

- [ ] **Step 3: Move DatabaseInfo if needed**

If kept, move to appropriate location:
- Likely `models/Models.kt` or keep in `data/Database.kt`

- [ ] **Step 4: Update imports**

Update all files that use DatabaseInfo to import from new location

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: reorganize DatabaseInfo data class"
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
./gradlew testMigration014
./gradlew testPlayerTyping
./gradlew testHUD
./gradlew testReplayerEquity
./gradlew testGTOComparison
```
Expected: All tests pass

- [ ] **Step 3: Build the application**

Run: `./gradlew composeRun`
Expected: Application starts without errors

- [ ] **Step 4: Verify Settings screen works**

Manually test:
- Version number displays
- Database info shows
- Export works
- Delete all works

- [ ] **Step 5: Verify no API references remain**

Run: `grep -r "apiClient\|ApiClient\|http://localhost:5000" src/ --include="*.kt"`
Expected: No results

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: verify refactoring complete - all tests passing"
```

---

## Post-Refactoring Checklist

After all tasks complete:

- [ ] No references to ApiClient remain
- [ ] No references to remote API remain
- [ ] All database operations are local
- [ ] Application compiles without errors
- [ ] All existing tests pass
- [ ] Application runs correctly
- [ ] Settings screen displays version correctly
- [ ] Database export/delete functions work
- [ ] No unused imports
- [ ] Code follows consistent style

---

## Notes for Implementation

1. **DatabaseInfo handling**: The `DatabaseInfo` data class is defined in ApiClient.kt. Before deleting ApiClient.kt, either:
   - Move DatabaseInfo to `models/Models.kt` or `data/Database.kt`
   - Or remove it entirely if not needed for local operations

2. **Version string**: The `getAppVersion()` currently returns "1.0.0-local" as a fallback. After removing API, this should just return a constant or read from a version file.

3. **Export functionality**: The `exportData()` method in AppState currently calls API. It already has a local alternative `exportDataLocal()` - just redirect to use that.

4. **Settings screen**: The `loadVersion()` function is marked suspend but doesn't need to be after removing API call.

5. **Be conservative**: When in doubt about whether code is unused, keep it. Better to have slightly more code than to break functionality.
