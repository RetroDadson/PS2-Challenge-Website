using FluentMigrator.Runner;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Localization;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using PS2Challenge.Backend;
using PS2Challenge.Backend.Configuration;
using PS2Challenge.Backend.Data;
using PS2Challenge.Backend.Data.Repositories;
using PS2Challenge.Backend.Services;
using PS2Challenge.Main.Api.Authentication;
using PS2Challenge.Main.Api.Authorization;
using PS2Challenge.Main.Api.Hubs;
using PS2Challenge.Main.BackgroundServices;
using PS2Challenge.Main.Frontend.Components;
using System.Globalization;
using System.Reflection;
using System.Security.Claims;
using System.Text.Json;

namespace PS2Challenge.Main;

internal static class ProgramStartup
{
    private const string ApiKeySchemeName = "ApiKey";
    private static readonly string[] RestrictedPaths = ["/admin", "/user", "/login"];

    public static async Task RunAsync(string[] args)
    {
        AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

        var builder = WebApplication.CreateBuilder(args);
        var isTesting = builder.Environment.EnvironmentName == "Testing";
        var port = Environment.GetEnvironmentVariable("PORT") ?? "5001";

        ConfigureKestrel(builder, port);

        var envConfig = InitializeEnvironment(builder.Configuration, isTesting);
        var cultureInfo = ConfigureCulture();

        ConfigureServices(builder, envConfig, isTesting, port);

        var app = builder.Build();
        ConfigurePipeline(app, cultureInfo, isTesting);

        await app.RunAsync();
    }

    private static void ConfigureKestrel(WebApplicationBuilder builder, string port)
    {
        if (!int.TryParse(port, out var parsedPort))
        {
            parsedPort = 5001;
        }

        builder.WebHost.ConfigureKestrel(options => options.ListenAnyIP(parsedPort));
    }

    private static EnvironmentConfig InitializeEnvironment(IConfiguration configuration, bool isTesting)
    {
        var envConfig = EnvironmentConfig.Instance;
        envConfig.Initialize(configuration);

        if (!isTesting)
        {
            envConfig.Validate();
            BackendInitializer.Initialize();
        }

        return envConfig;
    }

    private static CultureInfo ConfigureCulture()
    {
        var cultureInfo = new CultureInfo("en-GB");
        CultureInfo.DefaultThreadCurrentCulture = cultureInfo;
        CultureInfo.DefaultThreadCurrentUICulture = cultureInfo;
        return cultureInfo;
    }

    private static void ConfigureServices(WebApplicationBuilder builder, EnvironmentConfig envConfig, bool isTesting, string port)
    {
        builder.Services.AddControllers();
        builder.Services.AddEndpointsApiExplorer();

        builder.Services.Configure<RouteOptions>(options =>
        {
            options.LowercaseUrls = true;
            options.LowercaseQueryStrings = false;
        });

        ConfigureSwagger(builder.Services);

        builder.Services.AddRazorComponents()
            .AddInteractiveServerComponents()
            .AddInteractiveWebAssemblyComponents();

        builder.Services.AddSignalR();
        ConfigureHttpClient(builder.Services, builder.Configuration, port);

        builder.Services.AddSingleton(envConfig);
        builder.Services.AddDbContext<Ps2ChallengeDbContext>(options => options.UseNpgsql(envConfig.ConnectionString));

        builder.Services.AddSingleton<GameService>();
        builder.Services.AddSingleton<VoteService>();
        builder.Services.AddScoped<GameCoverService>();
        builder.Services.AddScoped<UserRepository>();
        builder.Services.AddScoped<GameRepository>();
        builder.Services.AddHostedService<CoverImageUpdateServiceWrapper>();

        builder.Services.AddHealthChecks()
            .AddDbContextCheck<Ps2ChallengeDbContext>(name: "database", tags: ["db", "postgres"]);

        if (!isTesting)
        {
            ConfigureFluentMigrator(builder.Services, envConfig.ConnectionString);
            ConfigureAuthentication(builder.Services, envConfig);
        }

        ConfigureAuthorization(builder.Services);
    }

