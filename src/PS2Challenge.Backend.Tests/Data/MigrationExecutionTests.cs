using FluentMigrator.Runner;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using PS2Challenge.Backend.Data;
using Testcontainers.PostgreSql;

namespace PS2Challenge.Backend.Tests.Data;

public class MigrationExecutionTests : IAsyncLifetime
{
    private PostgreSqlContainer? _postgresContainer;
    private string _serverConnectionString = string.Empty;

    public async Task InitializeAsync()
    {
        var configuredConnectionString = Environment.GetEnvironmentVariable("MIGRATION_TEST_CONNECTION_STRING");

        if (!string.IsNullOrWhiteSpace(configuredConnectionString))
        {
            _serverConnectionString = EnsurePostgresDatabase(configuredConnectionString, "postgres");
            return;
        }

        _postgresContainer = new PostgreSqlBuilder()
            .WithImage("postgres:16-alpine")
            .WithDatabase("postgres")
            .WithUsername("postgres")
            .WithPassword("postgres")
            .Build();

        await _postgresContainer.StartAsync();
        _serverConnectionString = EnsurePostgresDatabase(_postgresContainer.GetConnectionString(), "postgres");
    }

    public async Task DisposeAsync()
    {
        if (_postgresContainer != null)
        {
            await _postgresContainer.DisposeAsync();
        }
    }

    [Fact]
    public async Task InitialSchema_CreatesCoreTables_AndSeedsLookupData()
    {
        await RunInIsolatedDatabaseAsync(async connectionString =>
        {
            MigrateUp(connectionString, 1);

            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync();

            Assert.True(await TableExistsAsync(connection, "games"));
            Assert.True(await TableExistsAsync(connection, "progress"));
            Assert.True(await TableExistsAsync(connection, "current_vote"));
            Assert.True(await TableExistsAsync(connection, "vote_history"));

            var physicalPlatformCount = await ExecuteScalarAsync<long>(
                connection,
                "SELECT COUNT(*) FROM platform_types WHERE platform = 'Physical';");

            var emulatedPlatformCount = await ExecuteScalarAsync<long>(
                connection,
                "SELECT COUNT(*) FROM platform_types WHERE platform = 'Emulated';");

            var baseOwnershipCount = await ExecuteScalarAsync<long>(
                connection,
                "SELECT COUNT(*) FROM ownership_types WHERE type_owned = 'Base';");

            var platinumOwnershipCount = await ExecuteScalarAsync<long>(
                connection,
                "SELECT COUNT(*) FROM ownership_types WHERE type_owned = 'Platinum';");

            Assert.Equal(1, physicalPlatformCount);
            Assert.Equal(1, emulatedPlatformCount);
            Assert.Equal(1, baseOwnershipCount);
            Assert.Equal(1, platinumOwnershipCount);
        });
    }

    [Fact]
    public async Task AddRolesTable_MigratesExistingUsersToRoleIds()
    {
        await RunInIsolatedDatabaseAsync(async connectionString =>
        {
            MigrateUp(connectionString, 4);

            await using (var connection = new NpgsqlConnection(connectionString))
            {
                await connection.OpenAsync();
                await ExecuteNonQueryAsync(
                    connection,
                    "INSERT INTO users (twitch_id, twitch_username, role) VALUES ('tw-user-1', 'tester', 'User');");
            }

            MigrateUp(connectionString, 5);

            await using var migratedConnection = new NpgsqlConnection(connectionString);
            await migratedConnection.OpenAsync();

            Assert.True(await TableExistsAsync(migratedConnection, "roles"));
            Assert.True(await ColumnExistsAsync(migratedConnection, "users", "role_id"));
            Assert.False(await ColumnExistsAsync(migratedConnection, "users", "role"));

            var roleId = await ExecuteScalarAsync<int>(
                migratedConnection,
                "SELECT role_id FROM users WHERE twitch_id = 'tw-user-1';");

            var roleName = await ExecuteScalarAsync<string>(
                migratedConnection,
                "SELECT name FROM roles WHERE id = @id;",
                new NpgsqlParameter("id", roleId));

            Assert.Equal("User", roleName);
        });
    }

    [Fact]
    public async Task PostgresSpecificMigrations_CreateConstraints_AndGenerateApiKeys()
    {
        await RunInIsolatedDatabaseAsync(async connectionString =>
        {
            MigrateUp(connectionString, 8);

            await using (var connection = new NpgsqlConnection(connectionString))
            {
                await connection.OpenAsync();

                await ExecuteNonQueryAsync(
                    connection,
                    "INSERT INTO users (twitch_id, twitch_username, role_id) VALUES ('tw-api-1', 'api-user', (SELECT id FROM roles WHERE name = 'User')); ");

                Assert.True(await ConstraintExistsAsync(connection, "chk_current_vote_game_number"));
                Assert.True(await ConstraintExistsAsync(connection, "chk_vote_history_position"));
            }

            MigrateUp(connectionString, 9);

            await using var migratedConnection = new NpgsqlConnection(connectionString);
            await migratedConnection.OpenAsync();

            Assert.True(await ColumnExistsAsync(migratedConnection, "users", "api_key"));
            Assert.True(await IndexExistsAsync(migratedConnection, "idx_users_api_key"));

            var apiKey = await ExecuteScalarAsync<string>(
                migratedConnection,
                "SELECT api_key FROM users WHERE twitch_id = 'tw-api-1';");

            Assert.False(string.IsNullOrWhiteSpace(apiKey));
            Assert.Equal(64, apiKey.Length);
        });
    }

