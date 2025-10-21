using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PS2Challenge.Backend.Data;
using System.Security.Claims;
using System.Text.Encodings.Web;

namespace PS2Challenge.IntegrationTests.Helpers;

/// <summary>
/// Custom WebApplicationFactory for integration tests with mocked authentication
/// </summary>
public class CustomWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _databaseName;

    public CustomWebApplicationFactory()
    {
        // Set test environment variables before the application starts
        TestEnvironmentConfig.SetTestEnvironmentVariables();

        // Use a stable database name for this factory instance
        // All tests using the same factory instance will share this database
        _databaseName = $"InMemoryDbForTesting_{Guid.NewGuid()}";
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Set environment to Testing to disable certain startup behaviors
        builder.UseEnvironment("Testing");

        builder.ConfigureAppConfiguration((context, config) =>
        {
            // Override configuration to provide dummy Twitch credentials
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Twitch:ClientId"] = "test-client-id",
                ["Twitch:ClientSecret"] = "test-client-secret"
            });
        });

        builder.ConfigureServices(services =>
        {
            // Debug: list all service descriptors that mention DbContext or DbContextOptions
            Console.WriteLine("---- Service descriptors before DbContext cleanup ----");
            foreach (var d in services.Where(d =>
                     (d.ServiceType?.Name?.Contains("DbContext") ?? false) ||
                     (d.ServiceType?.Name?.Contains("DbContextOptions") ?? false) ||
                     (d.ImplementationType?.Name?.Contains("DbContext") ?? false)))
            {
                Console.WriteLine($"ServiceType: {d.ServiceType?.FullName}, ImplementationType: {d.ImplementationType?.FullName}, Lifetime: {d.Lifetime}");
            }

            // Remove any registrations that could configure EF Core for Ps2ChallengeDbContext
            var toRemove = services.Where(d =>
                d.ServiceType == typeof(DbContextOptions<Ps2ChallengeDbContext>) ||
                d.ServiceType == typeof(DbContextOptions) ||
                d.ServiceType == typeof(Ps2ChallengeDbContext) ||
                (d.ServiceType.IsGenericType && d.ServiceType.GetGenericTypeDefinition() == typeof(IDbContextFactory<>) && d.ServiceType.GetGenericArguments()[0] == typeof(Ps2ChallengeDbContext)) ||
                (d.ImplementationType != null && d.ImplementationType == typeof(Ps2ChallengeDbContext)) ||
                (d.ServiceType.Name.Contains("DbContext") || d.ServiceType.Name.Contains("DbContextOptions"))
            ).ToList();

            foreach (var d in toRemove)
            {
                Console.WriteLine($"Removing descriptor: {d.ServiceType?.FullName} / {d.ImplementationType?.FullName}");
                services.Remove(d);
            }

            // Add DbContext using in-memory database for testing.
            // Use the stable database name so all requests share the same database
            services.AddDbContext<Ps2ChallengeDbContext>(options =>
            {
                options.UseInMemoryDatabase(_databaseName);
            });

            // Remove existing authentication services
            var authServices = services.Where(d =>
                d.ServiceType.Name.Contains("Authentication") ||
                d.ServiceType == typeof(IAuthenticationService)).ToList();
            foreach (var service in authServices)
            {
                services.Remove(service);
            }

            // Replace authentication with test authentication scheme
            // Add Test, Cookie, Twitch, and ApiKey schemes to support all authorization policies
            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = "Test";
                options.DefaultChallengeScheme = "Test";
                options.DefaultSignOutScheme = Microsoft.AspNetCore.Authentication.Cookies.CookieAuthenticationDefaults.AuthenticationScheme;
            })
            .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>("Test", options => { })
            .AddCookie(Microsoft.AspNetCore.Authentication.Cookies.CookieAuthenticationDefaults.AuthenticationScheme, options =>
            {
                // Configure for testing - minimal setup
                options.Cookie.Name = ".PS2Challenge.Auth";
            })
            .AddScheme<AuthenticationSchemeOptions, TestTwitchAuthHandler>("Twitch", options => { })
            .AddScheme<AuthenticationSchemeOptions, TestApiKeyAuthHandler>("ApiKey", options => { });

            // Debug: list remaining service descriptors that mention DbContext
            Console.WriteLine("---- Service descriptors after DbContext cleanup and re-registration ----");
            foreach (var d in services.Where(d =>
                     (d.ServiceType?.Name?.Contains("DbContext") ?? false) ||
                     (d.ServiceType?.Name?.Contains("DbContextOptions") ?? false) ||
                     (d.ImplementationType?.Name?.Contains("DbContext") ?? false)))
            {
                Console.WriteLine($"ServiceType: {d.ServiceType?.FullName}, ImplementationType: {d.ImplementationType?.FullName}, Lifetime: {d.Lifetime}");
            }

            // Build the service provider and seed as before
            var sp = services.BuildServiceProvider();
            using var scope = sp.CreateScope();
            var scopedServices = scope.ServiceProvider;
            var db = scopedServices.GetRequiredService<Ps2ChallengeDbContext>();
            db.Database.EnsureCreated();
            SeedTestData(db);
        });
    }

    private static void SeedTestData(Ps2ChallengeDbContext db)
    {
        // Add default roles
        if (!db.Roles.Any())
        {
            db.Roles.AddRange(
                new Backend.Models.Role { Id = 1, Name = "Admin" },
                new Backend.Models.Role { Id = 2, Name = "User" }
            );
            db.SaveChanges();
        }

        // Add test users
        if (!db.Users.Any())
        {
            db.Users.AddRange(
                new Backend.Models.ApplicationUser
                {
                    Id = 1,
                    TwitchId = "test-admin-123",
                    TwitchUsername = "TestAdmin",
                    RoleId = 1,
                    CreatedAt = DateTime.UtcNow,
                    LastLoginAt = DateTime.UtcNow
                },
                new Backend.Models.ApplicationUser
                {
                    Id = 2,
                    TwitchId = "test-user-456",
                    TwitchUsername = "TestUser",
                    RoleId = 2,
                    CreatedAt = DateTime.UtcNow,
                    LastLoginAt = DateTime.UtcNow
                }
            );
            db.SaveChanges();
        }
    }

    /// <summary>
    /// Creates an authenticated client for testing admin endpoints
    /// </summary>
    public HttpClient CreateAuthenticatedClient(string role = "Admin")
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-User-Role", role);
        return client;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            // Clean up environment variables
            TestEnvironmentConfig.ClearTestEnvironmentVariables();
        }
        base.Dispose(disposing);
    }
}

