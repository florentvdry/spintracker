using FluentMigrator;

namespace SpinTrackerBackend.Migrations;

[Migration(20260525_001)]
public class OptimizeIndexes : Migration
{
    public override void Up()
    {
        // Drop duplicate single-column indexes from AddPerformanceIndexes migration
        // The initial migration already created indexes on these columns, so these
        // are redundant and add write overhead without query benefit.
        Execute.Sql("DROP INDEX IF EXISTS idx_hands_date_time");
        Execute.Sql("DROP INDEX IF EXISTS idx_player_hands_player_name");
        Execute.Sql("DROP INDEX IF EXISTS idx_player_hands_hand_id");

        // Composite index for hero name lookups with JOINs
        // Most queries JOIN hands h ON player_hands ph WHERE ph.player_name IN (...)
        // A composite (player_name, hand_id) enables index-only scans for the JOIN
        Execute.Sql("CREATE INDEX IF NOT EXISTS idx_player_hands_name_hand_id ON player_hands(player_name, hand_id)");

        // Composite index for date-range queries with player_count filter
        // All dashboard/stats queries filter: h.player_count <= 3 AND h.date_time BETWEEN ...
        Execute.Sql("CREATE INDEX IF NOT EXISTS idx_hands_date_player_count ON hands(date_time, player_count)");
    }

    public override void Down()
    {
        Execute.Sql("DROP INDEX IF EXISTS idx_player_hands_name_hand_id");
        Execute.Sql("DROP INDEX IF EXISTS idx_hands_date_player_count");
        // Restore the dropped duplicates (safe to re-create)
        Execute.Sql("CREATE INDEX IF NOT EXISTS idx_hands_date_time ON hands(date_time)");
        Execute.Sql("CREATE INDEX IF NOT EXISTS idx_player_hands_player_name ON player_hands(player_name)");
        Execute.Sql("CREATE INDEX IF NOT EXISTS idx_player_hands_hand_id ON player_hands(hand_id)");
    }
}
