using FluentMigrator;

namespace SpinTrackerBackend.Migrations
{
    [Migration(202604040001)]
    public class AddStructuredActionsAndNewColumns : Migration
    {
        public override void Up()
        {
            Alter.Table("hands")
                .AddColumn("limit_type").AsString(10).Nullable()
                .AddColumn("game_variant").AsString(20).Nullable()
                .AddColumn("currency").AsString(10).Nullable()
                .AddColumn("button_seat").AsInt32().Nullable()
                .AddColumn("ante").AsDouble().Nullable()
                .AddColumn("tournament_id").AsString(50).Nullable()
                .AddColumn("tournament_name").AsString(100).Nullable()
                .AddColumn("tournament_level").AsInt32().Nullable()
                .AddColumn("buyin_currency").AsString(10).Nullable()
                .AddColumn("rake_per_player").AsDouble().Nullable()
                .AddColumn("structured_actions").AsString(50000).Nullable();
        }

        public override void Down()
        {
            Delete.Column("structured_actions").FromTable("hands");
            Delete.Column("rake_per_player").FromTable("hands");
            Delete.Column("buyin_currency").FromTable("hands");
            Delete.Column("tournament_level").FromTable("hands");
            Delete.Column("tournament_name").FromTable("hands");
            Delete.Column("tournament_id").FromTable("hands");
            Delete.Column("ante").FromTable("hands");
            Delete.Column("button_seat").FromTable("hands");
            Delete.Column("currency").FromTable("hands");
            Delete.Column("game_variant").FromTable("hands");
            Delete.Column("limit_type").FromTable("hands");
        }
    }
}