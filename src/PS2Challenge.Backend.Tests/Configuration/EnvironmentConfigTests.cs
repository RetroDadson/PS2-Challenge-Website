using System.Reflection;
using Microsoft.Extensions.Configuration;
using PS2Challenge.Backend.Configuration;

namespace PS2Challenge.Backend.Tests.Configuration;

public class EnvironmentConfigTests
{
    [Fact]
    public void Validate_Throws_WhenRequiredVariablesMissing()
    {
        SetEnvironmentVariables(null, null, null, null, null, null, null);

        var config = CreateFreshConfig();

        var exception = Assert.Throws<InvalidOperationException>(() => config.Validate());
        Assert.Contains("A database connection string is required", exception.Message);
        Assert.Contains("TWITCH_CLIENT_ID is required", exception.Message);
        Assert.Contains("TWITCH_CLIENT_SECRET is required", exception.Message);
    }

    [Fact]
    public void Validate_DoesNotThrow_WhenAllRequiredVariablesPresent()
    {
        SetEnvironmentVariables("Host=localhost;Database=test;", "client-id", "client-secret", null, null, null, null);

        var config = CreateFreshConfig();

        var exception = Record.Exception(() => config.Validate());
        Assert.Null(exception);
        Assert.Equal("Host=localhost;Database=test;", config.ConnectionString);
        Assert.Equal("client-id", config.TwitchClientId);
        Assert.Equal("client-secret", config.TwitchClientSecret);
    }

    [Fact]
    public void Initialize_UsesAppServiceDefaultConnectionString_WhenDatabaseVariableMissing()
    {
        SetEnvironmentVariables(null, "client-id", "client-secret", "Host=azure;Database=ps2;", null, null, null);

        var config = CreateFreshConfig();
        var configuration = BuildConfiguration();

        config.Initialize(configuration);

        Assert.Equal("Host=azure;Database=ps2;", config.ConnectionString);
    }

    [Fact]
    public void Initialize_UsesCustomDefaultConnectionString_WhenPostgresDefaultIsMissing()
    {
        SetEnvironmentVariables(null, "client-id", "client-secret", null, null, "Host=custom-default;Database=ps2;", null);

        var config = CreateFreshConfig();
        var configuration = BuildConfiguration();

        config.Initialize(configuration);

        Assert.Equal("Host=custom-default;Database=ps2;", config.ConnectionString);
    }

    [Fact]
    public void Initialize_UsesFirstAppServiceConnectionString_WhenNamedDefaultIsMissing()
    {
        SetEnvironmentVariables(null, "client-id", "client-secret", null, "Host=azure-fallback;Database=ps2;", null, null);

        var config = CreateFreshConfig();
        var configuration = BuildConfiguration();

        config.Initialize(configuration);

        Assert.Equal("Host=azure-fallback;Database=ps2;", config.ConnectionString);
    }

    [Fact]
    public void Initialize_UsesCustomConnectionPrefixFallback_WhenPostgresPrefixMissing()
    {
        SetEnvironmentVariables(null, "client-id", "client-secret", null, null, null, "Host=custom-prefix;Database=ps2;");

        var config = CreateFreshConfig();
        var configuration = BuildConfiguration();

        config.Initialize(configuration);

        Assert.Equal("Host=custom-prefix;Database=ps2;", config.ConnectionString);
    }

    [Fact]
    public void Initialize_UsesDatabaseConnectionString_WhenNoAppServiceVariablesExist()
    {
        SetEnvironmentVariables("Host=direct;Database=ps2;", "client-id", "client-secret", null, null, null, null);

        var config = CreateFreshConfig();
        var configuration = BuildConfiguration("Host=appsettings;Database=ps2;");

        config.Initialize(configuration);

        Assert.Equal("Host=direct;Database=ps2;", config.ConnectionString);
    }

    [Fact]
    public void Initialize_UsesAppSettingsConnectionString_WhenEnvironmentVariablesAreMissing()
    {
        SetEnvironmentVariables(null, "client-id", "client-secret", null, null, null, null);

        var config = CreateFreshConfig();
        var configuration = BuildConfiguration("Host=appsettings;Database=ps2;");

        config.Initialize(configuration);

        Assert.Equal("Host=appsettings;Database=ps2;", config.ConnectionString);
    }

    [Fact]
    public void Initialize_PrefersAppServiceConnectionString_OverDatabaseVariableAndConfiguration()
    {
        SetEnvironmentVariables(
            "Host=direct;Database=ps2;",
            "client-id",
            "client-secret",
            "Host=azure;Database=ps2;",
            "Host=azure-fallback;Database=ps2;",
            "Host=custom-default;Database=ps2;",
            "Host=custom-prefix;Database=ps2;");

        var configuration = BuildConfiguration("Host=appsettings;Database=ps2;");
        var config = CreateFreshConfig();

        config.Initialize(configuration);

        Assert.Equal("Host=azure;Database=ps2;", config.ConnectionString);
    }

    [Fact]
    public void Initialize_LeavesConnectionStringEmpty_WhenAllSourcesAreMissing()
    {
        SetEnvironmentVariables(null, "client-id", "client-secret", null, null, null, null);

        var config = CreateFreshConfig();
        var configuration = BuildConfiguration();

        config.Initialize(configuration);

        Assert.Equal(string.Empty, config.ConnectionString);
    }

    private static EnvironmentConfig CreateFreshConfig()
    {
        var constructor = typeof(EnvironmentConfig).GetConstructor(
            BindingFlags.Instance | BindingFlags.NonPublic,
            binder: null,
            types: Type.EmptyTypes,
            modifiers: null);

        Assert.NotNull(constructor);
        return (EnvironmentConfig)constructor.Invoke(null);
    }

    private static IConfiguration BuildConfiguration(string? defaultConnection = null)
    {
        var entries = new Dictionary<string, string?>
        {
            ["Twitch:ClientId"] = "config-client-id",
            ["Twitch:ClientSecret"] = "config-client-secret"
        };

        if (defaultConnection is not null)
        {
            entries["ConnectionStrings:DefaultConnection"] = defaultConnection;
        }

        return new ConfigurationBuilder()
            .AddInMemoryCollection(entries)
            .Build();
    }

    private static void SetEnvironmentVariables(
        string? connectionString,
        string? clientId,
        string? clientSecret,
        string? appServiceDefaultConnection,
        string? appServiceFallbackConnection,
        string? customDefaultConnection,
        string? customPrefixFallbackConnection)
    {
        Environment.SetEnvironmentVariable("DATABASE_CONNECTION_STRING", connectionString);
        Environment.SetEnvironmentVariable("TWITCH_CLIENT_ID", clientId);
        Environment.SetEnvironmentVariable("TWITCH_CLIENT_SECRET", clientSecret);
        Environment.SetEnvironmentVariable("POSTGRESQLCONNSTR_DefaultConnection", appServiceDefaultConnection);
        Environment.SetEnvironmentVariable("POSTGRESQLCONNSTR_AzureConnection", appServiceFallbackConnection);
        Environment.SetEnvironmentVariable("CUSTOMCONNSTR_DefaultConnection", customDefaultConnection);
        Environment.SetEnvironmentVariable("CUSTOMCONNSTR_AzureConnection", customPrefixFallbackConnection);
    }
}

