using PS2Challenge.Backend.Data;
using PS2Challenge.Backend.Data.Repositories;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Tests.Helpers;

namespace PS2Challenge.Backend.Tests.Repositories;

public class UserRepositoryTests : IDisposable
{
    private readonly Ps2ChallengeDbContext _context;
    private readonly UserRepository _userRepository;

    public UserRepositoryTests()
    {
        _context = TestDbContextFactory.CreateInMemoryContext();
        var scopeFactory = TestDbContextFactory.CreateServiceScopeFactory(_context);
        _userRepository = new UserRepository(scopeFactory);
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task GetByTwitchIdAsync_ReturnsUser_WhenExists()
    {
        // Arrange
        var role = new Role { Id = 1, Name = "User" };
        _context.Roles.Add(role);

        var user = new ApplicationUserBuilder()
            .WithTwitchId("12345")
            .WithTwitchUsername("testuser")
            .WithRoleId(role.Id)
            .Build();
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        // Act
        var result = await _userRepository.GetByTwitchIdAsync("12345");

        // Assert
        Assert.NotNull(result);
        Assert.Equal("testuser", result.TwitchUsername);
        Assert.NotNull(result.Role);
    }

    [Fact]
    public async Task GetByTwitchIdAsync_ReturnsNull_WhenNotExists()
    {
        // Act
        var result = await _userRepository.GetByTwitchIdAsync("nonexistent");

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public async Task CreateAsync_CreatesUser()
    {
        // Arrange
        var user = new ApplicationUserBuilder()
            .WithId(0) // Should be auto-generated
            .WithTwitchId("12345")
            .WithTwitchUsername("newuser")
            .Build();

        // Act
        var result = await _userRepository.CreateAsync(user);

        // Assert
        Assert.NotEqual(0, result.Id);
        var savedUser = await _context.Users.FindAsync(result.Id);
        Assert.NotNull(savedUser);
        Assert.Equal("newuser", savedUser.TwitchUsername);
    }

    [Fact]
    public async Task UpdateAsync_UpdatesUser()
    {
        // Arrange
        var user = new ApplicationUserBuilder()
            .WithTwitchId("12345")
            .WithTwitchUsername("oldname")
            .Build();
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        // Act
        user.TwitchUsername = "newname";
        await _userRepository.UpdateAsync(user);

        // Assert
        var updatedUser = await _context.Users.FindAsync(user.Id);
        Assert.Equal("newname", updatedUser!.TwitchUsername);
    }

    [Fact]
    public async Task GetByIdAsync_ReturnsUser_WhenExists()
    {
        // Arrange
        var role = new Role { Id = 1, Name = "Admin" };
        _context.Roles.Add(role);

        var user = new ApplicationUserBuilder()
            .WithId(1)
            .WithRoleId(role.Id)
            .Build();
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        // Act
        var result = await _userRepository.GetByIdAsync(1);

        // Assert
        Assert.NotNull(result);
        Assert.NotNull(result.Role);
        Assert.Equal("Admin", result.Role.Name);
    }

    [Fact]
    public async Task GetRoleByNameAsync_ReturnsRole_WhenExists()
    {
        // Arrange
        var role = new Role { Id = 1, Name = "Admin" };
        _context.Roles.Add(role);
        await _context.SaveChangesAsync();

        // Act
        var result = await _userRepository.GetRoleByNameAsync("Admin");

        // Assert
        Assert.NotNull(result);
        Assert.Equal("Admin", result.Name);
    }

    [Fact]
    public async Task GetRoleByIdAsync_ReturnsRole_WhenExists()
    {
        // Arrange
        var role = new Role { Id = 1, Name = "User" };
        _context.Roles.Add(role);
        await _context.SaveChangesAsync();

        // Act
        var result = await _userRepository.GetRoleByIdAsync(1);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("User", result.Name);
    }

    [Fact]
    public async Task GetAllUsersAsync_ReturnsAllUsers_OrderedByLastLogin()
    {
        // Arrange
        var role = new Role { Id = 1, Name = "User" };
        _context.Roles.Add(role);

        var user1 = new ApplicationUserBuilder()
            .WithId(1)
            .WithRoleId(1)
            .WithTwitchUsername("user1")
            .WithLastLoginAt(DateTime.UtcNow.AddDays(-5))
            .Build();

        var user2 = new ApplicationUserBuilder()
            .WithId(2)
            .WithRoleId(1)
            .WithTwitchUsername("user2")
            .WithLastLoginAt(DateTime.UtcNow.AddDays(-1))
            .Build();

        _context.Users.AddRange(user1, user2);
        await _context.SaveChangesAsync();

        // Act
        var result = await _userRepository.GetAllUsersAsync();

        // Assert
        Assert.Equal(2, result.Count);
        Assert.Equal("user2", result[0].TwitchUsername); // Most recent first
        Assert.Equal("user1", result[1].TwitchUsername);
    }

    [Fact]
    public async Task GetAllRolesAsync_ReturnsAllRoles_OrderedByName()
    {
        // Arrange
        _context.Roles.AddRange(
            new Role { Id = 1, Name = "User" },
            new Role { Id = 2, Name = "Admin" }
        );
        await _context.SaveChangesAsync();

        // Act
        var result = await _userRepository.GetAllRolesAsync();

        // Assert
        Assert.Equal(2, result.Count);
        Assert.Equal("Admin", result[0].Name); // Alphabetically first
        Assert.Equal("User", result[1].Name);
    }

    [Fact]
    public async Task CreateUserAsync_CreatesUserWithDefaultRole()
    {
        // Arrange
        var userRole = new Role { Id = 2, Name = "User" };
        _context.Roles.Add(userRole);
        await _context.SaveChangesAsync();

        // Act
        var result = await _userRepository.CreateUserAsync("12345", "newuser");

        // Assert
        Assert.NotEqual(0, result.Id);
        Assert.Equal("newuser", result.TwitchUsername);
        Assert.Equal("12345", result.TwitchId);
        Assert.NotNull(result.Role);
        Assert.Equal("User", result.Role.Name);
    }

    [Fact]
    public async Task CreateUserAsync_ThrowsWhenDefaultRoleNotFound()
    {
        // Act & Assert
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _userRepository.CreateUserAsync("12345", "newuser"));
    }

    [Fact]
    public async Task UpdateLastLoginAsync_UpdatesLastLoginTime()
    {
        // Arrange
        var oldTime = DateTime.UtcNow.AddDays(-1);
        var user = new ApplicationUserBuilder()
            .WithId(1)
            .WithLastLoginAt(oldTime)
            .Build();
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        // Act
        await _userRepository.UpdateLastLoginAsync(1);

        // Assert
        var updatedUser = await _context.Users.FindAsync(1);
        Assert.NotNull(updatedUser);
        Assert.True(updatedUser.LastLoginAt > oldTime);
    }

    [Fact]
    public async Task UpdateLastLoginAsync_DoesNotThrow_WhenUserNotFound()
    {
        // Act & Assert (should not throw)
        await _userRepository.UpdateLastLoginAsync(999);
    }

    [Fact]
    public async Task GetUserByTwitchIdAsync_IncludesRoleNavigation()
    {
        // Arrange
        var role = new Role { Id = 1, Name = "Admin" };
        _context.Roles.Add(role);

        var user = new ApplicationUserBuilder()
            .WithTwitchId("12345")
            .WithRoleId(role.Id)
            .Build();
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        // Act
        var result = await _userRepository.GetUserByTwitchIdAsync("12345");

        // Assert
        Assert.NotNull(result);
        Assert.NotNull(result.Role);
        Assert.Equal("Admin", result.Role.Name);
    }
}