/// <summary>
/// Test authentication handler that authenticates all requests with configurable claims
/// </summary>
public class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder)
    {
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        // Check if this is a request that should be authenticated
        var role = Context.Request.Headers["X-Test-User-Role"].FirstOrDefault();

        if (string.IsNullOrEmpty(role))
        {
            // No authentication header, return no result (will be treated as unauthenticated)
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        // Create claims for the test user
        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, role == "Admin" ? "test-admin-123" : "test-user-456"),
            new Claim(ClaimTypes.Name, role == "Admin" ? "TestAdmin" : "TestUser"),
            new Claim(ClaimTypes.Role, role)
        };

        var identity = new ClaimsIdentity(claims, "Test");
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, "Test");

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}

/// <summary>
/// Test API Key authentication handler for integration tests
/// This handler simulates API Key authentication for the AdminCookieOrApiKey policy
/// </summary>
public class TestApiKeyAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public TestApiKeyAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder)
    {
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        // Check if this is a request that should be authenticated via API key
        var role = Context.Request.Headers["X-Test-User-Role"].FirstOrDefault();

        if (string.IsNullOrEmpty(role))
        {
            // No authentication header, return no result (will be treated as unauthenticated)
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        // Create claims for the test user (same as Test handler)
        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, role == "Admin" ? "test-admin-123" : "test-user-456"),
            new Claim(ClaimTypes.Name, role == "Admin" ? "TestAdmin" : "TestUser"),
            new Claim(ClaimTypes.Role, role),
            new Claim("AuthMethod", "ApiKey")
        };

        var identity = new ClaimsIdentity(claims, Scheme.Name);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, Scheme.Name);

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}

/// <summary>
/// Test Twitch authentication handler for integration tests
/// This handler simulates Twitch OAuth but just redirects to home without actual authentication
/// </summary>
public class TestTwitchAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public TestTwitchAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder)
    {
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        // Twitch handler is only for challenges (login redirect)
        // We don't authenticate here, just return no result
        return Task.FromResult(AuthenticateResult.NoResult());
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        // In test mode, instead of redirecting to Twitch, just redirect to the return URL or home
        var redirectUri = properties?.RedirectUri ?? "/";
        Response.Redirect(redirectUri);
        return Task.CompletedTask;
    }
}