    private static void ConfigureSwagger(IServiceCollection services)
    {
        services.AddSwaggerGen(options =>
        {
            options.SwaggerDoc("v1", new OpenApiInfo
            {
                Version = "v1",
                Title = "PS2 Challenge API",
                Description = "API for managing PS2 games, progress tracking, and voting. All endpoints are case-insensitive but use lowercase conventions in documentation.",
                Contact = new OpenApiContact { Name = "PS2 Challenge Team" }
            });

            options.AddSecurityDefinition(ApiKeySchemeName, new OpenApiSecurityScheme
            {
                Description = "API Key authentication. Use either X-API-Key header or Authorization: Bearer {key}",
                Name = "X-API-Key",
                In = ParameterLocation.Header,
                Type = SecuritySchemeType.ApiKey,
                Scheme = "ApiKeyScheme"
            });

            options.AddSecurityDefinition("Cookie", new OpenApiSecurityScheme
            {
                Description = "Cookie-based authentication using Twitch OAuth",
                Name = ".PS2Challenge.Auth",
                In = ParameterLocation.Cookie,
                Type = SecuritySchemeType.ApiKey,
                Scheme = "CookieScheme"
            });

            var xmlFilename = $"{Assembly.GetExecutingAssembly().GetName().Name}.xml";
            var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFilename);
            if (File.Exists(xmlPath))
            {
                options.IncludeXmlComments(xmlPath);
            }
        });
    }

    private static void ConfigureHttpClient(IServiceCollection services, IConfiguration configuration, string port)
    {
        services.AddHttpClient();
        services.AddScoped(sp =>
        {
            var httpClientFactory = sp.GetRequiredService<IHttpClientFactory>();
            var httpClient = httpClientFactory.CreateClient();

            var apiBaseUrl = configuration["ApiBaseUrl"];
            if (!Uri.TryCreate(apiBaseUrl, UriKind.Absolute, out var baseAddress))
            {
                if (!int.TryParse(port, out var parsedPort))
                {
                    parsedPort = 5001;
                }

                baseAddress = new UriBuilder(Uri.UriSchemeHttp, "localhost", parsedPort).Uri;
            }

            httpClient.BaseAddress = baseAddress;
            return httpClient;
        });
    }

    private static void ConfigureFluentMigrator(IServiceCollection services, string connectionString)
    {
        services.AddFluentMigratorCore()
            .ConfigureRunner(rb => rb
                .AddPostgres()
                .WithGlobalConnectionString(connectionString)
                .ScanIn(typeof(InitialSchema).Assembly).For.Migrations())
            .AddLogging(lb => lb.AddFluentMigratorConsole());
    }

    private static void ConfigureAuthentication(IServiceCollection services, EnvironmentConfig envConfig)
    {
        services.AddAuthentication(options =>
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
        .AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, ApiKeyAuthenticationHandler>(ApiKeySchemeName, null)
        .AddTwitch(options =>
        {
            options.ClientId = envConfig.TwitchClientId;
            options.ClientSecret = envConfig.TwitchClientSecret;
            options.CallbackPath = "/api/auth/callback";
            options.SaveTokens = true;

            options.Events = new Microsoft.AspNetCore.Authentication.OAuth.OAuthEvents
            {
                OnCreatingTicket = HandleCreatingTicketAsync,
                OnTicketReceived = HandleTicketReceivedAsync
            };
        });
    }

    private static void ConfigureAuthorization(IServiceCollection services)
    {
        services.AddSingleton<IAuthorizationHandler, CookieOrApiKeyAuthorizationHandler>();

        services.AddAuthorization(options =>
        {
            options.AddPolicy("AdminCookieOrApiKey", policy =>
            {
                policy.AddAuthenticationSchemes(CookieAuthenticationDefaults.AuthenticationScheme, ApiKeySchemeName);
                policy.Requirements.Add(new CookieOrApiKeyAuthorizationPolicy("Admin"));
            });

            options.AddPolicy("CookieOrApiKey", policy =>
            {
                policy.AddAuthenticationSchemes(CookieAuthenticationDefaults.AuthenticationScheme, ApiKeySchemeName);
                policy.Requirements.Add(new CookieOrApiKeyAuthorizationPolicy());
            });
        });
    }

    private static async Task HandleCreatingTicketAsync(Microsoft.AspNetCore.Authentication.OAuth.OAuthCreatingTicketContext context)
    {
        var twitchId = context.Principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var username = context.Principal?.FindFirst(ClaimTypes.Name)?.Value;

        if (string.IsNullOrEmpty(twitchId) || string.IsNullOrEmpty(username))
        {
            return;
        }

        var userRepository = context.HttpContext.RequestServices.GetRequiredService<UserRepository>();
        var user = await userRepository.GetUserByTwitchIdAsync(twitchId)
            ?? await userRepository.CreateUserAsync(twitchId, username);

        if (user.Id > 0)
        {
            await userRepository.UpdateLastLoginAsync(user.Id);
        }

        if (context.Principal?.Identity is not ClaimsIdentity identity)
        {
            return;
        }

        identity.AddClaim(new Claim("UserId", user.Id.ToString(CultureInfo.InvariantCulture)));
        identity.AddClaim(new Claim(ClaimTypes.Role, user.Role?.Name ?? "User"));

        var profileImageUrl = TryGetProfileImageUrl(context.User);
        if (!string.IsNullOrEmpty(profileImageUrl))
        {
            identity.AddClaim(new Claim("ProfileImageUrl", profileImageUrl));
            await TryUpdateProfileImageAsync(userRepository, user, profileImageUrl);
        }

        identity.AddClaim(new Claim("CreatedAt", user.CreatedAt.ToString("o")));
        identity.AddClaim(new Claim("LastLoginAt", DateTime.UtcNow.ToString("o")));
    }

    private static string? TryGetProfileImageUrl(JsonElement userElement)
    {
        try
        {
            if (!userElement.TryGetProperty("data", out var dataArray) || dataArray.ValueKind != JsonValueKind.Array)
            {
                return null;
            }

            var firstUser = dataArray.EnumerateArray().FirstOrDefault();
            if (firstUser.ValueKind == JsonValueKind.Undefined)
            {
                return null;
            }

            return firstUser.TryGetProperty("profile_image_url", out var profileImageElement)
                ? profileImageElement.GetString()
                : null;
        }
        catch
        {
            return null;
        }
    }

    private static async Task TryUpdateProfileImageAsync(UserRepository userRepository, PS2Challenge.Backend.Models.ApplicationUser user, string profileImageUrl)
    {
        try
        {
            if (user.ProfileImageUrl == profileImageUrl)
            {
                return;
            }

            user.ProfileImageUrl = profileImageUrl;
            await userRepository.UpdateAsync(user);
        }
        catch (Exception)
        {
            // Non-critical profile image persistence failure should not block login flow.
        }
    }

    private static Task HandleTicketReceivedAsync(Microsoft.AspNetCore.Authentication.TicketReceivedContext context)
    {
        context.ReturnUri = ResolveReturnUri(context.Properties);
        return Task.CompletedTask;
    }

    private static string ResolveReturnUri(Microsoft.AspNetCore.Authentication.AuthenticationProperties? properties)
    {
        var returnUrl = properties?.RedirectUri;
        if (string.IsNullOrEmpty(returnUrl) && properties?.Items != null && properties.Items.TryGetValue("returnUrl", out var itemValue))
        {
            returnUrl = itemValue;
        }

        if (string.IsNullOrEmpty(returnUrl))
        {
            return "/";
        }

        var path = Uri.TryCreate(returnUrl, UriKind.Absolute, out var uri)
            ? uri.PathAndQuery
            : returnUrl;

        var normalizedPath = path.Split('?')[0].ToLowerInvariant();
        return RestrictedPaths.Any(p => normalizedPath.StartsWith(p, StringComparison.Ordinal))
            ? "/"
            : path;
    }

    private static void ConfigurePipeline(WebApplication app, CultureInfo cultureInfo, bool isTesting)
    {
        app.UseRequestLocalization(new RequestLocalizationOptions
        {
            DefaultRequestCulture = new RequestCulture(cultureInfo),
            SupportedCultures = [cultureInfo],
            SupportedUICultures = [cultureInfo]
        });

        if (!isTesting)
        {
            using var scope = app.Services.CreateScope();
            var runner = scope.ServiceProvider.GetRequiredService<IMigrationRunner>();
            runner.MigrateUp();
        }

        app.UseSwagger();
        app.UseSwaggerUI(options =>
        {
            options.SwaggerEndpoint("/swagger/v1/swagger.json", "PS2 Challenge API v1");
            options.RoutePrefix = "swagger";
            options.DocumentTitle = "PS2 Challenge API Documentation";
            options.InjectStylesheet("/swagger-ui/custom.css");

            if (!app.Environment.IsDevelopment())
            {
                options.InjectStylesheet("/swagger-ui/readonly.css");
                options.DefaultModelsExpandDepth(-1);
                options.DisplayOperationId();
                options.DisplayRequestDuration();
                return;
            }

            options.DefaultModelsExpandDepth(1);
            options.DisplayRequestDuration();
        });

        app.UseStaticFiles();
        app.UseRouting();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseAntiforgery();

        app.MapControllers();
        app.MapHub<VotesHub>("/votesHub");
        app.MapHub<GamesHub>("/gamesHub");
        app.MapHealthChecks("/api/health");
        app.MapHealthChecks("/health");

        app.MapRazorComponents<App>()
            .AddInteractiveServerRenderMode()
            .AddInteractiveWebAssemblyRenderMode();
    }
}
