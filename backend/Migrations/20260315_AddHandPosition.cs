using FluentMigrator;

namespace SpinTrackerBackend.Migrations
{
    [Migration(202603151932)]
    public class AddHandPosition : Migration
    {
        public override void Up()
        {
            Alter.Table("hands").AddColumn("position").AsInt32().WithDefaultValue(0);
        }

        public override void Down()
        {
            Delete.Column("position").FromTable("hands");
        }
    }
}
