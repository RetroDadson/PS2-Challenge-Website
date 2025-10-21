using FluentMigrator;

namespace PS2Challenge.Backend.Data.Migrations;

// Adds 'api_key' column to users table and generates unique API keys for existing users
[Migration(9)]
public class AddApiKeyToUsers : Migration
{
    public override void Up()
    {
        // Enable pgcrypto extension if not already enabled
        Execute.Sql("CREATE EXTENSION IF NOT EXISTS pgcrypto;");

        // Add api_key column to users table
        Alter.Table("users")
            .AddColumn("api_key").AsString(64).Nullable().Unique();

        // Generate unique API keys for existing users
        Execute.Sql(@"
            UPDATE users
            SET api_key = encode(gen_random_bytes(32), 'hex')
            WHERE api_key IS NULL;
        ");

        // Make the column NOT NULL after populating existing records
        Alter.Column("api_key").OnTable("users").AsString(64).NotNullable();

        // Create index on api_key for faster lookups
        Create.Index("idx_users_api_key")
            .OnTable("users")
            .OnColumn("api_key")
            .Unique();
    }

    public override void Down()
    {
        // Remove the index
        Delete.Index("idx_users_api_key").OnTable("users");

        // Remove the api_key column
        Delete.Column("api_key").FromTable("users");

        // Note: We don't drop the pgcrypto extension as other migrations or features might use it
    }
}
