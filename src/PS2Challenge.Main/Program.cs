using FluentMigrator.Runner;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Localization;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using PS2Challenge.Backend;
using PS2Challenge.Backend.Configuration;
using PS2Challenge.Backend.Data;
using PS2Challenge.Main.BackgroundServices;
using PS2Challenge.Backend.Data.Repositories;
using PS2Challenge.Backend.Services;
using PS2Challenge.Main.Api.Authentication;
using PS2Challenge.Main.Api.Authorization;
using PS2Challenge.Main.Api.Hubs;
using System.Globalization;
using System.Reflection;
using PS2Challenge.Main.Frontend.Components;

// Fix for PostgreSQL timestamp without time zone
AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

var builder = WebApplication.CreateBuilder(args);

// Determine if we're in testing mode
var isTesting = builder.Environment.EnvironmentName == "Testing";

// Configure Kestrel to listen on HTTP
// Use PORT environment variable if available (Azure), otherwise default to 5001
var port = Environment.GetEnvironmentVariable("PORT") ?? "5001";
builder.WebHost.ConfigureKestrel(options =>
{
    options.ListenAnyIP(int.Parse(port)); // HTTP
});

// Load and validate environment configuration (skip validation in testing)
EnvironmentConfig envConfig = EnvironmentConfig.Instance;
envConfig.Initialize(builder.Configuration);

if (!isTesting)
{
    envConfig.Validate();

    // Initialize backend (configuration validation and migrations)
    BackendInitializer.Initialize();
}
// In testing mode, environment variables are already set by test setup

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

// Configure routing to use lowercase URLs
builder.Services.Configure<RouteOptions>(options =>
{
    options.LowercaseUrls = true;
    options.LowercaseQueryStrings = false; // Keep query strings as-is
});

// Configure Swagger with detailed API documentation
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Version = "v1",
        Title = "PS2 Challenge API",
        Description = "API for managing PS2 games, progress tracking, and voting. All endpoints are case-insensitive but use lowercase conventions in documentation.",
        Contact = new OpenApiContact
        {
            Name = "PS2 Challenge Team"
        }
    });

    // Add security definition for API Key authentication
    options.AddSecurityDefinition("ApiKey", new OpenApiSecurityScheme
    {
        Description = "API Key authentication. Use either X-API-Key header or Authorization: Bearer {key}",
        Name = "X-API-Key",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "ApiKeyScheme"
    });

    // Add security definition for Cookie authentication
    options.AddSecurityDefinition("Cookie", new OpenApiSecurityScheme
    {
        Description = "Cookie-based authentication using Twitch OAuth",
        Name = ".PS2Challenge.Auth",
        In = ParameterLocation.Cookie,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "CookieScheme"
    });

    // Enable XML comments for documentation (if available)
    var xmlFilename = $"{Assembly.GetExecutingAssembly().GetName().Name}.xml";
    var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFilename);
    if (File.Exists(xmlPath))
    {
        options.IncludeXmlComments(xmlPath);
    }
});

// Add Blazor components with interactive server and WebAssembly support
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents()
    .AddInteractiveWebAssemblyComponents();

// Add SignalR
builder.Services.AddSignalR();

// Register HttpClient for server-side use
builder.Services.AddHttpClient();
builder.Services.AddScoped(sp =>
{
    var httpClientFactory = sp.GetRequiredService<IHttpClientFactory>();
    var httpClient = httpClientFactory.CreateClient();
    httpClient.BaseAddress = new Uri(builder.Configuration["ApiBaseUrl"] ?? "http://localhost:5001");
    return httpClient;
});

// Register EnvironmentConfig as a singleton for DI
builder.Services.AddSingleton(envConfig);

// Register DbContext with PostgreSQL
builder.Services.AddDbContext<Ps2ChallengeDbContext>(options =>
    options.UseNpgsql(envConfig.ConnectionString));

// Register GameService from backend (no direct SQL/DbContext/migration references)
builder.Services.AddSingleton<GameService>();

// Register VoteService from backend
builder.Services.AddSingleton<VoteService>();

// Register GameCoverService
builder.Services.AddScoped<GameCoverService>();

// Add UserRepository
builder.Services.AddScoped<UserRepository>();

// Add GameRepository
builder.Services.AddScoped<GameRepository>();

