using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Data.Repositories;
using PS2Challenge.Backend.Services;
using PS2Challenge.Main.Frontend.Pages;
using Xunit;
using Moq;
using System.Security.Claims;
using PS2Challenge.Main.Api.Hubs;

namespace PS2Challenge.Main.Tests.Frontend;

/// <summary>
/// End-to-end tests for the Admin page from an administrator's perspective
/// These tests simulate how admins interact with the management interface
/// </summary>
public class AdminPageTests : BunitContext
{
    private readonly Mock<GameService> _mockGameService;
    private readonly Mock<GameCoverService> _mockCoverService;
    private readonly Mock<UserRepository> _mockUserRepository;

    public AdminPageTests()
    {
        _mockGameService = new Mock<GameService>(null!);
        _mockCoverService = new Mock<GameCoverService>(null!); // Only one parameter
        _mockUserRepository = new Mock<UserRepository>(null!);

        // Configure JSInterop
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    private IRenderedComponent<Admin> RenderAdminWithAuth(ClaimsPrincipal user)
    {
        var authState = this.AddTestAuthentication(user);

        // Register services
        Services.AddSingleton(_mockGameService.Object);
        Services.AddSingleton(_mockCoverService.Object);
        Services.AddSingleton(_mockUserRepository.Object);
        Services.AddMockHubContext<GamesHub>();

        return this.RenderWithAuthState<Admin>(authState);
    }

    [Fact]
    public async Task AdminPage_AsAdminUser_CanAccessPage()
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

        SetupBasicAdminData();

        // Act - Admin navigates to admin page
        var cut = RenderAdminWithAuth(user);
        await Task.Delay(100);

        // Assert - Admin page should load successfully
        var markup = cut.Markup;
        Assert.Contains("Admin Panel", markup);
    }

    [Fact]
    public async Task AdminPage_DisplaysUserManagementSection()
    {
        // Arrange
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "AdminUser"),
            new Claim(ClaimTypes.NameIdentifier, "admin-123"),
            new Claim(ClaimTypes.Role, "Admin")
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var user = new ClaimsPrincipal(identity);

        var users = new List<ApplicationUser>
        {
            new ApplicationUser
            {
                Id = 1,
                TwitchUsername = "User1",
                TwitchId = "twitch-1",
                RoleId = 2,
                Role = new Role { Id = 2, Name = "User" },
                CreatedAt = DateTime.UtcNow,
                LastLoginAt = DateTime.UtcNow
            },
            new ApplicationUser
            {
                Id = 2,
                TwitchUsername = "User2",
                TwitchId = "twitch-2",
                RoleId = 2,
                Role = new Role { Id = 2, Name = "User" },
                CreatedAt = DateTime.UtcNow,
                LastLoginAt = DateTime.UtcNow
            }
        };

        var roles = new List<Role>
        {
            new Role { Id = 1, Name = "Admin" },
            new Role { Id = 2, Name = "User" }
        };

        _mockUserRepository.Setup(r => r.GetAllUsersAsync()).ReturnsAsync(users);
        _mockUserRepository.Setup(r => r.GetAllRolesAsync()).ReturnsAsync(roles);

        // Act - Admin views user management
        var cut = RenderAdminWithAuth(user);
        await Task.Delay(100);

