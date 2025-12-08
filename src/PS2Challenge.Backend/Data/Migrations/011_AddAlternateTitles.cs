using FluentMigrator;

namespace PS2Challenge.Backend.Data.Migrations;

[Migration(11)]
public class AddAlternateTitles : Migration
{
    public override void Up()
    {
        Create.Table("alternate_titles")
            .WithColumn("alternate_title_id").AsInt32().PrimaryKey().Identity()
            .WithColumn("game_id").AsInt32().NotNullable()
                .ForeignKey("fk_alternate_titles_games", "games", "game_id").OnDelete(System.Data.Rule.Cascade)
            .WithColumn("title").AsString(150).NotNullable().Unique()
            .WithColumn("notes").AsString(500).Nullable();

        // Create index on game_id for faster lookups
        Create.Index("idx_alternate_titles_game_id")
            .OnTable("alternate_titles")
            .OnColumn("game_id");
    }

    public override void Down()
    {
        Delete.Index("idx_alternate_titles_game_id").OnTable("alternate_titles");
        Delete.Table("alternate_titles");
    }
}
