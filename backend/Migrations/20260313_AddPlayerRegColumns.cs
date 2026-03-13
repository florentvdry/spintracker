using FluentMigrator;

namespace SpinTrackerBackend.Migrations;

[Migration(20260313_001)]
public class AddPlayerRegColumns : Migration
{
    public override void Up()
    {
        Execute.Sql(@"
            CREATE TABLE IF NOT EXISTS players_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                total_hands INTEGER DEFAULT 0,
                total_profit REAL DEFAULT 0,
                total_ev_profit REAL DEFAULT 0,
                is_reg INTEGER DEFAULT 0,
                is_reg_forced INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ");
        
        Execute.Sql(@"
            INSERT INTO players_new (id, name, total_hands, total_profit, total_ev_profit, created_at, updated_at)
            SELECT id, name, total_hands, total_profit, total_ev_profit, created_at, updated_at
            FROM players
        ");
        
        Execute.Sql("DROP TABLE IF EXISTS players");
        Execute.Sql("ALTER TABLE players_new RENAME TO players");
    }

    public override void Down()
    {
    }
}