    [Fact]
    public async Task ContentMigrations_CreateExpectedObjects_AndMigration12RollsBack()
    {
        await RunInIsolatedDatabaseAsync(async connectionString =>
        {
            MigrateUp(connectionString, 12);

            await using (var connection = new NpgsqlConnection(connectionString))
            {
                await connection.OpenAsync();

                Assert.True(await TableExistsAsync(connection, "game_serial_numbers"));
                Assert.True(await TableExistsAsync(connection, "alternate_titles"));
                Assert.True(await ColumnExistsAsync(connection, "games", "image_url"));

                Assert.True(await IndexExistsAsync(connection, "idx_game_serial_numbers_game_id"));
                Assert.True(await IndexExistsAsync(connection, "idx_game_serial_numbers_serial_number_unique"));
                Assert.True(await IndexExistsAsync(connection, "idx_alternate_titles_game_id"));
                Assert.True(await IndexExistsAsync(connection, "idx_games_image_url"));
            }

            MigrateDown(connectionString, 11);

            await using var rolledBackConnection = new NpgsqlConnection(connectionString);
            await rolledBackConnection.OpenAsync();

            Assert.False(await ColumnExistsAsync(rolledBackConnection, "games", "image_url"));
            Assert.False(await IndexExistsAsync(rolledBackConnection, "idx_games_image_url"));
            Assert.True(await TableExistsAsync(rolledBackConnection, "game_serial_numbers"));
            Assert.True(await TableExistsAsync(rolledBackConnection, "alternate_titles"));
        });
    }

    private async Task RunInIsolatedDatabaseAsync(Func<string, Task> testBody)
    {
        var databaseName = $"migration_test_{Guid.NewGuid():N}";
        var adminConnectionString = EnsurePostgresDatabase(_serverConnectionString, "postgres", disablePooling: true);

        await using var adminConnection = new NpgsqlConnection(adminConnectionString);
        await adminConnection.OpenAsync();
        await ExecuteNonQueryAsync(adminConnection, $"CREATE DATABASE \"{databaseName}\";");

        var isolatedConnectionString = EnsurePostgresDatabase(_serverConnectionString, databaseName, disablePooling: true);

        try
        {
            await testBody(isolatedConnectionString);
        }
        finally
        {
            await ExecuteNonQueryAsync(adminConnection, $"DROP DATABASE \"{databaseName}\" WITH (FORCE);");
        }
    }

    private static void MigrateUp(string connectionString, long version)
    {
        using var serviceProvider = CreateMigrationServiceProvider(connectionString);
        using var scope = serviceProvider.CreateScope();
        var migrationRunner = scope.ServiceProvider.GetRequiredService<IMigrationRunner>();
        migrationRunner.MigrateUp(version);
    }

    private static void MigrateDown(string connectionString, long version)
    {
        using var serviceProvider = CreateMigrationServiceProvider(connectionString);
        using var scope = serviceProvider.CreateScope();
        var migrationRunner = scope.ServiceProvider.GetRequiredService<IMigrationRunner>();
        migrationRunner.MigrateDown(version);
    }

    private static ServiceProvider CreateMigrationServiceProvider(string connectionString)
    {
        return new ServiceCollection()
            .AddFluentMigratorCore()
            .ConfigureRunner(runner => runner
                .AddPostgres()
                .WithGlobalConnectionString(connectionString)
                .ScanIn(typeof(InitialSchema).Assembly).For.Migrations())
            .BuildServiceProvider(validateScopes: false);
    }

    private static async Task<bool> TableExistsAsync(NpgsqlConnection connection, string tableName)
    {
        var count = await ExecuteScalarAsync<long>(
            connection,
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = @name;",
            new NpgsqlParameter("name", tableName));

        return count > 0;
    }

    private static async Task<bool> ColumnExistsAsync(NpgsqlConnection connection, string tableName, string columnName)
    {
        var count = await ExecuteScalarAsync<long>(
            connection,
            "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = @table AND column_name = @column;",
            new NpgsqlParameter("table", tableName),
            new NpgsqlParameter("column", columnName));

        return count > 0;
    }

    private static async Task<bool> IndexExistsAsync(NpgsqlConnection connection, string indexName)
    {
        var count = await ExecuteScalarAsync<long>(
            connection,
            "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = @name;",
            new NpgsqlParameter("name", indexName));

        return count > 0;
    }

    private static async Task<bool> ConstraintExistsAsync(NpgsqlConnection connection, string constraintName)
    {
        var count = await ExecuteScalarAsync<long>(
            connection,
            "SELECT COUNT(*) FROM pg_constraint WHERE conname = @name;",
            new NpgsqlParameter("name", constraintName));

        return count > 0;
    }

    private static async Task ExecuteNonQueryAsync(NpgsqlConnection connection, string sql, params NpgsqlParameter[] parameters)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        if (parameters.Length > 0)
        {
            command.Parameters.AddRange(parameters);
        }

        await command.ExecuteNonQueryAsync();
    }

    private static async Task<T> ExecuteScalarAsync<T>(NpgsqlConnection connection, string sql, params NpgsqlParameter[] parameters)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        if (parameters.Length > 0)
        {
            command.Parameters.AddRange(parameters);
        }

        var value = await command.ExecuteScalarAsync();
        Assert.NotNull(value);
        return (T)value;
    }

    private static string EnsurePostgresDatabase(string connectionString, string databaseName, bool disablePooling = false)
    {
        var builder = new NpgsqlConnectionStringBuilder(connectionString)
        {
            Database = databaseName,
            Pooling = !disablePooling && new NpgsqlConnectionStringBuilder(connectionString).Pooling
        };

        if (disablePooling)
        {
            builder.Pooling = false;
        }

        return builder.ConnectionString;
    }
}
