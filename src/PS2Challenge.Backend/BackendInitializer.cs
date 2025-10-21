using PS2Challenge.Backend.Configuration;
using PS2Challenge.Backend.Data;

namespace PS2Challenge.Backend;

public static class BackendInitializer
{
    public static void Initialize()
    {
        var envConfig = EnvironmentConfig.Instance;

        Console.WriteLine($"[BackendInitializer] Validating environment configuration...");
        envConfig.Validate();

        Console.WriteLine($"[BackendInitializer] Connection string loaded: {(!string.IsNullOrEmpty(envConfig.ConnectionString) ? "Yes" : "No")}");

        Console.WriteLine($"[BackendInitializer] Running database migrations...");
        MigrationRunner.MigrateDatabase(envConfig.ConnectionString);

        Console.WriteLine($"[BackendInitializer] Initialization complete.");
    }
}
