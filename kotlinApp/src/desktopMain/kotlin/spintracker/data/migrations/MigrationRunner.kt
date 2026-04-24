package spintracker.data.migrations

import java.sql.Connection
import java.sql.DriverManager

class MigrationRunner(private val connectionString: String) {
    
    fun runPending(migrations: List<Migration>) {
        val conn = DriverManager.getConnection(connectionString)
        try {
            conn.autoCommit = false
            
            ensureMigrationTable(conn)
            
            val appliedVersions = getAppliedVersions(conn)
            val pendingMigrations = migrations
                .filter { it.version !in appliedVersions }
                .sortedBy { it.version }
            
            for (migration in pendingMigrations) {
                println("Applying migration ${migration.version}: ${migration.description}")
                migration.migrate(conn)
                recordMigration(conn, migration)
            }
            
            conn.commit()
            println("All pending migrations applied successfully")
        } catch (e: Exception) {
            conn.rollback()
            throw e
        } finally {
            conn.close()
        }
    }
    
    private fun ensureMigrationTable(conn: Connection) {
        conn.createStatement().execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                description TEXT NOT NULL,
                applied_at TEXT NOT NULL
            )
        """)
    }
    
    private fun getAppliedVersions(conn: Connection): Set<Int> {
        val versions = mutableSetOf<Int>()
        val rs = conn.createStatement().executeQuery("SELECT version FROM schema_migrations")
        while (rs.next()) {
            versions.add(rs.getInt(1))
        }
        return versions
    }
    
    private fun recordMigration(conn: Connection, migration: Migration) {
        val stmt = conn.prepareStatement(
            "INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, datetime('now'))"
        )
        stmt.setInt(1, migration.version)
        stmt.setString(2, migration.description)
        stmt.executeUpdate()
    }
}
