using FluentMigrator;

namespace PS2Challenge.Backend.Data.Migrations;

[Migration(10)]
public class AddGameSerialNumbers : Migration
{
    public override void Up()
    {
        Create.Table("game_serial_numbers")
            .WithColumn("serial_id").AsInt32().PrimaryKey().Identity()
            .WithColumn("game_id").AsInt32().NotNullable()
                .ForeignKey("fk_game_serial_numbers_games", "games", "game_id").OnDelete(System.Data.Rule.Cascade)
            .WithColumn("serial_number").AsString(50).NotNullable().Unique()
            .WithColumn("region").AsString(50).Nullable()
            .WithColumn("notes").AsString(500).Nullable();

        // Create index on game_id for faster lookups
        Create.Index("idx_game_serial_numbers_game_id")
            .OnTable("game_serial_numbers")
            .OnColumn("game_id");

        // Create unique index on serial_number (enforces uniqueness across all games)
        Create.Index("idx_game_serial_numbers_serial_number_unique")
            .OnTable("game_serial_numbers")
            .OnColumn("serial_number")
            .Unique();
    }

    public override void Down()
    {
        Delete.Index("idx_game_serial_numbers_serial_number_unique").OnTable("game_serial_numbers");
        Delete.Index("idx_game_serial_numbers_game_id").OnTable("game_serial_numbers");
        Delete.Table("game_serial_numbers");
    }
}
