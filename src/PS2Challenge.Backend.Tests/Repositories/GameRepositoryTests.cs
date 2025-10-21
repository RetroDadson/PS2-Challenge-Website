using Microsoft.EntityFrameworkCore;
using PS2Challenge.Backend.Data;
using PS2Challenge.Backend.Data.Repositories;
using PS2Challenge.Backend.Models;

namespace PS2Challenge.Backend.Tests.Repositories;

public class GameRepositoryTests
{
    private Ps2ChallengeDbContext GetInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<Ps2ChallengeDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        return new Ps2ChallengeDbContext(options);
    }

    [Fact]
    public async Task GetByIdAsync_ReturnsGame_WhenGameExists()
    {
        // Arrange
        await using var context = GetInMemoryDbContext();
        var repository = new GameRepository(context);

        var game = new GameDto
        {
            Title = "Test Game",
            Developer = "Test Dev",
            Publisher = "Test Pub",
            RegionFirstReleasedIn = "NA"
        };

        context.Games.Add(game);
        await context.SaveChangesAsync();

        // Act
        var result = await repository.GetByIdAsync(game.Id);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("Test Game", result.Title);
    }

    [Fact]
    public async Task GetByIdAsync_ReturnsNull_WhenGameDoesNotExist()
    {
        // Arrange
        await using var context = GetInMemoryDbContext();
        var repository = new GameRepository(context);

        // Act
        var result = await repository.GetByIdAsync(999);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public async Task CreateAsync_AddsGameToDatabase()
    {
        // Arrange
        await using var context = GetInMemoryDbContext();
        var repository = new GameRepository(context);

        var game = new GameDto
        {
            Title = "New Game",
            Developer = "New Dev",
            Publisher = "New Pub",
            RegionFirstReleasedIn = "EU"
        };

        // Act
        var result = await repository.CreateAsync(game);

        // Assert
        Assert.NotEqual(0, result.Id);
        var savedGame = await context.Games.FindAsync(result.Id);
        Assert.NotNull(savedGame);
        Assert.Equal("New Game", savedGame.Title);
    }

    [Fact]
    public async Task UpdateAsync_UpdatesExistingGame()
    {
        // Arrange
        await using var context = GetInMemoryDbContext();
        var repository = new GameRepository(context);

        var game = new GameDto
        {
            Title = "Original Title",
            Developer = "Original Dev",
            Publisher = "Original Pub",
            RegionFirstReleasedIn = "NA"
        };

        context.Games.Add(game);
        await context.SaveChangesAsync();

        // Act
        game.Title = "Updated Title";
        await repository.UpdateAsync(game);

        // Assert
        var updatedGame = await context.Games.FindAsync(game.Id);
        Assert.NotNull(updatedGame);
        Assert.Equal("Updated Title", updatedGame.Title);
    }

    [Fact]
    public async Task DeleteAsync_RemovesGame_WhenGameExists()
    {
        // Arrange
        await using var context = GetInMemoryDbContext();
        var repository = new GameRepository(context);

        var game = new GameDto
        {
            Title = "Game to Delete",
            Developer = "Dev",
            Publisher = "Pub",
            RegionFirstReleasedIn = "NA"
        };

        context.Games.Add(game);
        await context.SaveChangesAsync();

        // Act
        var result = await repository.DeleteAsync(game.Id);

        // Assert
        Assert.True(result);
        var deletedGame = await context.Games.FindAsync(game.Id);
        Assert.Null(deletedGame);
    }

    [Fact]
    public async Task DeleteAsync_ReturnsFalse_WhenGameDoesNotExist()
    {
        // Arrange
        await using var context = GetInMemoryDbContext();
        var repository = new GameRepository(context);

        // Act
        var result = await repository.DeleteAsync(999);

        // Assert
        Assert.False(result);
    }

    [Fact]
    public async Task AddExclusionAsync_AddsExclusion()
    {
        // Arrange
        await using var context = GetInMemoryDbContext();
        var repository = new GameRepository(context);

        var game = new GameDto
        {
            Title = "Game to Exclude",
            Developer = "Dev",
            Publisher = "Pub",
            RegionFirstReleasedIn = "NA"
        };

        context.Games.Add(game);
        await context.SaveChangesAsync();

        // Act
        var exclusion = await repository.AddExclusionAsync(game.Id, "Test reason");

        // Assert
        Assert.NotEqual(0, exclusion.ExclusionId);
        Assert.Equal(game.Id, exclusion.GameId);
        Assert.Equal("Test reason", exclusion.Reason);
    }

    [Fact]
    public async Task RemoveExclusionAsync_RemovesExclusion_WhenExists()
    {
        // Arrange
        await using var context = GetInMemoryDbContext();
        var repository = new GameRepository(context);

        var game = new GameDto
        {
            Title = "Excluded Game",
            Developer = "Dev",
            Publisher = "Pub",
            RegionFirstReleasedIn = "NA"
        };

        context.Games.Add(game);
        var exclusion = new ExcludedGame { GameId = game.Id, Reason = "Test" };
        context.ExcludedGames.Add(exclusion);
        await context.SaveChangesAsync();

        // Act
        var result = await repository.RemoveExclusionAsync(game.Id);

        // Assert
        Assert.True(result);
        var removed = await context.ExcludedGames.FirstOrDefaultAsync(e => e.GameId == game.Id);
        Assert.Null(removed);
    }

    [Fact]
    public async Task AddOwnershipAsync_AddsOwnership()
    {
        // Arrange
        await using var context = GetInMemoryDbContext();
        var repository = new GameRepository(context);

        var game = new GameDto
        {
            Title = "Owned Game",
            Developer = "Dev",
            Publisher = "Pub",
            RegionFirstReleasedIn = "NA"
        };

        context.Games.Add(game);
        await context.SaveChangesAsync();

        // Act
        var ownership = await repository.AddOwnershipAsync(game.Id, true, "PAL");

        // Assert
        Assert.NotEqual(0, ownership.OwnershipId);
        Assert.Equal(game.Id, ownership.GameId);
        Assert.True(ownership.OwnPhysicalCopy);
        Assert.Equal("PAL", ownership.TypeOwned);
    }

    [Fact]
    public async Task UpdateOwnershipAsync_UpdatesExistingOwnership()
    {
        // Arrange
        await using var context = GetInMemoryDbContext();
        var repository = new GameRepository(context);

        var game = new GameDto
        {
            Title = "Owned Game",
            Developer = "Dev",
            Publisher = "Pub",
            RegionFirstReleasedIn = "NA"
        };

        context.Games.Add(game);
        var ownership = new GameOwned { GameId = game.Id, OwnPhysicalCopy = false, TypeOwned = "Digital" };
        context.GamesOwned.Add(ownership);
        await context.SaveChangesAsync();

        // Act
        var updated = await repository.UpdateOwnershipAsync(game.Id, true, "PAL");

        // Assert
        Assert.NotNull(updated);
        Assert.True(updated.OwnPhysicalCopy);
        Assert.Equal("PAL", updated.TypeOwned);
    }

    [Fact]
    public async Task ExistsByTitleAsync_ReturnsTrue_WhenGameExists()
    {
        // Arrange
        await using var context = GetInMemoryDbContext();
        var repository = new GameRepository(context);

        var game = new GameDto
        {
            Title = "Existing Game",
            Developer = "Dev",
            Publisher = "Pub",
            RegionFirstReleasedIn = "NA"
        };

        context.Games.Add(game);
        await context.SaveChangesAsync();

        // Act
        var exists = await repository.ExistsByTitleAsync("Existing Game");

        // Assert
        Assert.True(exists);
    }

    [Fact]
    public async Task ExistsByTitleAsync_ReturnsFalse_WhenGameDoesNotExist()
    {
        // Arrange
        await using var context = GetInMemoryDbContext();
        var repository = new GameRepository(context);

        // Act
        var exists = await repository.ExistsByTitleAsync("Nonexistent Game");

        // Assert
        Assert.False(exists);
    }

    [Fact]
    public async Task ExistsByTitleAsync_ExcludesSpecifiedId()
    {
        // Arrange
        await using var context = GetInMemoryDbContext();
        var repository = new GameRepository(context);

        var game = new GameDto
        {
            Title = "Test Game",
            Developer = "Dev",
            Publisher = "Pub",
            RegionFirstReleasedIn = "NA"
        };

        context.Games.Add(game);
        await context.SaveChangesAsync();

        // Act - Check if title exists, but exclude this game's ID
        var exists = await repository.ExistsByTitleAsync("Test Game", game.Id);

        // Assert - Should return false because we're excluding this game
        Assert.False(exists);
    }
}
