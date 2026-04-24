package spintracker.tests

import spintracker.data.migrations.Migration014_HUD
import java.io.File
import java.sql.DriverManager

fun main() {
    println("=== Migration014 HUD Test ===\n")
    
    val testDbPath = File(System.getProperty("java.io.tmpdir"), "spintracker_migration014_test_${System.currentTimeMillis()}.db").absolutePath
    val connectionString = "jdbc:sqlite:$testDbPath"
    
    try {
        println("Test 1: Verify hud_settings table is created...")
        val runner = spintracker.data.migrations.MigrationRunner(connectionString)
        runner.runPending(listOf(Migration014_HUD()))
        
        val conn = DriverManager.getConnection(connectionString)
        val rs = conn.createStatement().executeQuery(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='hud_settings'"
        )
        if (!rs.next()) {
            println("FAIL: hud_settings table was not created")
            System.exit(1)
        }
        rs.close()
        println("  PASS: hud_settings table exists")
        
        println("Test 2: Verify default HUD settings are inserted...")
        val rs2 = conn.createStatement().executeQuery(
            "SELECT show_hud, opacity, position FROM hud_settings WHERE id = 1"
        )
        if (!rs2.next()) {
            println("FAIL: Default HUD settings not found")
            System.exit(1)
        }
        val showHud = rs2.getInt("show_hud")
        val opacity = rs2.getDouble("opacity")
        val position = rs2.getString("position")
        rs2.close()
        
        if (showHud != 1 || opacity != 0.9 || position != "top_right") {
            println("FAIL: Default values incorrect (show_hud=$showHud, opacity=$opacity, position=$position)")
            System.exit(1)
        }
        println("  PASS: Default settings: show_hud=$showHud, opacity=$opacity, position=$position")
        
        conn.close()
        println("\n=== All Migration014 Tests Passed ===")
    } finally {
        File(testDbPath).delete()
    }
}
