using Microsoft.AspNetCore.Mvc;
using Moq;
using PS2Challenge.Api.Api.Controllers;
using PS2Challenge.Backend.Data.Repositories;
using System.Security.Claims;
using System.Text.Json;

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
}