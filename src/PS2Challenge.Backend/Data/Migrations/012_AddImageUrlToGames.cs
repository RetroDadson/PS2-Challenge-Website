using FluentMigrator;

namespace PS2Challenge.Backend.Data.Migrations;

[Migration(12)]
public class AddImageUrlToGames : Migration
{
    private const string GamesTable = "games";

    public override void Up()
    {
        Alter.Table(GamesTable)
            .AddColumn("image_url").AsString(500).Nullable();

        // Create index for faster lookups when filtering by games with/without covers
        Create.Index("idx_games_image_url")
            .OnTable(GamesTable)
            .OnColumn("image_url");
    }

    public override void Down()
    {
        Delete.Index("idx_games_image_url").OnTable(GamesTable);
        
        Delete.Column("image_url")
            .FromTable(GamesTable);
    }
}
