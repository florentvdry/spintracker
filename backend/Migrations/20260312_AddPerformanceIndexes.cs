using FluentMigrator;

namespace SpinTrackerBackend.Migrations;

[Migration(20260312_001)]
public class AddPerformanceIndexes : Migration
{
    public override void Up()
    {
        Create.Index("idx_hands_date_time")
            .OnTable("hands")
            .Column("date_time");

        Create.Index("idx_hands_room")
            .OnTable("hands")
            .Column("room");

        Create.Index("idx_hands_game_id")
            .OnTable("hands")
            .Column("game_id");

        Create.Index("idx_player_hands_player_name")
            .OnTable("player_hands")
            .Column("player_name");

        Create.Index("idx_player_hands_hand_id")
            .OnTable("player_hands")
            .Column("hand_id");

        Create.Index("idx_player_hands_position")
            .OnTable("player_hands")
            .Column("position");
    }

    public override void Down()
    {
        Delete.Index("idx_hands_date_time").OnTable("hands");
        Delete.Index("idx_hands_room").OnTable("hands");
        Delete.Index("idx_hands_game_id").OnTable("hands");
        Delete.Index("idx_player_hands_player_name").OnTable("player_hands");
        Delete.Index("idx_player_hands_hand_id").OnTable("player_hands");
        Delete.Index("idx_player_hands_position").OnTable("player_hands");
    }
}
