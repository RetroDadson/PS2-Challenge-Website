using FluentMigrator;

namespace PS2Challenge.Backend.Data;

[Migration(1)]
public class InitialSchema : Migration
{
    private const string PlatformTypesTable = "platform_types";
    private const string OwnershipTypesTable = "ownership_types";
    private const string GamesTable = "games";
    private const string GameIdColumn = "game_id";

    public override void Up()
    {
        // Create lookup tables for controlled vocabularies
        Create.Table(PlatformTypesTable)
            .WithColumn("platform").AsString(50).PrimaryKey();

        Create.Table(OwnershipTypesTable)
            .WithColumn("type_owned").AsString(50).PrimaryKey();

        // Seed initial values
        Insert.IntoTable(PlatformTypesTable).Row(new { platform = "Physical" });
        Insert.IntoTable(PlatformTypesTable).Row(new { platform = "Emulated" });

        Insert.IntoTable(OwnershipTypesTable).Row(new { type_owned = "Base" });
        Insert.IntoTable(OwnershipTypesTable).Row(new { type_owned = "Platinum" });

        // Create main tables
        Create.Table(GamesTable)
            .WithColumn(GameIdColumn).AsInt32().PrimaryKey().Identity()
            .WithColumn("title").AsString(150).NotNullable()
            .WithColumn("notes").AsString(int.MaxValue).Nullable()
            .WithColumn("first_released").AsDate().Nullable()
            .WithColumn("region_first_released_in").AsString(100).Nullable()
            .WithColumn("released_in_eu_or_na").AsBoolean().Nullable()
            .WithColumn("developer").AsString(100).Nullable()
            .WithColumn("publisher").AsString(100).Nullable();

        Create.Table("game_aliases")
            .WithColumn("alias_id").AsInt32().PrimaryKey().Identity()
            .WithColumn(GameIdColumn).AsInt32().NotNullable()
                .ForeignKey(GamesTable, GameIdColumn).OnDelete(System.Data.Rule.Cascade)
            .WithColumn("alias_name").AsString(150).NotNullable();

        Create.Table("game_owned")
            .WithColumn("ownership_id").AsInt32().PrimaryKey().Identity()
            .WithColumn(GameIdColumn).AsInt32().NotNullable()
                .ForeignKey(GamesTable, GameIdColumn).OnDelete(System.Data.Rule.Cascade)
            .WithColumn("own_physical_copy").AsBoolean().Nullable()
            .WithColumn("type_owned").AsString(50).Nullable()
                .ForeignKey(OwnershipTypesTable, "type_owned");

        Create.Table("progress")
            .WithColumn("progress_id").AsInt32().PrimaryKey().Identity()
            .WithColumn(GameIdColumn).AsInt32().NotNullable()
                .ForeignKey(GamesTable, GameIdColumn).OnDelete(System.Data.Rule.Cascade)
            .WithColumn("date_started").AsDate().NotNullable()
            .WithColumn("date_finished").AsDate().Nullable()
            .WithColumn("completion_time").AsTime().Nullable()
            .WithColumn("beaten_criteria").AsString(int.MaxValue).Nullable()
            .WithColumn("review").AsString(int.MaxValue).Nullable()
            .WithColumn("platform").AsString(50).NotNullable()
                .ForeignKey(PlatformTypesTable, "platform");

        Create.Table("excluded_games")
            .WithColumn("exclusion_id").AsInt32().PrimaryKey().Identity()
            .WithColumn(GameIdColumn).AsInt32().NotNullable()
                .ForeignKey(GamesTable, GameIdColumn).OnDelete(System.Data.Rule.Cascade)
            .WithColumn("reason").AsString(int.MaxValue).NotNullable();

        Create.Table("current_vote")
            .WithColumn("vote_id").AsInt32().PrimaryKey().Identity()
            .WithColumn(GameIdColumn).AsInt32().NotNullable()
                .ForeignKey(GamesTable, GameIdColumn).OnDelete(System.Data.Rule.Cascade)
            .WithColumn("vote_count").AsInt32().NotNullable().WithDefaultValue(0);

        Create.Table("vote_history")
            .WithColumn("history_id").AsInt32().PrimaryKey().Identity()
            .WithColumn(GameIdColumn).AsInt32().NotNullable()
                .ForeignKey(GamesTable, GameIdColumn).OnDelete(System.Data.Rule.Cascade)
            .WithColumn("vote_round").AsInt32().NotNullable()
            .WithColumn("vote_count").AsInt32().NotNullable();
    }

    public override void Down()
    {
        Delete.Table("vote_history");
        Delete.Table("current_vote");
        Delete.Table("excluded_games");
        Delete.Table("progress");
        Delete.Table("game_owned");
        Delete.Table("game_aliases");
        Delete.Table(GamesTable);
        Delete.Table(OwnershipTypesTable);
        Delete.Table(PlatformTypesTable);
    }
}
