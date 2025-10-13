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
    public string JwtSecret { get; private set; } = string.Empty;
    public int JwtExpirationMinutes { get; private set; } = 60;
    public string CorsOrigins { get; private set; } = string.Empty;
    public string LogLevel { get; private set; } = "Information";
    public bool EnableSwagger { get; private set; } = true;
    public string ApiBaseUrl { get; private set; } = "http://localhost:5000";
    public string FrontendUrl { get; private set; } = "http://localhost:3000";

    private void LoadEnvironmentVariables()
    {
        ConnectionString = GetEnvironmentVariable("PS2_CHALLENGE_CONNECTION_STRING") ?? string.Empty;
        JwtSecret = GetEnvironmentVariable("PS2_CHALLENGE_JWT_SECRET") ?? string.Empty;

        if (int.TryParse(GetEnvironmentVariable("PS2_CHALLENGE_JWT_EXPIRATION_MINUTES"), out int jwtExp))
        {
            JwtExpirationMinutes = jwtExp;
        }

        CorsOrigins = GetEnvironmentVariable("PS2_CHALLENGE_CORS_ORIGINS") ?? string.Empty;
        LogLevel = GetEnvironmentVariable("PS2_CHALLENGE_LOG_LEVEL") ?? "Information";

        if (bool.TryParse(GetEnvironmentVariable("PS2_CHALLENGE_ENABLE_SWAGGER"), out bool enableSwagger))
        {
            EnableSwagger = enableSwagger;
        }

        ApiBaseUrl = GetEnvironmentVariable("PS2_CHALLENGE_API_BASE_URL") ?? "http://localhost:5000";
        FrontendUrl = GetEnvironmentVariable("PS2_CHALLENGE_FRONTEND_URL") ?? "http://localhost:3000";
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
            errors.Add("PS2_CHALLENGE_CONNECTION_STRING is required");
        }

        if (errors.Any())
        {
            throw new InvalidOperationException(
                $"Environment configuration is invalid:{Environment.NewLine}{string.Join(Environment.NewLine, errors)}");
        }
    }
}