// Register background service for updating cover images with SignalR notifications
builder.Services.AddHostedService<CoverImageUpdateServiceWrapper>();

// Add health checks
builder.Services.AddHealthChecks()
    .AddDbContextCheck<Ps2ChallengeDbContext>(
        name: "database",
        tags: new[] { "db", "postgres" });

// Add FluentMigrator services (skip in testing)
if (!isTesting)
{
    builder.Services.AddFluentMigratorCore()
        .ConfigureRunner(rb => rb
            .AddPostgres()
            .WithGlobalConnectionString(envConfig.ConnectionString)
            .ScanIn(typeof(InitialSchema).Assembly).For.Migrations())
        .AddLogging(lb => lb.AddFluentMigratorConsole());
}

// Set UK culture globally for date parsing
var cultureInfo = new CultureInfo("en-GB");
CultureInfo.DefaultThreadCurrentCulture = cultureInfo;
CultureInfo.DefaultThreadCurrentUICulture = cultureInfo;

// Add authentication (skip Twitch setup in testing)
if (!isTesting)
{
    builder.Services.AddAuthentication(options =>
    {
        options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = "Twitch";
    })
    .AddCookie(options =>
    {
        options.LoginPath = "/api/auth/login";
        options.LogoutPath = "/api/auth/logout";
        options.Cookie.Name = ".PS2Challenge.Auth";
        options.Cookie.HttpOnly = true;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.ExpireTimeSpan = TimeSpan.FromDays(30);
        options.SlidingExpiration = true;
    })
    .AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, ApiKeyAuthenticationHandler>("ApiKey", null)
    .AddTwitch(options =>
    {
        // Use EnvironmentConfig instead of builder.Configuration
        options.ClientId = envConfig.TwitchClientId;
        options.ClientSecret = envConfig.TwitchClientSecret;
        options.CallbackPath = "/api/auth/callback";
        options.SaveTokens = true;

        options.Events = new Microsoft.AspNetCore.Authentication.OAuth.OAuthEvents
        {
            OnCreatingTicket = async context =>
            {
                var twitchId = context.Principal?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                var username = context.Principal?.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value;

                if (!string.IsNullOrEmpty(twitchId) && !string.IsNullOrEmpty(username))
                {
                    var userRepository = context.HttpContext.RequestServices.GetRequiredService<UserRepository>();
                    var user = await userRepository.GetUserByTwitchIdAsync(twitchId);

                    if (user == null)
                    {
                        user = await userRepository.CreateUserAsync(twitchId, username);
                    }
                    else
                    {
                        await userRepository.UpdateLastLoginAsync(user.Id);
                    }

                    var identity = (System.Security.Claims.ClaimsIdentity?)context.Principal?.Identity;
                    if (identity != null)
                    {
                        identity.AddClaim(new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Role, user.Role?.Name ?? "User"));

                        // Extract profile_image_url from Twitch's data array
                        string? profileImageUrl = null;
                        try
                        {
                            // The user data is in data[0]
                            if (context.User.TryGetProperty("data", out var dataArray) &&
                                dataArray.ValueKind == System.Text.Json.JsonValueKind.Array)
                            {
                                var firstUser = dataArray.EnumerateArray().FirstOrDefault();
                                if (firstUser.ValueKind != System.Text.Json.JsonValueKind.Undefined &&
                                    firstUser.TryGetProperty("profile_image_url", out var profileImageElement))
                                {
                                    profileImageUrl = profileImageElement.GetString();
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"Could not get profile_image_url: {ex.Message}");
                        }

                        if (!string.IsNullOrEmpty(profileImageUrl))
                        {
                            identity.AddClaim(new System.Security.Claims.Claim("ProfileImageUrl", profileImageUrl));

                            // Also update the database with the profile image URL
                            try
                            {
                                if (user.ProfileImageUrl != profileImageUrl)
                                {
                                    user.ProfileImageUrl = profileImageUrl;
                                    await userRepository.UpdateAsync(user);
                                }
                            }
                            catch (Exception ex)
                            {
                                Console.WriteLine($"Could not update profile image URL in database: {ex.Message}");
                            }
                        }

                        identity.AddClaim(new System.Security.Claims.Claim("CreatedAt", user.CreatedAt.ToString("o")));
                        identity.AddClaim(new System.Security.Claims.Claim("LastLoginAt", DateTime.UtcNow.ToString("o")));
                    }
                }
            },
            OnTicketReceived = context =>
            {
                // Handle the redirect after successful authentication
                var returnUrl = context.Properties?.RedirectUri;

                // Also check Items dictionary for returnUrl
                if (string.IsNullOrEmpty(returnUrl) && context.Properties?.Items != null && context.Properties.Items.ContainsKey("returnUrl"))
                {
                    returnUrl = context.Properties.Items["returnUrl"];
                }

                if (!string.IsNullOrEmpty(returnUrl))
                {
                    string path;

                    // Try to parse as URI to extract path
                    if (Uri.TryCreate(returnUrl, UriKind.Absolute, out var uri))
                    {
                        // Extract path from absolute URL
                        path = uri.PathAndQuery;
                    }
                    else
                    {
                        // Already a relative path
                        path = returnUrl;
                    }

                    // Check if it's a restricted page that shouldn't be returned to
                    var restrictedPaths = new[] { "/admin", "/user", "/login" };
                    var normalizedPath = path.Split('?')[0].ToLowerInvariant();

                    if (restrictedPaths.Any(p => normalizedPath.StartsWith(p)))
                    {
                        // Redirect to home for restricted pages
                        context.ReturnUri = "/";
                    }
                    else
                    {
                        // Use the path from the URL
                        context.ReturnUri = path;
                      }
                }
                else
                {
                    context.ReturnUri = "/";
                }

                return Task.CompletedTask;
            }
        };
    });
}

