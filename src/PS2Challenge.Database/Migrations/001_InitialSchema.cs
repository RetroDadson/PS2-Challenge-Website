using FluentMigrator;

namespace PS2Challenge.Database;

[Migration(1)]
public class InitialSchema : Migration
{
    public override void Up()
    {
        // Create lookup tables for controlled vocabularies
        Create.Table("platform_types")
            .WithColumn("platform").AsString(50).PrimaryKey();

        Create.Table("ownership_types")
            .WithColumn("type_owned").AsString(50).PrimaryKey();

        // Seed initial values
        Insert.IntoTable("platform_types").Row(new { platform = "Physical" });
        Insert.IntoTable("platform_types").Row(new { platform = "Emulated" });

        Insert.IntoTable("ownership_types").Row(new { type_owned = "Base" });
        Insert.IntoTable("ownership_types").Row(new { type_owned = "Platinum" });

        // Create main tables
        Create.Table("games")
            .WithColumn("game_id").AsInt32().PrimaryKey().Identity()
            .WithColumn("title").AsString(150).NotNullable()
            .WithColumn("notes").AsString(int.MaxValue).Nullable()
            .WithColumn("first_released").AsDate().Nullable()
            .WithColumn("region_first_released_in").AsString(100).Nullable()
            .WithColumn("released_in_eu_or_na").AsBoolean().Nullable()
            .WithColumn("developer").AsString(100).Nullable()
            .WithColumn("publisher").AsString(100).Nullable();

        Create.Table("game_aliases")
            .WithColumn("alias_id").AsInt32().PrimaryKey().Identity()
            .WithColumn("game_id").AsInt32().NotNullable()
                .ForeignKey("games", "game_id").OnDelete(System.Data.Rule.Cascade)
            .WithColumn("alias_name").AsString(150).NotNullable();

        Create.Table("game_owned")
            .WithColumn("ownership_id").AsInt32().PrimaryKey().Identity()
            .WithColumn("game_id").AsInt32().NotNullable()
                .ForeignKey("games", "game_id").OnDelete(System.Data.Rule.Cascade)
            .WithColumn("own_physical_copy").AsBoolean().Nullable()
            .WithColumn("type_owned").AsString(50).Nullable()
                .ForeignKey("ownership_types", "type_owned");

        Create.Table("progress")
            .WithColumn("progress_id").AsInt32().PrimaryKey().Identity()
            .WithColumn("game_id").AsInt32().NotNullable()
                .ForeignKey("games", "game_id").OnDelete(System.Data.Rule.Cascade)
            .WithColumn("date_started").AsDate().NotNullable()
            .WithColumn("date_finished").AsDate().Nullable()
            .WithColumn("completion_time").AsTime().Nullable()
            .WithColumn("beaten_criteria").AsString(int.MaxValue).Nullable()
            .WithColumn("review").AsString(int.MaxValue).Nullable()
            .WithColumn("platform").AsString(50).NotNullable()
                .ForeignKey("platform_types", "platform");

        Create.Table("excluded_games")
            .WithColumn("exclusion_id").AsInt32().PrimaryKey().Identity()
            .WithColumn("game_id").AsInt32().NotNullable()
                .ForeignKey("games", "game_id").OnDelete(System.Data.Rule.Cascade)
            .WithColumn("reason").AsString(int.MaxValue).NotNullable();

        Create.Table("current_vote")
            .WithColumn("vote_id").AsInt32().PrimaryKey().Identity()
            .WithColumn("game_id").AsInt32().NotNullable()
                .ForeignKey("games", "game_id").OnDelete(System.Data.Rule.Cascade)
            .WithColumn("vote_count").AsInt32().NotNullable().WithDefaultValue(0);

        Create.Table("vote_history")
            .WithColumn("history_id").AsInt32().PrimaryKey().Identity()
            .WithColumn("game_id").AsInt32().NotNullable()
                .ForeignKey("games", "game_id").OnDelete(System.Data.Rule.Cascade)
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
        Delete.Table("games");
        Delete.Table("ownership_types");
        Delete.Table("platform_types");
    }
}
