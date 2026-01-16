using FluentMigrator;

namespace SpinTrackerBackend.Migrations;

[Migration(20260116_001)]
public class DropConfigTable20260116 : Migration
{
    public override void Up()
    {
        Execute.Sql("DROP TABLE IF EXISTS config");
    }

    public override void Down()
    {
        Execute.Sql(@"
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        ");
    }
}