// Register authorization handlers
builder.Services.AddSingleton<IAuthorizationHandler, CookieOrApiKeyAuthorizationHandler>();

// Add authorization policies
builder.Services.AddAuthorization(options =>
{
    // Policy that allows either Cookie or API Key authentication for Admin role
    options.AddPolicy("AdminCookieOrApiKey", policy =>
    {
        policy.AddAuthenticationSchemes(CookieAuthenticationDefaults.AuthenticationScheme, "ApiKey");
        policy.Requirements.Add(new CookieOrApiKeyAuthorizationPolicy("Admin"));
    });

    // Policy for any authenticated user (Cookie or API Key)
    options.AddPolicy("CookieOrApiKey", policy =>
    {
        policy.AddAuthenticationSchemes(CookieAuthenticationDefaults.AuthenticationScheme, "ApiKey");
        policy.Requirements.Add(new CookieOrApiKeyAuthorizationPolicy());
    });
});

var app = builder.Build();

// Configure request localization to use UK culture
var supportedCultures = new[] { cultureInfo };
app.UseRequestLocalization(new RequestLocalizationOptions
{
    DefaultRequestCulture = new RequestCulture(cultureInfo),
    SupportedCultures = supportedCultures,
    SupportedUICultures = supportedCultures
});

// Run migrations on startup (skip in testing)
if (!isTesting)
{
    using (var scope = app.Services.CreateScope())
    {
        var runner = scope.ServiceProvider.GetRequiredService<IMigrationRunner>();
        runner.MigrateUp();
    }
}

// Configure Swagger UI - Available in all environments but with different settings
app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "PS2 Challenge API v1");
    options.RoutePrefix = "swagger"; // Access at /swagger
    options.DocumentTitle = "PS2 Challenge API Documentation";

    // Always inject custom theme CSS for consistent styling across all environments
    options.InjectStylesheet("/swagger-ui/custom.css");

    // Configure based on environment
    if (!app.Environment.IsDevelopment())
    {
        // Production/Staging: Inject read-only CSS to hide interactive features
        options.InjectStylesheet("/swagger-ui/readonly.css");

        // Disable default model expansion
        options.DefaultModelsExpandDepth(-1);

        // Display operation id (helps with identification)
        options.DisplayOperationId();

        // Disable request duration display
        options.DisplayRequestDuration();
    }
    else
    {
        // Development: Keep all interactive features enabled
        options.DefaultModelsExpandDepth(1);
        options.DisplayRequestDuration();
    }
});

app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();

app.MapControllers();
app.MapHub<VotesHub>("/votesHub");
app.MapHub<GamesHub>("/gamesHub");

// Map health check endpoints
app.MapHealthChecks("/api/health");
app.MapHealthChecks("/health");

// Map Razor components with interactive render modes
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode()
    .AddInteractiveWebAssemblyRenderMode();

app.Run();

public partial class Program { }
