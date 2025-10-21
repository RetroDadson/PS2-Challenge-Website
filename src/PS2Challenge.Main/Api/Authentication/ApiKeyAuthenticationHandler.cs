using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using PS2Challenge.Backend.Data.Repositories;
using System.Security.Claims;
using System.Text.Encodings.Web;

namespace PS2Challenge.Main.Api.Authentication;

/// <summary>
/// Authentication handler for API Key authentication
/// Checks for API key in Authorization header (Bearer scheme) or X-API-Key header
/// </summary>
public class ApiKeyAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    private const string ApiKeyHeaderName = "X-API-Key";
    private readonly UserRepository _userRepository;
    private readonly ILogger<ApiKeyAuthenticationHandler> _logger;

    public ApiKeyAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        UserRepository userRepository)
        : base(options, logger, encoder)
    {
        _userRepository = userRepository;
        _logger = logger.CreateLogger<ApiKeyAuthenticationHandler>();
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        // Check for API key in X-API-Key header
        if (!Request.Headers.TryGetValue(ApiKeyHeaderName, out var apiKeyHeaderValues))
        {
            // Check for API key in Authorization header (Bearer scheme)
            if (Request.Headers.TryGetValue("Authorization", out var authHeaderValues))
            {
                var authHeader = authHeaderValues.FirstOrDefault();
                if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                {
                    apiKeyHeaderValues = authHeader.Substring("Bearer ".Length).Trim();
                }
                else
                {
                    // No API key provided, but this is OK - cookie auth might be used
                    return AuthenticateResult.NoResult();
                }
            }
            else
            {
                // No API key provided, but this is OK - cookie auth might be used
                return AuthenticateResult.NoResult();
            }
        }

        var providedApiKey = apiKeyHeaderValues.FirstOrDefault();

        if (string.IsNullOrWhiteSpace(providedApiKey))
        {
            return AuthenticateResult.NoResult();
        }

        try
        {
            // Validate API key against database
            var user = await _userRepository.GetByApiKeyAsync(providedApiKey);

            if (user == null)
            {
                _logger.LogWarning("Invalid API key provided");
                return AuthenticateResult.Fail("Invalid API key");
            }

            // Create claims for the authenticated user
            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.NameIdentifier, user.TwitchId),
                new Claim(ClaimTypes.Name, user.TwitchUsername),
                new Claim(ClaimTypes.Role, user.Role?.Name ?? "User"),
                new Claim("UserId", user.Id.ToString()),
                new Claim("AuthMethod", "ApiKey")
            };

            var identity = new ClaimsIdentity(claims, Scheme.Name);
            var principal = new ClaimsPrincipal(identity);
            var ticket = new AuthenticationTicket(principal, Scheme.Name);

            _logger.LogInformation("User {Username} authenticated via API key", user.TwitchUsername);

            return AuthenticateResult.Success(ticket);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error validating API key");
            return AuthenticateResult.Fail("Error validating API key");
        }
    }
}
