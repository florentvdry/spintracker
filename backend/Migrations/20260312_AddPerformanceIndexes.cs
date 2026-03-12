using FluentMigrator;

namespace SpinTrackerBackend.Migrations;

[Migration(20260312_001)]
public class AddPerformanceIndexes : Migration
{
    public override void Up()
    {
        Execute.Sql("CREATE INDEX IF NOT EXISTS idx_hands_date_time ON hands(date_time)");
        Execute.Sql("CREATE INDEX IF NOT EXISTS idx_hands_room ON hands(room)");
        Execute.Sql("CREATE INDEX IF NOT EXISTS idx_hands_game_id ON hands(game_id)");
        Execute.Sql("CREATE INDEX IF NOT EXISTS idx_player_hands_player_name ON player_hands(player_name)");
        Execute.Sql("CREATE INDEX IF NOT EXISTS idx_player_hands_hand_id ON player_hands(hand_id)");
        Execute.Sql("CREATE INDEX IF NOT EXISTS idx_player_hands_position ON player_hands(position)");
    }

    public override void Down()
    {
        Execute.Sql("DROP INDEX IF EXISTS idx_hands_date_time");
        Execute.Sql("DROP INDEX IF EXISTS idx_hands_room");
        Execute.Sql("DROP INDEX IF EXISTS idx_hands_game_id");
        Execute.Sql("DROP INDEX IF EXISTS idx_player_hands_player_name");
        Execute.Sql("DROP INDEX IF EXISTS idx_player_hands_hand_id");
        Execute.Sql("DROP INDEX IF EXISTS idx_player_hands_position");
    }
}
