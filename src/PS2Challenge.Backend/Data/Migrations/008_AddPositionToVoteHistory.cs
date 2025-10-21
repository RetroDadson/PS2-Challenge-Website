using FluentMigrator;

namespace PS2Challenge.Backend.Data.Migrations;

// Adds the 'position' column to 'vote_history' table to track game ranking (1st, 2nd, 3rd)
// This allows handling ties where multiple games have the same vote count
[Migration(8)]
public class AddPositionToVoteHistory : Migration
{
    public override void Up()
    {
        // Add 'position' column, nullable to allow for ties or unranked entries
        Alter.Table("vote_history")
            .AddColumn("position").AsInt32().Nullable();

        // Add check constraint for allowed values (1, 2, 3)
        // Use IF NOT EXISTS for idempotency
        Execute.Sql(@"
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'chk_vote_history_position'
                ) THEN
                    ALTER TABLE vote_history
                    ADD CONSTRAINT chk_vote_history_position
                    CHECK (position IS NULL OR position IN (1, 2, 3));
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
                    SELECT 1 FROM pg_constraint WHERE conname = 'chk_vote_history_position'
                ) THEN
                    ALTER TABLE vote_history
                    DROP CONSTRAINT chk_vote_history_position;
                END IF;
            END
            $$;
        ");

        // Remove the column
        Delete.Column("position").FromTable("vote_history");
    }
}
