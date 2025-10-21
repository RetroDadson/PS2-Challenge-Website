using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PS2Challenge.Backend.Models;

namespace PS2Challenge.Backend.Data.Repositories;

public class UserRepository
{
    private readonly IServiceScopeFactory _scopeFactory;

    public UserRepository(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public async Task<ApplicationUser?> GetByTwitchIdAsync(string twitchId)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        return await dbContext.Users
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.TwitchId == twitchId);
    }

    public async Task<ApplicationUser> CreateAsync(ApplicationUser user)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync();

        return user;
    }

    public async Task UpdateAsync(ApplicationUser user)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        dbContext.Users.Update(user);
        await dbContext.SaveChangesAsync();
    }

    public async Task<ApplicationUser?> GetByIdAsync(int id)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        return await dbContext.Users
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.Id == id);
    }

    public async Task<Role?> GetRoleByNameAsync(string roleName)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        return await dbContext.Roles
            .FirstOrDefaultAsync(r => r.Name == roleName);
    }

    public async Task<Role?> GetRoleByIdAsync(int roleId)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        return await dbContext.Roles
            .FirstOrDefaultAsync(r => r.Id == roleId);
    }

    public async Task<List<ApplicationUser>> GetAllUsersAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        return await dbContext.Users
            .Include(u => u.Role)
            .OrderByDescending(u => u.LastLoginAt)
            .ToListAsync();
    }

    public async Task<List<Role>> GetAllRolesAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        return await dbContext.Roles
            .OrderBy(r => r.Name)
            .ToListAsync();
    }

    public async Task<ApplicationUser?> GetUserByTwitchIdAsync(string twitchId)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        return await dbContext.Users
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.TwitchId == twitchId);
    }

    public async Task<ApplicationUser> CreateUserAsync(string twitchId, string username)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        // Get default "User" role
        var userRole = await dbContext.Roles.FirstOrDefaultAsync(r => r.Name == "User");
        if (userRole == null)
        {
            throw new InvalidOperationException("Default 'User' role not found in database");
        }

        var user = new ApplicationUser
        {
            TwitchId = twitchId,
            TwitchUsername = username,
            RoleId = userRole.Id,
            CreatedAt = DateTime.UtcNow,
            LastLoginAt = DateTime.UtcNow,
            ApiKey = GenerateSecureApiKey()
        };

        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync();

        // Reload with Role navigation property
        return await dbContext.Users
            .Include(u => u.Role)
            .FirstAsync(u => u.Id == user.Id);
    }

    public async Task UpdateLastLoginAsync(int userId)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        var user = await dbContext.Users.FindAsync(userId);
        if (user != null)
        {
            user.LastLoginAt = DateTime.UtcNow;
            await dbContext.SaveChangesAsync();
        }
    }

    /// <summary>
    /// Generates a new API key for the specified user
    /// </summary>
    public async Task<string> GenerateApiKeyAsync(int userId)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        var user = await dbContext.Users.FindAsync(userId);
        if (user == null)
        {
            throw new InvalidOperationException($"User with ID {userId} not found");
        }

        user.ApiKey = GenerateSecureApiKey();
        await dbContext.SaveChangesAsync();

        return user.ApiKey;
    }

    /// <summary>
    /// Gets a user by their API key
    /// </summary>
    public async Task<ApplicationUser?> GetByApiKeyAsync(string apiKey)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        return await dbContext.Users
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.ApiKey == apiKey);
    }

    /// <summary>
    /// Generates a cryptographically secure 64-character hexadecimal API key
    /// </summary>
    private static string GenerateSecureApiKey()
    {
        var bytes = new byte[32]; // 32 bytes = 64 hex characters
        using var rng = System.Security.Cryptography.RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