        // Assert - Should show user list
        var markup = cut.Markup;
        Assert.Contains("User Management", markup);
        Assert.Contains("User1", markup);
        Assert.Contains("User2", markup);
    }

    [Fact]
    public async Task AdminPage_DisplaysSystemMaintenanceSection()
    {
        // Arrange
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "AdminUser"),
            new Claim(ClaimTypes.NameIdentifier, "admin-123"),
            new Claim(ClaimTypes.Role, "Admin")
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var user = new ClaimsPrincipal(identity);

        SetupBasicAdminData();

        // Act
        var cut = RenderAdminWithAuth(user);
        await Task.Delay(100);

        // Assert - Should show system maintenance section
        var markup = cut.Markup;
        Assert.Contains("System Maintenance", markup);
        Assert.Contains("Update Game Cover Images", markup);
    }

    [Fact]
    public async Task AdminPage_CanUpdateCoverImages()
    {
        // Arrange
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "AdminUser"),
            new Claim(ClaimTypes.NameIdentifier, "admin-123"),
            new Claim(ClaimTypes.Role, "Admin")
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var user = new ClaimsPrincipal(identity);

        SetupBasicAdminData();

        var games = new List<GameDto>
        {
            new GameDto { Id = 1, Title = "God of War", ImageUrl = "old-url.jpg" }
        };

        _mockGameService.Setup(s => s.GetAllGamesAsync()).ReturnsAsync(games);
        _mockCoverService.Setup(s => s.GetCoverUrlsAsync(It.IsAny<IEnumerable<int>>()))
            .ReturnsAsync(new Dictionary<int, string> { { 1, "new-url.jpg" } });
        _mockGameService.Setup(s => s.UpdateGameCoverUrlAsync(It.IsAny<int>(), It.IsAny<string>()))
            .Returns(Task.CompletedTask);

        var cut = RenderAdminWithAuth(user);
        await Task.Delay(100);

        // Assert - Should have update cover images button
        var markup = cut.Markup;
        Assert.Contains("Update Cover Images Now", markup);
    }

    [Fact]
    public async Task AdminPage_DisplaysNavigationCards()
    {
        // Arrange
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "AdminUser"),
            new Claim(ClaimTypes.NameIdentifier, "admin-123"),
            new Claim(ClaimTypes.Role, "Admin")
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var user = new ClaimsPrincipal(identity);

        SetupBasicAdminData();

        // Act
        var cut = RenderAdminWithAuth(user);
        await Task.Delay(100);

        // Assert - Should show navigation cards
        var markup = cut.Markup;
        Assert.Contains("Games Management", markup);
        Assert.Contains("User Management", markup);
    }

    [Fact]
    public async Task AdminPage_CanManageUserRoles()
    {
        // Arrange
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "AdminUser"),
            new Claim(ClaimTypes.NameIdentifier, "admin-123"),
            new Claim(ClaimTypes.Role, "Admin")
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var user = new ClaimsPrincipal(identity);

        var testUser = new ApplicationUser
        {
            Id = 1,
            TwitchUsername = "TestUser",
            TwitchId = "test-123",
            RoleId = 2, // Regular user
            Role = new Role { Id = 2, Name = "User" },
            CreatedAt = DateTime.UtcNow,
            LastLoginAt = DateTime.UtcNow
        };

        var roles = new List<Role>
        {
            new Role { Id = 1, Name = "Admin" },
            new Role { Id = 2, Name = "User" }
        };

        _mockUserRepository.Setup(r => r.GetAllUsersAsync()).ReturnsAsync(new List<ApplicationUser> { testUser });
        _mockUserRepository.Setup(r => r.GetAllRolesAsync()).ReturnsAsync(roles);
        _mockUserRepository.Setup(r => r.GetByIdAsync(testUser.Id)).ReturnsAsync(testUser);
        _mockUserRepository.Setup(r => r.UpdateAsync(It.IsAny<ApplicationUser>())).Returns(Task.CompletedTask);

        var cut = RenderAdminWithAuth(user);
        await Task.Delay(100);

        // Assert - Should have role management controls (role select dropdown)
        var markup = cut.Markup;
        Assert.Contains("TestUser", markup);
        Assert.Contains("role-select", markup);
    }

    [Fact]
    public async Task AdminPage_ShowsUserLoginDates()
    {
        // Arrange
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "AdminUser"),
            new Claim(ClaimTypes.NameIdentifier, "admin-123"),
            new Claim(ClaimTypes.Role, "Admin")
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var user = new ClaimsPrincipal(identity);

        var recentUser = new ApplicationUser
        {
            Id = 1,
            TwitchUsername = "RecentUser",
            TwitchId = "recent-123",
            RoleId = 2,
            Role = new Role { Id = 2, Name = "User" },
            LastLoginAt = DateTime.UtcNow.AddMinutes(-5), // Logged in 5 minutes ago
            CreatedAt = DateTime.UtcNow.AddDays(-1)
        };

        var roles = new List<Role>
        {
            new Role { Id = 1, Name = "Admin" },
            new Role { Id = 2, Name = "User" }
        };

        _mockUserRepository.Setup(r => r.GetAllUsersAsync()).ReturnsAsync(new List<ApplicationUser> { recentUser });
        _mockUserRepository.Setup(r => r.GetAllRolesAsync()).ReturnsAsync(roles);

        // Act - Admin views user activity
        var cut = RenderAdminWithAuth(user);
        await Task.Delay(100);

        // Assert - Should show user with login information
        var markup = cut.Markup;
        Assert.Contains("RecentUser", markup);
        Assert.Contains("Last Login", markup);
    }

    [Fact]
    public async Task AdminPage_DisplaysUserProfileImages()
    {
        // Arrange
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "AdminUser"),
            new Claim(ClaimTypes.NameIdentifier, "admin-123"),
            new Claim(ClaimTypes.Role, "Admin")
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var user = new ClaimsPrincipal(identity);

        var userWithImage = new ApplicationUser
        {
            Id = 1,
            TwitchUsername = "UserWithImage",
            TwitchId = "img-123",
            ProfileImageUrl = "https://example.com/profile.jpg",
            RoleId = 2,
            Role = new Role { Id = 2, Name = "User" },
            CreatedAt = DateTime.UtcNow,
            LastLoginAt = DateTime.UtcNow
        };

        var roles = new List<Role>
        {
            new Role { Id = 1, Name = "Admin" },
            new Role { Id = 2, Name = "User" }
        };

        _mockUserRepository.Setup(r => r.GetAllUsersAsync()).ReturnsAsync(new List<ApplicationUser> { userWithImage });
        _mockUserRepository.Setup(r => r.GetAllRolesAsync()).ReturnsAsync(roles);

        // Act
        var cut = RenderAdminWithAuth(user);
        await Task.Delay(100);

        // Assert - Should display user avatar
        var markup = cut.Markup;
        Assert.Contains("UserWithImage", markup);
        Assert.Contains("user-avatar", markup);
    }

    private void SetupBasicAdminData()
    {
        _mockUserRepository.Setup(r => r.GetAllUsersAsync()).ReturnsAsync(new List<ApplicationUser>());
        _mockUserRepository.Setup(r => r.GetAllRolesAsync()).ReturnsAsync(new List<Role>
        {
            new Role { Id = 1, Name = "Admin" },
            new Role { Id = 2, Name = "User" }
        });
    }
}
