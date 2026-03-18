using FluentMigrator;
using System.Security.Cryptography;
using System.Text;

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
        Execute.WithConnection((connection, transaction) =>
        {
            using var selectCommand = connection.CreateCommand();
            selectCommand.Transaction = transaction;
            selectCommand.CommandText = $@"
                SELECT id, {ApiKeyColumn}
                FROM {UsersTable}
                WHERE {ApiKeyColumn} IS NOT NULL;
            ";

            var apiKeysToUpdate = new List<(int UserId, string ApiKey)>();

            using (var reader = selectCommand.ExecuteReader())
            {
                while (reader.Read())
                {
                    apiKeysToUpdate.Add((reader.GetInt32(0), reader.GetString(1)));
                }
            }

            foreach (var (userId, apiKey) in apiKeysToUpdate)
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
                apiKeyParameter.Value = HashApiKey(apiKey);
                updateCommand.Parameters.Add(apiKeyParameter);

                var userIdParameter = updateCommand.CreateParameter();
                userIdParameter.ParameterName = "userId";
                userIdParameter.Value = userId;
                updateCommand.Parameters.Add(userIdParameter);

                updateCommand.ExecuteNonQuery();
            }
        });

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

    private static string HashApiKey(string apiKey)
    {
        var bytes = Encoding.UTF8.GetBytes(apiKey.Trim());
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}