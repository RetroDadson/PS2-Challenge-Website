using FluentMigrator;

namespace PS2Challenge.Backend.Data.Migrations;

[Migration(12)]
public class AddImageUrlToGames : Migration
{
    public override void Up()
    {
        Alter.Table("games")
            .AddColumn("image_url").AsString(500).Nullable();

        // Create index for faster lookups when filtering by games with/without covers
        Create.Index("idx_games_image_url")
            .OnTable("games")
            .OnColumn("image_url");
    }

    public override void Down()
    {
        Delete.Index("idx_games_image_url").OnTable("games");
        
        Delete.Column("image_url")
            .FromTable("games");
    }
}
