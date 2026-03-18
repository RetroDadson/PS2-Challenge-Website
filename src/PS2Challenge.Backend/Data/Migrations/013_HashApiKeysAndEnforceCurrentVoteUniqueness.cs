using FluentMigrator;

namespace PS2Challenge.Backend.Data.Migrations;

[Migration(13)]
public class HashApiKeysAndEnforceCurrentVoteUniqueness : Migration
{
    private const string UsersTable = "users";
    private const string ApiKeyColumn = "api_key";
    private const string CurrentVoteTable = "current_vote";
    private const string CurrentVoteGameIdIndex = "idx_current_vote_game_id_unique";
    private const string CurrentVoteGameNumberIndex = "idx_current_vote_game_number_unique";

    public override void Up()
    {
        Execute.Sql("CREATE EXTENSION IF NOT EXISTS pgcrypto;");

        Execute.Sql($@"
            UPDATE {UsersTable}
            SET {ApiKeyColumn} = encode(digest({ApiKeyColumn}::text, 'sha256'::text), 'hex')
            WHERE {ApiKeyColumn} IS NOT NULL;
        ");

        Create.Index(CurrentVoteGameIdIndex)
            .OnTable(CurrentVoteTable)
            .OnColumn("game_id")
            .Unique();

        Create.Index(CurrentVoteGameNumberIndex)
            .OnTable(CurrentVoteTable)
            .OnColumn("game_number")
            .Unique();
    }

    public override void Down()
    {
        Delete.Index(CurrentVoteGameNumberIndex).OnTable(CurrentVoteTable);
        Delete.Index(CurrentVoteGameIdIndex).OnTable(CurrentVoteTable);
    }
}