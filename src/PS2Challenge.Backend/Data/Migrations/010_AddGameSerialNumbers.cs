using FluentMigrator;

namespace PS2Challenge.Backend.Data.Migrations;

[Migration(10)]
public class AddGameSerialNumbers : Migration
{
    private const string GameSerialNumbersTable = "game_serial_numbers";

    public override void Up()
    {
        Create.Table(GameSerialNumbersTable)
            .WithColumn("serial_id").AsInt32().PrimaryKey().Identity()
            .WithColumn("game_id").AsInt32().NotNullable()
                .ForeignKey("fk_game_serial_numbers_games", "games", "game_id").OnDelete(System.Data.Rule.Cascade)
            .WithColumn("serial_number").AsString(50).NotNullable().Unique()
            .WithColumn("region").AsString(50).Nullable()
            .WithColumn("notes").AsString(500).Nullable();

        // Create index on game_id for faster lookups
        Create.Index("idx_game_serial_numbers_game_id")
            .OnTable(GameSerialNumbersTable)
            .OnColumn("game_id");

        // Create unique index on serial_number (enforces uniqueness across all games)
        Create.Index("idx_game_serial_numbers_serial_number_unique")
            .OnTable(GameSerialNumbersTable)
            .OnColumn("serial_number")
            .Unique();
    }

    public override void Down()
    {
        Delete.Index("idx_game_serial_numbers_serial_number_unique").OnTable(GameSerialNumbersTable);
        Delete.Index("idx_game_serial_numbers_game_id").OnTable(GameSerialNumbersTable);
        Delete.Table(GameSerialNumbersTable);
    }
}
