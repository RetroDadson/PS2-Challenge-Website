using Microsoft.EntityFrameworkCore;
using PS2Challenge.Backend.Data;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Tests.Helpers;

namespace PS2Challenge.Backend.Tests.Data;

public class Ps2ChallengeDbContextTests : IDisposable
{
    private readonly Ps2ChallengeDbContext _context;

    public Ps2ChallengeDbContextTests()
    {
        _context = TestDbContextFactory.CreateInMemoryContext();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
        GC.SuppressFinalize(this);
    }

    [Fact]
    public async Task DbContext_CanSaveAndRetrieveGames()
    {
        // Arrange
        var game = new GameDtoBuilder()
            .WithTitle("Test Game")
            .WithDeveloper("Test Dev")
            .Build();

        // Act
        _context.Games.Add(game);
        await _context.SaveChangesAsync();

        // Assert
        var savedGame = await _context.Games.FirstOrDefaultAsync(g => g.Title == "Test Game");
        Assert.NotNull(savedGame);
        Assert.Equal("Test Dev", savedGame.Developer);
    }

    [Fact]
    public async Task DbContext_CanHandleRelationships()
    {
        // Arrange
        var role = new Role { Id = 1, Name = "Admin" };
        _context.Roles.Add(role);

        var user = new ApplicationUserBuilder()
            .WithRoleId(role.Id)
            .Build();
        _context.Users.Add(user);

        await _context.SaveChangesAsync();

        // Act
        var savedUser = await _context.Users
            .Include(u => u.Role)
            .FirstOrDefaultAsync();

        // Assert
        Assert.NotNull(savedUser);
        Assert.NotNull(savedUser.Role);
        Assert.Equal("Admin", savedUser.Role.Name);
    }

    [Fact]
    public async Task DbContext_CanQueryWithFilters()
    {
        // Arrange
        var game1 = new GameDtoBuilder().WithId(1).WithTitle("Action Game").Build();
        var game2 = new GameDtoBuilder().WithId(2).WithTitle("Adventure Game").Build();
        var game3 = new GameDtoBuilder().WithId(3).WithTitle("RPG Game").Build();

        _context.Games.AddRange(game1, game2, game3);
        await _context.SaveChangesAsync();

        // Act
        var gamesWithA = await _context.Games
            .Where(g => g.Title.Contains("Adventure"))
            .ToListAsync();

        // Assert
        Assert.Single(gamesWithA);
        Assert.Equal("Adventure Game", gamesWithA[0].Title);
    }

    [Fact]
    public async Task DbContext_CanUpdateEntities()
    {
        // Arrange
        var game = new GameDtoBuilder().WithTitle("Original Title").Build();
        _context.Games.Add(game);
        await _context.SaveChangesAsync();

        // Act
        game.Title = "Updated Title";
        await _context.SaveChangesAsync();

        // Assert
        var updatedGame = await _context.Games.FindAsync(game.Id);
        Assert.Equal("Updated Title", updatedGame!.Title);
    }

    [Fact]
    public async Task DbContext_CanDeleteEntities()
    {
        // Arrange
        var game = new GameDtoBuilder().Build();
        _context.Games.Add(game);
        await _context.SaveChangesAsync();

        // Act
        _context.Games.Remove(game);
        await _context.SaveChangesAsync();

        // Assert
        var deletedGame = await _context.Games.FindAsync(game.Id);
        Assert.Null(deletedGame);
    }

    [Fact]
    public async Task DbContext_SupportsTransactions()
    {
        // Skip this test for InMemory database as it doesn't support transactions
        if (_context.Database.ProviderName == "Microsoft.EntityFrameworkCore.InMemory")
        {
            return; // Skip test
        }

        // Arrange & Act
        using (var transaction = await _context.Database.BeginTransactionAsync())
        {
            var game = new GameDtoBuilder().WithTitle("Transactional Game").Build();
            _context.Games.Add(game);
            await _context.SaveChangesAsync();

            // Rollback instead of commit
            await transaction.RollbackAsync();
        }

        // Assert
        var games = await _context.Games.ToListAsync();
        Assert.Empty(games);
    }

    [Fact]
    public async Task DbContext_CanHandleComplexQueries()
    {
        // Arrange
        var game1 = new GameDtoBuilder().WithId(1).WithTitle("Game 1").Build();
        var game2 = new GameDtoBuilder().WithId(2).WithTitle("Game 2").Build();

        _context.Games.AddRange(game1, game2);

        _context.GameProgress.AddRange(
            new GameProgressBuilder().WithProgressId(1).WithGameId(1).WithDateFinished(DateOnly.FromDateTime(DateTime.UtcNow)).Build(),
            new GameProgressBuilder().WithProgressId(2).WithGameId(2).WithDateFinished(null).Build()
        );

        await _context.SaveChangesAsync();

        // Act
        var completedGames = await _context.GameProgress
            .Where(p => p.DateFinished != null)
            .Join(_context.Games,
                progress => progress.GameId,
                game => game.Id,
                (progress, game) => new { game.Title, progress.DateFinished })
            .ToListAsync();

        // Assert
        Assert.Single(completedGames);
        Assert.Equal("Game 1", completedGames[0].Title);
    }
}
