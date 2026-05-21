using FluentMigrator;

namespace SpinTrackerBackend.Migrations;

[Migration(202605200001)]
public class AddAliasesTable : Migration
{
    public override void Up()
    {
        Create.Table("aliases")
            .WithColumn("id").AsInt32().PrimaryKey().Identity()
            .WithColumn("name").AsString().Unique().NotNullable()
            .WithColumn("created_at").AsDateTime().WithDefault(SystemMethods.CurrentDateTime);

        Alter.Table("players").AddColumn("alias_id").AsInt32().Nullable().ForeignKey("aliases", "id");
    }

    public override void Down()
    {
        Delete.ForeignKey("FK_players_alias_id_aliases_id").OnTable("players");
        Delete.Column("alias_id").FromTable("players");
        Delete.Table("aliases");
    }
}
