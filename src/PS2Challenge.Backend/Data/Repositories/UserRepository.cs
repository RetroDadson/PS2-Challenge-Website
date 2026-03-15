using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PS2Challenge.Backend.Models;
using System.Security.Cryptography;
using System.Text;

namespace PS2Challenge.Backend.Data.Repositories;

public class UserRepository
{
    private readonly IServiceScopeFactory _scopeFactory;

    public UserRepository(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public virtual async Task<ApplicationUser?> GetByTwitchIdAsync(string twitchId)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        return await dbContext.Users
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.TwitchId == twitchId);
    }

    public virtual async Task<ApplicationUser> CreateAsync(ApplicationUser user)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync();

        return user;
    }

    public virtual async Task UpdateAsync(ApplicationUser user)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        // Load the existing user from the current DbContext to avoid attaching entities
        var existing = await dbContext.Users.FirstOrDefaultAsync(u => u.Id == user.Id);
        if (existing == null)
        {
            throw new InvalidOperationException($"User with ID {user.Id} not found");
        }

        // Update scalar properties only. Avoid replacing navigation properties directly to prevent
        // EF from attempting to track entities from a different context.
        existing.TwitchId = user.TwitchId;
        existing.TwitchUsername = user.TwitchUsername;
        existing.ProfileImageUrl = user.ProfileImageUrl;
        existing.RoleId = user.RoleId;
        existing.CreatedAt = user.CreatedAt;
        existing.LastLoginAt = user.LastLoginAt;
        existing.ApiKey = user.ApiKey;

        await dbContext.SaveChangesAsync();
    }

    public virtual async Task<ApplicationUser?> GetByIdAsync(int id)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        return await dbContext.Users
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.Id == id);
    }

    public virtual async Task<Role?> GetRoleByNameAsync(string roleName)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        return await dbContext.Roles
            .FirstOrDefaultAsync(r => r.Name == roleName);
    }

    public virtual async Task<Role?> GetRoleByIdAsync(int roleId)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        return await dbContext.Roles
            .FirstOrDefaultAsync(r => r.Id == roleId);
    }

    public virtual async Task<List<ApplicationUser>> GetAllUsersAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        return await dbContext.Users
            .Include(u => u.Role)
            .OrderByDescending(u => u.LastLoginAt)
            .ToListAsync();
    }

    public virtual async Task<List<Role>> GetAllRolesAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        return await dbContext.Roles
            .OrderBy(r => r.Name)
            .ToListAsync();
    }

    public virtual async Task<ApplicationUser?> GetUserByTwitchIdAsync(string twitchId)
    {
        return await GetByTwitchIdAsync(twitchId);
    }

    public virtual async Task<ApplicationUser> CreateUserAsync(string twitchId, string username)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        // Get default "User" role
        var userRole = await dbContext.Roles.FirstOrDefaultAsync(r => r.Name == "User");
        if (userRole == null)
        {
            throw new InvalidOperationException("Default 'User' role not found in database");
        }

        var rawApiKey = GenerateSecureApiKey();

        var user = new ApplicationUser
        {
            TwitchId = twitchId,
            TwitchUsername = username,
            RoleId = userRole.Id,
            CreatedAt = DateTime.UtcNow,
            LastLoginAt = DateTime.UtcNow,
            ApiKey = HashApiKey(rawApiKey)
        };

        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync();

        // Reload with Role navigation property
        return await dbContext.Users
            .Include(u => u.Role)
            .FirstAsync(u => u.Id == user.Id);
    }

    public virtual async Task UpdateLastLoginAsync(int userId)
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
    public virtual async Task<string> GenerateApiKeyAsync(int userId)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        var user = await dbContext.Users.FindAsync(userId);
        if (user == null)
        {
            throw new InvalidOperationException($"User with ID {userId} not found");
        }

        var rawApiKey = GenerateSecureApiKey();
        user.ApiKey = HashApiKey(rawApiKey);
        await dbContext.SaveChangesAsync();

        return rawApiKey;
    }

    /// <summary>
    /// Gets a user by their API key
    /// </summary>
    public virtual async Task<ApplicationUser?> GetByApiKeyAsync(string apiKey)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        var hashedApiKey = HashApiKey(apiKey);

        return await dbContext.Users
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.ApiKey == hashedApiKey);
    }

    /// <summary>
    /// Generates a cryptographically secure 64-character hexadecimal API key
    /// </summary>
    private static string GenerateSecureApiKey()
    {
        var bytes = new byte[32]; // 32 bytes = 64 hex characters
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static string HashApiKey(string apiKey)
    {
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new ArgumentException("API key is required", nameof(apiKey));
        }

        var bytes = Encoding.UTF8.GetBytes(apiKey.Trim());
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
