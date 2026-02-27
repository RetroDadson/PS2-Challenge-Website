using FluentMigrator;

namespace PS2Challenge.Backend.Data.Migrations;

// Adds 'api_key' column to users table and generates unique API keys for existing users
[Migration(9)]
public class AddApiKeyToUsers : Migration
{
    private const string UsersTable = "users";
    private const string ApiKeyColumn = "api_key";

    public override void Up()
    {
        // Enable pgcrypto extension if not already enabled
        Execute.Sql("CREATE EXTENSION IF NOT EXISTS pgcrypto;");

        // Add api_key column to users table
        Alter.Table(UsersTable)
            .AddColumn(ApiKeyColumn).AsString(64).Nullable().Unique();

        // Generate unique API keys for existing users
        Execute.Sql($@"
            UPDATE {UsersTable}
            SET {ApiKeyColumn} = encode(gen_random_bytes(32), 'hex')
            WHERE {ApiKeyColumn} IS NULL;
        ");

        // Make the column NOT NULL after populating existing records
        Alter.Column(ApiKeyColumn).OnTable(UsersTable).AsString(64).NotNullable();

        // Create index on api_key for faster lookups
        Create.Index("idx_users_api_key")
            .OnTable(UsersTable)
            .OnColumn(ApiKeyColumn)
            .Unique();
    }

    public override void Down()
    {
        // Remove the index
        Delete.Index("idx_users_api_key").OnTable(UsersTable);

        // Remove the api_key column
        Delete.Column(ApiKeyColumn).FromTable(UsersTable);

        // Note: We don't drop the pgcrypto extension as other migrations or features might use it
    }
}
