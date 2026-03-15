using FluentMigrator;

namespace SpinTrackerBackend.Migrations;

[Migration(2026031501)]
public class AddTournamentPosition : Migration
{
    public override void Up()
    {
        Execute.Sql(@"
            ALTER TABLE player_hands ADD COLUMN tournament_position INTEGER
        ");
    }

    public override void Down()
    {
        Execute.Sql(@"
            DROP COLUMN IF EXISTS tournament_position
        ");
    }
}
