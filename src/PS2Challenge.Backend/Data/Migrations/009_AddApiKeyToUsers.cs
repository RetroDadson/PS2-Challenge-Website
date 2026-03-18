using FluentMigrator;
using System.Security.Cryptography;

namespace PS2Challenge.Backend.Data.Migrations;

// Adds 'api_key' column to users table and generates unique API keys for existing users
[Migration(9)]
public class AddApiKeyToUsers : Migration
{
    private const string UsersTable = "users";
    private const string ApiKeyColumn = "api_key";

    public override void Up()
    {
        // Add api_key column to users table
        Alter.Table(UsersTable)
            .AddColumn(ApiKeyColumn).AsString(64).Nullable().Unique();

        Execute.WithConnection((connection, transaction) =>
        {
            using var selectCommand = connection.CreateCommand();
            selectCommand.Transaction = transaction;
            selectCommand.CommandText = $@"
                SELECT id
                FROM {UsersTable}
                WHERE {ApiKeyColumn} IS NULL;
            ";

            var userIds = new List<int>();

            using (var reader = selectCommand.ExecuteReader())
            {
                while (reader.Read())
                {
                    userIds.Add(reader.GetInt32(0));
                }
            }

            foreach (var userId in userIds)
            {
                using var updateCommand = connection.CreateCommand();
                updateCommand.Transaction = transaction;
                updateCommand.CommandText = $@"
                    UPDATE {UsersTable}
                    SET {ApiKeyColumn} = @apiKey
                    WHERE id = @userId;
                ";

                var apiKeyParameter = updateCommand.CreateParameter();
                apiKeyParameter.ParameterName = "apiKey";
                apiKeyParameter.Value = GenerateSecureApiKey();
                updateCommand.Parameters.Add(apiKeyParameter);

                var userIdParameter = updateCommand.CreateParameter();
                userIdParameter.ParameterName = "userId";
                userIdParameter.Value = userId;
                updateCommand.Parameters.Add(userIdParameter);

                updateCommand.ExecuteNonQuery();
            }
        });

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
    }

    private static string GenerateSecureApiKey()
    {
        var bytes = new byte[32];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
