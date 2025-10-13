using PS2Challenge.Backend.Configuration;
using PS2Challenge.Backend.Data;

namespace PS2Challenge.Backend;

public static class BackendInitializer
{
    public static void Initialize()
    {
        var envConfig = EnvironmentConfig.Instance;
        envConfig.Validate();
        MigrationRunner.MigrateDatabase(envConfig.ConnectionString);
    }
}
