namespace PS2Challenge.IntegrationTests.Helpers;

/// <summary>
/// Test-specific environment configuration that can be instantiated with test values
/// </summary>
public class TestEnvironmentConfig
{
    public string ConnectionString { get; set; } = "Host=localhost;Database=test;Username=test;Password=test";
    public string TwitchClientId { get; set; } = "test-client-id";
    public string TwitchClientSecret { get; set; } = "test-client-secret";

    /// <summary>
    /// Creates an EnvironmentConfig wrapper that uses these test values
    /// </summary>
    public static void SetTestEnvironmentVariables()
    {
        Environment.SetEnvironmentVariable("DATABASE_CONNECTION_STRING", "Host=localhost;Database=test;Username=test;Password=test");
        Environment.SetEnvironmentVariable("TWITCH_CLIENT_ID", "test-client-id");
        Environment.SetEnvironmentVariable("TWITCH_CLIENT_SECRET", "test-client-secret");
    }

    /// <summary>
    /// Clears test environment variables
    /// </summary>
    public static void ClearTestEnvironmentVariables()
    {
        Environment.SetEnvironmentVariable("DATABASE_CONNECTION_STRING", null);
        Environment.SetEnvironmentVariable("TWITCH_CLIENT_ID", null);
        Environment.SetEnvironmentVariable("TWITCH_CLIENT_SECRET", null);
    }
}
