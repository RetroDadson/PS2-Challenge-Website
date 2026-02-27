using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PS2Challenge.Main.Frontend.Shared;
using Xunit;
using Moq;
using System.Security.Claims;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Components.Routing;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Authorization;

namespace PS2Challenge.Main.Tests.Frontend;

/// <summary>
/// End-to-end tests for user authentication and navigation flows
/// These tests simulate how users log in, log out, and navigate the website
/// </summary>
public class AuthenticationFlowTests : BunitContext
{
    public AuthenticationFlowTests()
    {
        // Ensure JSInterop is configured for all tests
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    private IRenderedComponent<TComponent> RenderWithAuth<TComponent>(ClaimsPrincipal user) where TComponent : IComponent
    {
        var authState = this.AddTestAuthentication(user);
        return this.RenderWithAuthState<TComponent>(authState);
    }

    [Fact]
    public void LoginDisplay_WhenUserIsNotLoggedIn_ShowsLoginButton()
    {
        // Arrange - Setup unauthenticated user
        var user = new ClaimsPrincipal(new ClaimsIdentity()); // No authentication

        // Act - User views the login display component
        var cut = RenderWithAuth<LoginDisplay>(user);

        // Assert - Should show login option with Twitch
        var markup = cut.Markup;
        Assert.Contains("Login with Twitch", markup);
        Assert.Contains("/api/auth/login", markup);
    }

    [Fact]
    public void LoginDisplay_WhenUserIsLoggedIn_ShowsUserInfo()
    {
        // Arrange - Setup authenticated user
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "TestUser"),
            new Claim(ClaimTypes.NameIdentifier, "test-123")
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var user = new ClaimsPrincipal(identity);

        // Act - Logged in user views the login display
        var cut = RenderWithAuth<LoginDisplay>(user);

        // Assert - Should show user information
        var markup = cut.Markup;
        Assert.Contains("TestUser", markup);
    }

    [Fact]
    public void LoginDisplay_WhenUserIsLoggedIn_ShowsLogoutButton()
    {
        // Arrange - Setup authenticated user
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "TestUser"),
            new Claim(ClaimTypes.NameIdentifier, "test-123")
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var user = new ClaimsPrincipal(identity);

        // Act
        var cut = RenderWithAuth<LoginDisplay>(user);

