using System.Reflection;
using PS2Challenge.Backend.Configuration;

namespace PS2Challenge.Backend.Tests.Configuration;

public class EnvironmentConfigTests
{
    [Fact]
    public void Validate_Throws_WhenRequiredVariablesMissing()
    {
        SetEnvironmentVariables(null, null, null);

        var config = CreateFreshConfig();

        var exception = Assert.Throws<InvalidOperationException>(() => config.Validate());
        Assert.Contains("DATABASE_CONNECTION_STRING is required", exception.Message);
        Assert.Contains("TWITCH_CLIENT_ID is required", exception.Message);
        Assert.Contains("TWITCH_CLIENT_SECRET is required", exception.Message);
    }

    [Fact]
    public void Validate_DoesNotThrow_WhenAllRequiredVariablesPresent()
    {
        SetEnvironmentVariables("Host=localhost;Database=test;", "client-id", "client-secret");

        var config = CreateFreshConfig();

        var exception = Record.Exception(() => config.Validate());
        Assert.Null(exception);
        Assert.Equal("Host=localhost;Database=test;", config.ConnectionString);
        Assert.Equal("client-id", config.TwitchClientId);
        Assert.Equal("client-secret", config.TwitchClientSecret);
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

    private static void SetEnvironmentVariables(string? connectionString, string? clientId, string? clientSecret)
    {
        Environment.SetEnvironmentVariable("DATABASE_CONNECTION_STRING", connectionString);
        Environment.SetEnvironmentVariable("TWITCH_CLIENT_ID", clientId);
        Environment.SetEnvironmentVariable("TWITCH_CLIENT_SECRET", clientSecret);
    }
}
