# Adding New Stats Without Re-Import

When adding a new stat column, follow this process to ensure existing hands get recalculated automatically.

## Quick Checklist

- [ ] 1. Create migration to add column(s)
- [ ] 2. Create backfill service (if stat needs hand history parsing)
- [ ] 3. Register backfill in Database.kt
- [ ] 4. Update PlayerHand model
- [ ] 5. Update import logic for new hands
- [ ] 6. Update StatsCacheRepository (if cached)

---

## Step 1: Add Migration (version N+1)

Create `Migration0XX_NewStatName.kt` in `src/desktopMain/kotlin/spintracker/data/migrations/`:

```kotlin
package spintracker.data.migrations

import java.sql.Connection

class Migration0XX_NewStatName : Migration {
    override val version = XX
    override val description = "Add new stat columns"
    
    override fun migrate(connection: Connection) {
        // Add column with default value
        // SQLite throws if column exists, so wrap in try/catch
        try {
            connection.createStatement().execute(
                "ALTER TABLE player_hands ADD COLUMN flg_new_stat INTEGER DEFAULT 0"
            )
        } catch (e: Exception) {
            println("Column may already exist: ${e.message}")
        }
        
        // Optional: backfill from existing columns if possible
        // This avoids needing a separate backfill service for simple stats
        connection.createStatement().execute("""
            UPDATE player_hands 
            SET flg_new_stat = CASE 
                WHEN <condition_from_existing_columns> THEN 1 
                ELSE 0 
            END
            WHERE flg_new_stat IS NULL
        """)
    }
}
```

Register in `Database.kt`:

```kotlin
val migrations = listOf(
    Migration001_InitialSchema(),
    // ... existing migrations ...
    Migration013_PT4ParityLowPriority(),
    Migration0XX_NewStatName()  // ← Add here
)
```

---

## Step 2: Create Backfill Service (if needed)

If the stat **cannot** be calculated from existing columns (needs raw hand history parsing), create a backfill service.

Create `BackfillNewStat.kt` in `src/desktopMain/kotlin/spintracker/data/migrations/Backfills/`:

```kotlin
package spintracker.data.migrations

import spintracker.data.Database
import spintracker.parsers.PokerStarsParser

class BackfillNewStat(database: Database) : StatsBackfillService(database) {
    override val configKey = "backfill_new_stat_completed"
    override val description = "New stat backfill"
    
    override fun runBackfill() {
        println("Starting ${description}...")
        
        var processed = 0
        val parser = PokerStarsParser() // or appropriate parser
        
        while (true) {
            val hands = getHandsNeedingBackfill("flg_new_stat")
            if (hands.isEmpty()) break
            
            database.useTransaction { conn ->
                for ((handId, history) in hands) {
                    val parsedHand = parser.parseHand(history)
                    if (parsedHand != null) {
                        for (player in parsedHand.players) {
                            val value = calculateNewStat(player, parsedHand)
                            
                            conn.prepareStatement("""
                                UPDATE player_hands 
                                SET flg_new_stat = ?
                                WHERE hand_id = ? AND player_name = ?
                            """).apply {
                                setInt(1, value)
                                setLong(2, handId)
                                setString(3, player.name)
                                executeUpdate()
                            }.close()
                        }
                    }
                    processed++
                }
            }
            
            println("Processed $processed hands...")
        }
        
        markCompleted()
        println("${description} complete! Total: $processed hands")
    }
    
    private fun calculateNewStat(player: ParsedPlayer, hand: ParsedHand): Int {
        // Your calculation logic here
        // Example for 5bet:
        return if (player.preflopAction?.contains("5-bet") == true ||
                   player.preflopAction?.contains("5bet") == true) 1 else 0
    }
}
```

---

## Step 3: Register Backfill in Database.kt

Add your backfill to the `runPendingBackfills()` method:

```kotlin
private fun runPendingBackfills() {
    val backfills = listOf(
        Backfill5betStats(this),      // existing example
        BackfillNewStat(this)         // ← Add yours here
    )
    
    for (backfill in backfills) {
        if (!backfill.isCompleted()) {
            println("Running backfill: ${backfill.description}")
            try {
                backfill.runBackfill()
            } catch (e: Exception) {
                println("Backfill failed: ${e.message}")
            }
        }
    }
}
```

---

## Step 4: Update PlayerHand Model

Add the field to `PlayerHand` data class in `src/desktopMain/kotlin/spintracker/models/Models.kt`:

```kotlin
data class PlayerHand(
    // ... existing fields ...
    val flgNewStat: Boolean = false,  // ← Add here
    // ...
)
```

---

## Step 5: Update Import Logic

In `ImportService.kt`, ensure new hands get the stat calculated during import.

Find where `PlayerHand` is created and add your stat calculation:

```kotlin
PlayerHand(
    // ... existing fields ...
    flgNewStat = calculateNewStat(player, parsedHand),
    // ...
)
```

Also update the `savePlayerHand` SQL in `Database.kt` to include the new column in INSERT statements.

---

## Step 6: Update StatsCacheRepository (if cached)

If the stat appears in cached stats:

1. Add to `CachedStats` data class:
```kotlin
data class CachedStats(
    // ... existing ...
    val newStat: Double,
)
```

2. Update `updateStats` method parameters and SQL

3. Update `refreshAllStats` calculation

---

## Testing

1. Create a test database with old schema
2. Import some hands
3. Run migration
4. Verify backfill runs and populates existing hands
5. Import new hand and verify stat is calculated

Example test in `src/desktopMain/kotlin/spintracker/tests/DatabaseMigrationTest.kt`:

```kotlin
@Test
fun testNewStatBackfill() {
    val db = Database(":memory:")
    
    // Import hands...
    // Run migration...
    // Verify backfill populated values
    
    val conn = db.getConnection()
    val rs = conn.createStatement().executeQuery(
        "SELECT COUNT(*) FROM player_hands WHERE flg_new_stat IS NOT NULL"
    )
    
    assertTrue(rs.next())
    assertTrue(rs.getInt(1) > 0)
    
    conn.close()
}
```

---

## Examples in Codebase

- **Migration example:** `Migration009_AdvancedStats.kt` - adds effective stack columns
- **Normal backfill:** `Backfills/Backfill5betStats.kt` - fills NULL values for new stat
- **Fix backfill:** `Backfills/BackfillFix5betStats.kt` - recalculates ALL values for buggy stat
- **Base class:** `StatsBackfillService.kt` - reusable backfill infrastructure

---

## Notes

- **Batch size:** Backfill processes 1000 hands at a time to avoid memory issues
- **Idempotent:** Backfills check `isCompleted()` before running
- **Transaction safe:** Each batch runs in a transaction
- **Progress logging:** Backfills log progress for user visibility
