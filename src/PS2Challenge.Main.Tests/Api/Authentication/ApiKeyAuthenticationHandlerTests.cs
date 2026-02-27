using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using Moq;
using PS2Challenge.Backend.Data.Repositories;
using PS2Challenge.Backend.Models;
using PS2Challenge.Main.Api.Authentication;
using System.Text.Encodings.Web;

namespace PS2Challenge.Main.Tests.Api.Authentication;

public class ApiKeyAuthenticationHandlerTests
{
    private readonly Mock<UserRepository> _userRepository;
    private readonly IOptionsMonitor<AuthenticationSchemeOptions> _optionsMonitor;
    private readonly ILoggerFactory _loggerFactory;

    public ApiKeyAuthenticationHandlerTests()
    {
        _userRepository = new Mock<UserRepository>(Mock.Of<IServiceScopeFactory>());

        var optionsMock = new Mock<IOptionsMonitor<AuthenticationSchemeOptions>>();
        optionsMock
            .Setup(m => m.Get(It.IsAny<string>()))
            .Returns(new AuthenticationSchemeOptions());
        _optionsMonitor = optionsMock.Object;

        _loggerFactory = LoggerFactory.Create(builder => { });
    }

    [Fact]
    public async Task Authenticate_ReturnsNoResult_WhenNoHeadersPresent()
    {
        var handler = CreateHandler();

        var result = await handler.AuthenticateAsync();

        Assert.True(result.None);
    }

    [Fact]
    public async Task Authenticate_ReturnsNoResult_WhenAuthorizationHeaderNotBearer()
    {
        var handler = CreateHandler(new Dictionary<string, string>
        {
            ["Authorization"] = "Basic abc123"
        });

        var result = await handler.AuthenticateAsync();

        Assert.True(result.None);
    }

    [Fact]
    public async Task Authenticate_ReturnsFail_WhenApiKeyInvalid()
    {
        _userRepository
            .Setup(r => r.GetByApiKeyAsync("bad-key"))
            .ReturnsAsync((ApplicationUser?)null);

        var handler = CreateHandler(new Dictionary<string, string>
        {
            ["X-API-Key"] = "bad-key"
        });

        var result = await handler.AuthenticateAsync();

        Assert.False(result.Succeeded);
        Assert.NotNull(result.Failure);
    }

    [Fact]
    public async Task Authenticate_ReturnsSuccess_WhenApiKeyValid()
    {
        _userRepository
            .Setup(r => r.GetByApiKeyAsync("valid-key"))
            .ReturnsAsync(new ApplicationUser
            {
                Id = 1,
                TwitchId = "tw-1",
                TwitchUsername = "tester",
                Role = new Role { Id = 1, Name = "Admin" }
            });

        var handler = CreateHandler(new Dictionary<string, string>
        {
            ["X-API-Key"] = "valid-key"
        });

        var result = await handler.AuthenticateAsync();

        Assert.True(result.Succeeded);
        Assert.Equal("tester", result.Principal?.Identity?.Name);
        Assert.Contains(result.Principal!.Claims, c => c.Type == "AuthMethod" && c.Value == "ApiKey");
    }

    [Fact]
    public async Task Authenticate_UsesBearerAuthorizationHeader_WhenProvided()
    {
        _userRepository
            .Setup(r => r.GetByApiKeyAsync("token-123"))
            .ReturnsAsync(new ApplicationUser
            {
                Id = 2,
                TwitchId = "tw-2",
                TwitchUsername = "bearer-user",
                Role = new Role { Id = 2, Name = "User" }
            });

        var handler = CreateHandler(new Dictionary<string, string>
        {
            ["Authorization"] = "Bearer token-123"
        });

        var result = await handler.AuthenticateAsync();

        Assert.True(result.Succeeded);
        Assert.Equal("bearer-user", result.Principal?.Identity?.Name);
    }

    [Fact]
    public async Task Authenticate_ReturnsFail_WhenRepositoryThrows()
    {
        _userRepository
            .Setup(r => r.GetByApiKeyAsync("err-key"))
            .ThrowsAsync(new InvalidOperationException("db error"));

        var handler = CreateHandler(new Dictionary<string, string>
        {
            ["X-API-Key"] = "err-key"
        });

        var result = await handler.AuthenticateAsync();

        Assert.False(result.Succeeded);
        Assert.NotNull(result.Failure);
        Assert.Equal("Error validating API key", result.Failure?.Message);
    }

    private ApiKeyAuthenticationHandler CreateHandler(Dictionary<string, string>? headers = null)
    {
        var handler = new ApiKeyAuthenticationHandler(
            _optionsMonitor,
            _loggerFactory,
            UrlEncoder.Default,
            _userRepository.Object);

        var context = new DefaultHttpContext();
        if (headers != null)
        {
            foreach (var header in headers)
            {
                context.Request.Headers[header.Key] = header.Value;
            }
        }

        var scheme = new AuthenticationScheme("ApiKey", "ApiKey", typeof(ApiKeyAuthenticationHandler));
        handler.InitializeAsync(scheme, context).GetAwaiter().GetResult();

        return handler;
    }
}
