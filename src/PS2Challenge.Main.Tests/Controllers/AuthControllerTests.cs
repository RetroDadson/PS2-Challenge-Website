using Microsoft.AspNetCore.Mvc;
using Moq;
using PS2Challenge.Api.Api.Controllers;
using PS2Challenge.Backend.Data.Repositories;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using PS2Challenge.Backend.Models;
using Microsoft.AspNetCore.Mvc.Routing;

namespace PS2Challenge.Main.Tests.Controllers;

public class AuthControllerTests
{
    private readonly Mock<UserRepository> _userRepository;
    private readonly AuthController _controller;

    public AuthControllerTests()
    {
        _userRepository = new Mock<UserRepository>(Mock.Of<IServiceScopeFactory>());
        _controller = new AuthController(_userRepository.Object);
    }

    [Fact]
    public async Task GetCurrentUser_ReturnsGeneric500Payload_WhenRepositoryThrows()
    {
        _userRepository.Setup(r => r.GetUserByTwitchIdAsync("tw-1"))
            .ThrowsAsync(new InvalidOperationException("Sensitive failure details"));

        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                [
                    new Claim(ClaimTypes.NameIdentifier, "tw-1"),
                    new Claim(ClaimTypes.Name, "tester")
                ], "Test"))
            }
        };

        var result = await _controller.GetCurrentUser();

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, objectResult.StatusCode);

        var json = JsonSerializer.Serialize(objectResult.Value);
        Assert.Contains("Internal server error", json);
        Assert.DoesNotContain("Sensitive failure details", json);
    }

    [Fact]
    public async Task GetCurrentUser_ReturnsUnauthenticated_WhenNoIdentity()
    {
        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity())
            }
        };

        var result = await _controller.GetCurrentUser();

        var ok = Assert.IsType<OkObjectResult>(result);
        var json = JsonSerializer.Serialize(ok.Value);
        Assert.Contains("IsAuthenticated", json);
        Assert.Contains("false", json.ToLowerInvariant());
    }

    [Fact]
    public async Task Logout_AbsoluteReturnUrl_RedirectsToPathAndQuery()
    {
        _controller.ControllerContext = CreateControllerContextForLogout(isHttps: true);

        var result = await _controller.Logout("https%3A%2F%2Fexample.com%2Fuser%3Ftab%3Dprofile");

        var redirect = Assert.IsType<RedirectResult>(result);
        Assert.Equal("/user?tab=profile", redirect.Url);
    }

    [Fact]
    public async Task Logout_RelativeReturnUrlWithoutSlash_AddsLeadingSlash()
    {
        _controller.ControllerContext = CreateControllerContextForLogout(isHttps: false);

        var result = await _controller.Logout("dashboard");

        var redirect = Assert.IsType<RedirectResult>(result);
        Assert.Equal("/dashboard", redirect.Url);
    }

    [Fact]
    public void Login_WithEncodedReturnUrl_PreservesDecodedRedirectUri()
    {
        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext()
        };

        var result = _controller.Login("https%3A%2F%2Fexample.com%2Fvotes%3Ftab%3Dcurrent");

        var challenge = Assert.IsType<ChallengeResult>(result);
        Assert.Equal("Twitch", Assert.Single(challenge.AuthenticationSchemes));
        Assert.Equal("https://example.com/votes?tab=current", challenge.Properties?.RedirectUri);
        Assert.Equal("https://example.com/votes?tab=current", challenge.Properties?.Items["returnUrl"]);
        Assert.True(challenge.Properties?.AllowRefresh);
        Assert.True(challenge.Properties?.IsPersistent);
    }

    [Fact]
    public void Login_WithoutReturnUrl_UsesRootRedirect()
    {
        var urlHelper = new Mock<IUrlHelper>();
        urlHelper.Setup(u => u.Content("~/")).Returns("/");
        _controller.Url = urlHelper.Object;

        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext()
        };

        var result = _controller.Login();

        var challenge = Assert.IsType<ChallengeResult>(result);
        Assert.Equal("/", challenge.Properties?.RedirectUri);
    }

    [Fact]
    public async Task GetCurrentUser_ReturnsUnauthenticated_WhenMissingNameIdentifier()
    {
        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                [
                    new Claim(ClaimTypes.Name, "tester")
                ], "Test"))
            }
        };

        var result = await _controller.GetCurrentUser();

        var ok = Assert.IsType<OkObjectResult>(result);
        var json = JsonSerializer.Serialize(ok.Value);
        Assert.Contains("IsAuthenticated", json);
        Assert.Contains("false", json.ToLowerInvariant());
    }

    [Fact]
    public async Task GetCurrentUser_ReturnsUnauthenticated_WhenRepositoryReturnsNull()
    {
        _userRepository.Setup(r => r.GetUserByTwitchIdAsync("tw-null")).ReturnsAsync((ApplicationUser?)null);

        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                [
                    new Claim(ClaimTypes.NameIdentifier, "tw-null"),
                    new Claim(ClaimTypes.Name, "tester")
                ], "Test"))
            }
        };

        var result = await _controller.GetCurrentUser();

        var ok = Assert.IsType<OkObjectResult>(result);
        var json = JsonSerializer.Serialize(ok.Value);
        Assert.Contains("false", json.ToLowerInvariant());
    }

    [Fact]
    public async Task GetCurrentUser_ReturnsProfile_WhenUserFound()
    {
        _userRepository.Setup(r => r.GetUserByTwitchIdAsync("tw-ok")).ReturnsAsync(new ApplicationUser
        {
            Id = 11,
            TwitchId = "tw-ok",
            TwitchUsername = "Dadson",
            RoleId = 1,
            Role = new Role { Id = 1, Name = "Admin" },
            CreatedAt = DateTime.UtcNow,
            LastLoginAt = DateTime.UtcNow
        });

        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                [
                    new Claim(ClaimTypes.NameIdentifier, "tw-ok"),
                    new Claim(ClaimTypes.Name, "tester")
                ], "Test"))
            }
        };

        var result = await _controller.GetCurrentUser();

        var ok = Assert.IsType<OkObjectResult>(result);
        var json = JsonSerializer.Serialize(ok.Value);
        Assert.Contains("true", json.ToLowerInvariant());
        Assert.Contains("Dadson", json);
        Assert.Contains("Admin", json);
    }

    private static ControllerContext CreateControllerContextForLogout(bool isHttps)
    {
        var authService = new Mock<IAuthenticationService>();
        authService
            .Setup(a => a.SignOutAsync(
                It.IsAny<HttpContext>(),
                It.IsAny<string?>(),
                It.IsAny<AuthenticationProperties?>()))
            .Returns(Task.CompletedTask);

        var services = new ServiceCollection()
            .AddSingleton(authService.Object)
            .BuildServiceProvider();

        var httpContext = new DefaultHttpContext
        {
            RequestServices = services
        };

        httpContext.Request.Scheme = isHttps ? "https" : "http";

        return new ControllerContext { HttpContext = httpContext };
    }
}