using Microsoft.AspNetCore.Mvc;
using Moq;
using PS2Challenge.Api.Api.Controllers;
using PS2Challenge.Backend.Data.Repositories;
using PS2Challenge.Backend.Models;
using System.Security.Claims;

namespace PS2Challenge.Main.Tests.Controllers;

public class AdminControllerTests
{
    private readonly Mock<UserRepository> _userRepository;
    private readonly Mock<ILogger<AdminController>> _logger;
    private readonly AdminController _controller;

    public AdminControllerTests()
    {
        _userRepository = new Mock<UserRepository>(Mock.Of<IServiceScopeFactory>());
        _logger = new Mock<ILogger<AdminController>>();
        _controller = new AdminController(_userRepository.Object, _logger.Object);
        SetupAdminUser("1", "admin-user");
    }

    [Fact]
    public async Task GetAllUsers_ReturnsOk_WithUsers()
    {
        _userRepository.Setup(r => r.GetAllUsersAsync()).ReturnsAsync(
        [
            new ApplicationUser { Id = 1, TwitchId = "t1", TwitchUsername = "user1", RoleId = 2, Role = new Role { Id = 2, Name = "User" } },
            new ApplicationUser { Id = 2, TwitchId = "t2", TwitchUsername = "user2", RoleId = 1, Role = new Role { Id = 1, Name = "Admin" } }
        ]);

        var result = await _controller.GetAllUsers();

        var ok = Assert.IsType<OkObjectResult>(result);
        var users = Assert.IsAssignableFrom<IEnumerable<object>>(ok.Value);
        Assert.Equal(2, users.Count());
    }

    [Fact]
    public async Task GetAllRoles_ReturnsOk_WithRoles()
    {
        _userRepository.Setup(r => r.GetAllRolesAsync()).ReturnsAsync(
        [
            new Role { Id = 1, Name = "Admin", Description = "Admin role" },
            new Role { Id = 2, Name = "User", Description = "User role" }
        ]);

        var result = await _controller.GetAllRoles();

        var ok = Assert.IsType<OkObjectResult>(result);
        var roles = Assert.IsAssignableFrom<IEnumerable<object>>(ok.Value);
        Assert.Equal(2, roles.Count());
    }

    [Fact]
    public async Task UpdateUserRole_ReturnsNotFound_WhenUserMissing()
    {
        _userRepository.Setup(r => r.GetByIdAsync(44)).ReturnsAsync((ApplicationUser?)null);

        var result = await _controller.UpdateUserRole(44, new AdminController.UpdateRoleRequest { RoleId = 2 });

        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task UpdateUserRole_ReturnsBadRequest_WhenRoleInvalid()
    {
        _userRepository.Setup(r => r.GetByIdAsync(2)).ReturnsAsync(new ApplicationUser
        {
            Id = 2,
            TwitchId = "tw-target",
            TwitchUsername = "target",
            RoleId = 2,
            Role = new Role { Id = 2, Name = "User" }
        });
        _userRepository.Setup(r => r.GetRoleByIdAsync(999)).ReturnsAsync((Role?)null);

        var result = await _controller.UpdateUserRole(2, new AdminController.UpdateRoleRequest { RoleId = 999 });

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UpdateUserRole_ReturnsBadRequest_WhenSelfDemotionAttempted()
    {
        _userRepository.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(new ApplicationUser
        {
            Id = 1,
            TwitchId = "tw-admin",
            TwitchUsername = "admin-user",
            RoleId = 1,
            Role = new Role { Id = 1, Name = "Admin" }
        });
        _userRepository.Setup(r => r.GetRoleByIdAsync(2)).ReturnsAsync(new Role { Id = 2, Name = "User" });
        _userRepository.Setup(r => r.GetRoleByNameAsync("Admin")).ReturnsAsync(new Role { Id = 1, Name = "Admin" });

        var result = await _controller.UpdateUserRole(1, new AdminController.UpdateRoleRequest { RoleId = 2 });

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UpdateUserRole_ReturnsOk_WhenUpdateSucceeds()
    {
        var target = new ApplicationUser
        {
            Id = 5,
            TwitchId = "tw-target-5",
            TwitchUsername = "target-user",
            RoleId = 2,
            Role = new Role { Id = 2, Name = "User" }
        };

        _userRepository.Setup(r => r.GetByIdAsync(5)).ReturnsAsync(target);
        _userRepository.Setup(r => r.GetRoleByIdAsync(1)).ReturnsAsync(new Role { Id = 1, Name = "Admin" });
        _userRepository.Setup(r => r.GetRoleByNameAsync("Admin")).ReturnsAsync(new Role { Id = 1, Name = "Admin" });
        _userRepository.Setup(r => r.UpdateAsync(It.IsAny<ApplicationUser>())).Returns(Task.CompletedTask);

        var result = await _controller.UpdateUserRole(5, new AdminController.UpdateRoleRequest { RoleId = 1 });

        Assert.IsType<OkObjectResult>(result);
        _userRepository.Verify(r => r.UpdateAsync(It.Is<ApplicationUser>(u => u.Id == 5 && u.RoleId == 1)), Times.Once);
    }

    private void SetupAdminUser(string userId, string username)
    {
        var claims = new List<Claim>
        {
            new("UserId", userId),
            new(ClaimTypes.Name, username),
            new(ClaimTypes.Role, "Admin")
        };

        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Test"))
            }
        };
    }
}
