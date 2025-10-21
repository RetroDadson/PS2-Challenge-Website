using FluentMigrator;

namespace PS2Challenge.Backend.Data.Migrations;

// Adds the 'game_number' column to 'current_vote' table for OBS overlay and admin control
[Migration(7)]
public class AddGameNumberToCurrentVote : Migration
{
    public override void Up()
    {
        // Add 'game_number' column, default 1, not nullable
        Alter.Table("current_vote")
            .AddColumn("game_number").AsInt32().NotNullable().WithDefaultValue(1);

        // Add check constraint for allowed values (1, 2, 3)
        // Use IF NOT EXISTS for idempotency
        Execute.Sql(@"
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'chk_current_vote_game_number'
                ) THEN
                    ALTER TABLE current_vote
                    ADD CONSTRAINT chk_current_vote_game_number
                    CHECK (game_number IN (1, 2, 3));
                END IF;
            END
            $$;
        ");
    }

    public override void Down()
    {
        // Remove check constraint if exists
        Execute.Sql(@"
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'chk_current_vote_game_number'
                ) THEN
                    ALTER TABLE current_vote
                    DROP CONSTRAINT chk_current_vote_game_number;
                END IF;
            END
            $$;
        ");

        // Remove the column
        Delete.Column("game_number").FromTable("current_vote");
    }
}
