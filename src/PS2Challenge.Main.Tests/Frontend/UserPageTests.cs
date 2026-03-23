using Bunit;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using PS2Challenge.Backend.Data.Repositories;
using PS2Challenge.Backend.Models;
using PS2Challenge.Main.Frontend.Pages;
using System.Security.Claims;

namespace PS2Challenge.Main.Tests.Frontend;

public class UserPageTests : BunitContext
{
    private readonly Mock<UserRepository> _userRepository;

    public UserPageTests()
    {
        _userRepository = new Mock<UserRepository>(Mock.Of<IServiceScopeFactory>());
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddSingleton(_userRepository.Object);
    }

    [Fact]
    public async Task User_WhenAnonymous_ShowsLoginPrompt()
    {
        SetAuthentication(new ClaimsPrincipal(new ClaimsIdentity()));

        var cut = Render<User>();

        await cut.WaitForAssertionAsync(() =>
        {
            var markup = cut.Markup;
            Assert.Contains("Not Logged In", markup);
            Assert.Contains("Login with Twitch", markup);
        });
    }

    [Fact]
    public async Task User_WhenAuthenticated_ShowsProfileAndMaskedApiKey()
    {
        var twitchId = "tw-123";
        SetAuthentication(CreateAuthenticatedUser(twitchId));

        _userRepository.Setup(r => r.GetByTwitchIdAsync(twitchId)).ReturnsAsync(new ApplicationUser
        {
            Id = 42,
            TwitchId = twitchId,
            TwitchUsername = "Dadson",
            CreatedAt = DateTime.UtcNow,
            LastLoginAt = DateTime.UtcNow,
            ApiKey = "secret-api-key"
        });

        var cut = Render<User>();

        await cut.WaitForAssertionAsync(() =>
        {
            var markup = cut.Markup;
            Assert.Contains("Dadson", markup);
            Assert.Contains("Admin", markup);
            Assert.Contains("secret-api-key", markup);
            Assert.Contains("type=\"password\"", markup);
            Assert.Contains("Copy", markup);
            Assert.Contains("Regenerate", markup);
        });
    }

    [Fact]
    public async Task User_ToggleVisibilityAndRegenerate_UpdatesApiKeyAndInputType()
    {
        var twitchId = "tw-456";
        SetAuthentication(CreateAuthenticatedUser(twitchId));

        _userRepository.Setup(r => r.GetByTwitchIdAsync(twitchId)).ReturnsAsync(new ApplicationUser
        {
            Id = 7,
            TwitchId = twitchId,
            TwitchUsername = "ProfileUser",
            CreatedAt = DateTime.UtcNow,
            LastLoginAt = DateTime.UtcNow,
            ApiKey = "old-key"
        });

        _userRepository.Setup(r => r.GenerateApiKeyAsync(7)).ReturnsAsync("new-key");

        JSInterop.Setup<bool>("confirm", _ => true).SetResult(true);

        var cut = Render<User>();
        await cut.WaitForAssertionAsync(() => Assert.Contains("old-key", cut.Markup));

        await cut.InvokeAsync(() => cut.Find("button[title*='API Key']").Click());
        await cut.WaitForAssertionAsync(() => Assert.Contains("type=\"text\"", cut.Markup));

        await cut.InvokeAsync(() =>
        {
            var regenerateButton = cut.FindAll("button")
                .First(b => b.TextContent.Contains("Regenerate", StringComparison.OrdinalIgnoreCase));
            regenerateButton.Click();
        });

        await cut.WaitForAssertionAsync(() =>
        {
            var apiKeyInput = cut.Find("#apiKeyInput");
            Assert.Equal("new-key", apiKeyInput.GetAttribute("value"));
            Assert.Equal("text", apiKeyInput.GetAttribute("type"));
        });

        _userRepository.Verify(r => r.GenerateApiKeyAsync(7), Times.Once);
    }

    [Fact]
    public async Task User_WhenClipboardCopyFails_ShowsErrorMessage()
    {
        var twitchId = "tw-789";
        SetAuthentication(CreateAuthenticatedUser(twitchId));

        _userRepository.Setup(r => r.GetByTwitchIdAsync(twitchId)).ReturnsAsync(new ApplicationUser
        {
            Id = 9,
            TwitchId = twitchId,
            TwitchUsername = "CopyUser",
            CreatedAt = DateTime.UtcNow,
            LastLoginAt = DateTime.UtcNow,
            ApiKey = "copy-me"
        });

        JSInterop.SetupVoid("navigator.clipboard.writeText", _ => true)
            .SetException(new InvalidOperationException("clipboard unavailable"));

        var cut = Render<User>();
        await cut.WaitForAssertionAsync(() => Assert.Contains("copy-me", cut.Markup));

        await cut.InvokeAsync(() =>
        {
            var copyButton = cut.FindAll("button")
                .First(b => b.TextContent.Contains("Copy", StringComparison.OrdinalIgnoreCase));
            copyButton.Click();
        });

        await cut.WaitForAssertionAsync(() =>
            Assert.Contains("Failed to copy API key to clipboard", cut.Markup));
    }

    private void SetAuthentication(ClaimsPrincipal user)
    {
        var provider = new Mock<AuthenticationStateProvider>();
        provider.Setup(x => x.GetAuthenticationStateAsync())
            .ReturnsAsync(new AuthenticationState(user));

        Services.AddSingleton(provider.Object);
    }

    private static ClaimsPrincipal CreateAuthenticatedUser(string twitchId)
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "Dadson"),
            new Claim(ClaimTypes.Role, "Admin"),
            new Claim(ClaimTypes.NameIdentifier, twitchId),
            new Claim("CreatedAt", "2024-01-10T12:00:00Z"),
            new Claim("LastLoginAt", "2025-02-20T18:30:00Z"),
            new Claim("ProfileImageUrl", "https://example.com/avatar.png")
        };

        return new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuthType"));
    }
}
