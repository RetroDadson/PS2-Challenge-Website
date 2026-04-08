using Microsoft.Extensions.Configuration;

// New location for EnvironmentConfig (moved from Api project)
namespace PS2Challenge.Backend.Configuration;

public class EnvironmentConfig
{
    private static readonly Lazy<EnvironmentConfig> _instance = new(() => new EnvironmentConfig());

    public static EnvironmentConfig Instance => _instance.Value;

    private EnvironmentConfig()
    {
        LoadEnvironmentVariables();
    }

    public string ConnectionString { get; private set; } = string.Empty;
    public string TwitchClientId { get; private set; } = string.Empty;
    public string TwitchClientSecret { get; private set; } = string.Empty;

    private void LoadEnvironmentVariables()
    {
        Console.WriteLine("[EnvironmentConfig] Loading environment variables...");
        ConnectionString = ResolveConnectionString(configuration: null) ?? string.Empty;
        TwitchClientId = GetEnvironmentVariable("TWITCH_CLIENT_ID") ?? string.Empty;
        TwitchClientSecret = GetEnvironmentVariable("TWITCH_CLIENT_SECRET") ?? string.Empty;
    }

    public void Initialize(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);

        Console.WriteLine("[EnvironmentConfig] Initializing configuration from environment variables and appsettings...");

        ConnectionString = ResolveConnectionString(configuration) ?? string.Empty;

        TwitchClientId =
            GetEnvironmentVariable("TWITCH_CLIENT_ID")
            ?? configuration["Twitch:ClientId"]
            ?? string.Empty;

        TwitchClientSecret =
            GetEnvironmentVariable("TWITCH_CLIENT_SECRET")
            ?? configuration["Twitch:ClientSecret"]
            ?? string.Empty;
    }

    private static string? ResolveConnectionString(IConfiguration? configuration)
    {
        var appServiceDefaultConnection =
            GetEnvironmentVariable("POSTGRESQLCONNSTR_DefaultConnection")
            ?? GetEnvironmentVariable("CUSTOMCONNSTR_DefaultConnection");
        if (!string.IsNullOrWhiteSpace(appServiceDefaultConnection))
        {
            return appServiceDefaultConnection;
        }

        var fallbackAppServiceConnection =
            GetFirstEnvironmentVariableWithPrefix("POSTGRESQLCONNSTR_")
            ?? GetFirstEnvironmentVariableWithPrefix("CUSTOMCONNSTR_");
        if (!string.IsNullOrWhiteSpace(fallbackAppServiceConnection))
        {
            return fallbackAppServiceConnection;
        }

        var directEnvironmentValue = GetEnvironmentVariable("DATABASE_CONNECTION_STRING");
        if (!string.IsNullOrWhiteSpace(directEnvironmentValue))
        {
            return directEnvironmentValue;
        }

        var defaultConnection = configuration?.GetConnectionString("DefaultConnection");
        if (!string.IsNullOrWhiteSpace(defaultConnection))
        {
            return defaultConnection;
        }

        return null;
    }

    private static string? GetFirstEnvironmentVariableWithPrefix(string prefix)
    {
        foreach (System.Collections.DictionaryEntry variable in Environment.GetEnvironmentVariables())
        {
            if (variable.Key is not string key || !key.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (variable.Value is string value && !string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return null;
    }

    private static string? GetEnvironmentVariable(string key)
    {
        return Environment.GetEnvironmentVariable(key);
    }

    public void Validate()
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(ConnectionString))
        {
            errors.Add("A database connection string is required (DATABASE_CONNECTION_STRING, ConnectionStrings:DefaultConnection, or App Service POSTGRESQLCONNSTR_*)");
        }

        if (string.IsNullOrWhiteSpace(TwitchClientId))
        {
            errors.Add("TWITCH_CLIENT_ID is required");
        }

        if (string.IsNullOrWhiteSpace(TwitchClientSecret))
        {
            errors.Add("TWITCH_CLIENT_SECRET is required");
        }

        if (errors.Any())
        {
            throw new InvalidOperationException(
                $"Environment configuration is invalid:{Environment.NewLine}{string.Join(Environment.NewLine, errors)}");
        }
    }
}
