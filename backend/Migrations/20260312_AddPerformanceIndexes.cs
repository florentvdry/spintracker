using FluentMigrator;

namespace SpinTrackerBackend.Migrations;

[Migration(20260312_001)]
public class AddPerformanceIndexes : Migration
{
    public override void Up()
    {
        Create.Index("idx_hands_date_time")
            .OnTable("hands")
            .OnColumn("date_time");

        Create.Index("idx_hands_room")
            .OnTable("hands")
            .OnColumn("room");

        Create.Index("idx_hands_game_id")
            .OnTable("hands")
            .OnColumn("game_id");

        Create.Index("idx_player_hands_player_name")
            .OnTable("player_hands")
            .OnColumn("player_name");

        Create.Index("idx_player_hands_hand_id")
            .OnTable("player_hands")
            .OnColumn("hand_id");

        Create.Index("idx_player_hands_position")
            .OnTable("player_hands")
            .OnColumn("position");
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
