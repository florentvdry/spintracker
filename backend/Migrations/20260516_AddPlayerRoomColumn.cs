using FluentMigrator;

namespace SpinTrackerBackend.Migrations;

[Migration(202605160001)]
public class AddPlayerRoomColumn : Migration
{
    public override void Up()
    {
        Alter.Table("players").AddColumn("room").AsString().Nullable();
        
        Execute.Sql(@"
            UPDATE players 
            SET room = (
                SELECT h.room 
                FROM hands h 
                JOIN player_hands ph ON h.id = ph.hand_id 
                WHERE ph.player_name = players.name AND h.room IS NOT NULL AND h.room != ''
                GROUP BY h.room 
                ORDER BY COUNT(*) DESC 
                LIMIT 1
            )
            WHERE room IS NULL
        ");
    }

    public override void Down()
    {
        Delete.Column("room").FromTable("players");
    }
}