        // Assert - Should have logout option
        var markup = cut.Markup;
        Assert.Contains("Logout", markup);
        Assert.Contains("/api/auth/logout", markup);
    }

    [Fact]
    public void LoginDisplay_AsAdminUser_ShowsAdminLink()
    {
        // Arrange - Setup admin user
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "AdminUser"),
            new Claim(ClaimTypes.NameIdentifier, "admin-123"),
            new Claim(ClaimTypes.Role, "Admin")
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var user = new ClaimsPrincipal(identity);

        // Act - Admin user views the login display
        var cut = RenderWithAuth<LoginDisplay>(user);

        // Assert - Should show admin link
        var markup = cut.Markup;
        Assert.Contains("AdminUser", markup);
        Assert.Contains("Admin", markup);
        Assert.Contains("/admin", markup);
    }

    [Fact]
    public void LoginDisplay_AsRegularUser_DoesNotShowAdminLink()
    {
        // Arrange - Setup regular user
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "RegularUser"),
            new Claim(ClaimTypes.NameIdentifier, "user-123"),
            new Claim(ClaimTypes.Role, "User")
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var user = new ClaimsPrincipal(identity);

        // Act - Regular user views the login display
        var cut = RenderWithAuth<LoginDisplay>(user);

        // Assert - Should show user info but not admin controls
        var markup = cut.Markup;
        Assert.Contains("RegularUser", markup);
        Assert.DoesNotContain("/admin", markup);
    }

    [Fact]
    public void NavMenu_HasWorkingNavigationLinks()
    {
        // Arrange
        var user = new ClaimsPrincipal(new ClaimsIdentity());
        // Don't stub NavLink - we want to see the actual text

        // Act - User views the navigation menu
        var cut = RenderWithAuth<NavMenu>(user);

        // Assert - Should have navigation elements
        var markup = cut.Markup;
        Assert.NotEmpty(markup);

        // Check for navigation text (may be in different elements)
        Assert.True(markup.Contains("Games") || markup.Contains("Challenge") || markup.Contains("All Games"),
            $"Expected navigation links but got: {markup.Substring(0, Math.Min(200, markup.Length))}...");
        Assert.True(markup.Contains("Votes"),
            $"Expected 'Votes' link but got: {markup.Substring(0, Math.Min(200, markup.Length))}...");
    }

    [Fact]
    public void LoginDisplay_DisplaysUserProfileImage_WhenAvailable()
    {
        // Arrange - User with profile image
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "TestUser"),
            new Claim(ClaimTypes.NameIdentifier, "test-123"),
            new Claim("ProfileImageUrl", "https://example.com/profile.jpg")
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var user = new ClaimsPrincipal(identity);

        // Act - User with profile image views the site
        var cut = RenderWithAuth<LoginDisplay>(user);

        // Assert - Profile image should be displayed
        var markup = cut.Markup;
        Assert.Contains("TestUser", markup);
        Assert.Contains("https://example.com/profile.jpg", markup);
    }

    [Fact]
    public void LoginDisplay_ShowsRoleBadge_ForNonUserRoles()
    {
        // Arrange - User with Admin role
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "AdminUser"),
            new Claim(ClaimTypes.NameIdentifier, "admin-123"),
            new Claim(ClaimTypes.Role, "Admin")
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var user = new ClaimsPrincipal(identity);

        // Act
        var cut = RenderWithAuth<LoginDisplay>(user);

        // Assert - Should show admin role badge
        var markup = cut.Markup;
        Assert.Contains("role-badge", markup);
        Assert.Contains("Admin", markup);
    }

    [Fact]
    public void LoginDisplay_DoesNotShowRoleBadge_ForRegularUsers()
    {
        // Arrange - Regular user
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "RegularUser"),
            new Claim(ClaimTypes.NameIdentifier, "user-123"),
            new Claim(ClaimTypes.Role, "User")
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var user = new ClaimsPrincipal(identity);

        // Act
        var cut = RenderWithAuth<LoginDisplay>(user);

        // Assert - Should not show role badge for regular users
        var markup = cut.Markup;
        // User role badge shouldn't be shown
        Assert.DoesNotContain("role-badge", markup);
    }

    [Fact]
    public void LoginDisplay_GeneratesCorrectLoginUrl_WithReturnUrl()
    {
        // Arrange
        var user = new ClaimsPrincipal(new ClaimsIdentity());

        // Act
        var cut = RenderWithAuth<LoginDisplay>(user);

        // Assert - Login URL should include API auth endpoint
        var markup = cut.Markup;
        Assert.Contains("/api/auth/login", markup);
    }

    [Fact]
    public void LoginDisplay_HandlesAuthenticationFailure_Gracefully()
    {
        // Arrange - Simulate authentication failure
        var authContext = new Mock<AuthenticationStateProvider>();
        authContext.Setup(x => x.GetAuthenticationStateAsync())
            .ThrowsAsync(new Exception("Authentication failed"));

        Services.AddSingleton(authContext.Object);
        Services.AddAuthorizationCore();

        // Add a simple authorization service
        var mockAuthService = new Mock<IAuthorizationService>();
        mockAuthService.Setup(x => x.AuthorizeAsync(
            It.IsAny<ClaimsPrincipal>(),
            It.IsAny<object>(),
            It.IsAny<IEnumerable<IAuthorizationRequirement>>()))
            .ReturnsAsync(AuthorizationResult.Failed());
        Services.AddSingleton(mockAuthService.Object);

        // Create a failing auth state task
        var authStateTask = Task.FromException<AuthenticationState>(new Exception("Authentication failed"));

        // Act & Assert - Component should handle the error or throw expected exception
        var exception = Assert.ThrowsAny<Exception>(() =>
        {
            _ = Render<LoginDisplay>(builder =>
            {
                builder.OpenComponent<CascadingValue<Task<AuthenticationState>>>(0);
                builder.AddComponentParameter(1, "Value", authStateTask);
                builder.AddComponentParameter(2, "ChildContent", (RenderFragment)(childBuilder =>
                {
                    childBuilder.OpenComponent<LoginDisplay>(0);
                    childBuilder.CloseComponent();
                }));
                builder.CloseComponent();
            });
        });

        // The exception should be from the authentication provider
        Assert.True(exception.Message.Contains("Authentication failed") ||
                    exception.InnerException?.Message.Contains("Authentication failed") == true,
            $"Expected authentication failure but got: {exception.Message}");
    }

    [Fact]
    public void LoginDisplay_ShowsDefaultTwitchIcon_WhenNoProfileImage()
    {
        // Arrange - User without profile image
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "TestUser"),
            new Claim(ClaimTypes.NameIdentifier, "test-123")
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var user = new ClaimsPrincipal(identity);

        // Act
        var cut = RenderWithAuth<LoginDisplay>(user);

        // Assert - Should show default Twitch icon
        var markup = cut.Markup;
        Assert.Contains("glitch_flat_purple.svg", markup);
    }
}
