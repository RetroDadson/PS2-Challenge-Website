using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PS2Challenge.Backend.Data;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Services;
using PS2Challenge.Backend.Tests.Helpers;

namespace PS2Challenge.Backend.Tests.Services;

public class GameServiceTests : IDisposable
{
    private readonly Ps2ChallengeDbContext _context;
    private readonly GameService _gameService;

    public GameServiceTests()
    {
        _context = TestDbContextFactory.CreateInMemoryContext();
        var scopeFactory = TestDbContextFactory.CreateServiceScopeFactory(_context);
        _gameService = new GameService(scopeFactory);
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task GetAllGamesAsync_ReturnsAllGames()
    {
        // Arrange
        var game1 = new GameDtoBuilder().WithId(1).WithTitle("Test Game 1").Build();
        var game2 = new GameDtoBuilder().WithId(2).WithTitle("Test Game 2").Build();
        _context.Games.AddRange(game1, game2);
        await _context.SaveChangesAsync();

        // Act
        var result = await _gameService.GetAllGamesAsync();

        // Assert
        Assert.Equal(2, result.Count());
    }

    [Fact]
    public async Task GetAllGamesAsync_SortsSpecialCharactersFirst()
    {
        // Arrange
        var game1 = new GameDtoBuilder().WithId(1).WithTitle("Alpha Game").Build();
        var game2 = new GameDtoBuilder().WithId(2).WithTitle(".hack//G.U.").Build();
        var game3 = new GameDtoBuilder().WithId(3).WithTitle("24: The Game").Build();
        _context.Games.AddRange(game1, game2, game3);
        await _context.SaveChangesAsync();

        // Act
        var result = (await _gameService.GetAllGamesAsync()).ToList();

        // Assert
        Assert.Equal(".hack//G.U.", result[0].Title);
        Assert.Equal("24: The Game", result[1].Title);
        Assert.Equal("Alpha Game", result[2].Title);
    }

    [Fact]
    public async Task GetAllGamesAsync_MarksExcludedGames()
    {
        // Arrange
        var game = new GameDtoBuilder().WithId(1).WithTitle("Test Game").Build();
        _context.Games.Add(game);
        _context.ExcludedGames.Add(new ExcludedGame { GameId = 1, Reason = "Test" });
        await _context.SaveChangesAsync();

        // Act
        var result = await _gameService.GetAllGamesAsync();

        // Assert
        Assert.True(result.First().IsExcluded);
    }

    [Fact]
    public async Task GetAllGamesAsync_MarksOwnedGames()
    {
        // Arrange
        var game = new GameDtoBuilder().WithId(1).WithTitle("Test Game").Build();
        _context.Games.Add(game);
        _context.GamesOwned.Add(new GameOwned { GameId = 1, OwnPhysicalCopy = true, TypeOwned = "Physical" });
        await _context.SaveChangesAsync();

        // Act
        var result = await _gameService.GetAllGamesAsync();

        // Assert
        Assert.True(result.First().IsOwned);
    }

    [Fact]
    public async Task AddGameAsync_AddsGameSuccessfully()
    {
        // Arrange
        var newGame = new GameDtoBuilder()
            .WithId(0) // ID should be generated
            .WithTitle("New Game")
            .WithDeveloper("New Developer")
            .WithPublisher("New Publisher")
            .WithRegionFirstReleasedIn("NA")
            .Build();

        // Act
        var result = await _gameService.AddGameAsync(newGame);

        // Assert
        Assert.NotEqual(0, result.Id);
        var savedGame = await _context.Games.FindAsync(result.Id);
        Assert.NotNull(savedGame);
        Assert.Equal("New Game", savedGame.Title);
    }

    [Fact]
    public async Task AddGameAsync_ThrowsWhenDuplicateTitle()
    {
        // Arrange
        var existingGame = new GameDtoBuilder().WithId(1).WithTitle("Duplicate Game").Build();
        _context.Games.Add(existingGame);
        await _context.SaveChangesAsync();

        var newGame = new GameDtoBuilder()
            .WithId(0)
            .WithTitle("Duplicate Game")
            .Build();

        // Act & Assert
        await Assert.ThrowsAsync<InvalidOperationException>(() => _gameService.AddGameAsync(newGame));
    }

    [Fact]
    public async Task AddExcludedGameAsync_ExcludesGameSuccessfully()
    {
        // Arrange
        var game = new GameDtoBuilder().WithId(1).WithTitle("Test Game").Build();
        _context.Games.Add(game);
        await _context.SaveChangesAsync();

        // Act
        var result = await _gameService.AddExcludedGameAsync("Test Game", "Test Reason");

        // Assert
        Assert.Equal(1, result.GameId);
        Assert.Equal("Test Reason", result.Reason);
    }

    [Fact]
    public async Task AddExcludedGameAsync_ThrowsWhenGameNotFound()
    {
        // Act & Assert
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _gameService.AddExcludedGameAsync("Non Existent Game", "Test Reason"));
    }

    [Fact]
    public async Task SearchGamesByTitleAsync_FindsMatchingGames()
    {
        // Arrange
        var game1 = new GameDtoBuilder().WithId(1).WithTitle("Grand Theft Auto").Build();
        var game2 = new GameDtoBuilder().WithId(2).WithTitle("Grand Turismo").Build();
        var game3 = new GameDtoBuilder().WithId(3).WithTitle("Metal Gear Solid").Build();
        _context.Games.AddRange(game1, game2, game3);
        await _context.SaveChangesAsync();

        // Act
        var result = (await _gameService.SearchGamesByTitleAsync("Grand")).ToList();

        // Assert
        Assert.Equal(2, result.Count);
        Assert.Contains(result, g => g.Title == "Grand Theft Auto");
        Assert.Contains(result, g => g.Title == "Grand Turismo");
    }

    [Fact]
    public async Task AddGameOwnedAsync_AddsOwnershipSuccessfully()
    {
        // Arrange
        var game = new GameDtoBuilder().WithId(1).WithTitle("Test Game").Build();
        _context.Games.Add(game);
        await _context.SaveChangesAsync();

        // Act
        var result = await _gameService.AddGameOwnedAsync("Test Game", true, "Physical");

        // Assert
        Assert.Equal(1, result.GameId);
        Assert.True(result.OwnPhysicalCopy);
        Assert.Equal("Physical", result.TypeOwned);
    }

    [Fact]
    public async Task UpsertProgressAsync_CreatesNewProgress()
    {
        // Arrange
        var game = new GameDtoBuilder().WithId(1).WithTitle("Test Game").Build();
        _context.Games.Add(game);
        await _context.SaveChangesAsync();

        var dateStarted = DateOnly.FromDateTime(DateTime.UtcNow);

        // Act
        var result = await _gameService.UpsertProgressAsync(
            "Test Game",
            dateStarted,
            null,
            "05:30:00",
            "Beat the main story",
            "Great game!",
            "Physical");

        // Assert
        Assert.Equal(1, result.GameId);
        Assert.Equal(dateStarted, result.DateStarted);
        Assert.Null(result.DateFinished);
        Assert.NotNull(result.CompletionTime);
        Assert.Equal(5, result.CompletionTime.Value.Hours);
        Assert.Equal(30, result.CompletionTime.Value.Minutes);
    }

    [Fact]
    public async Task UpsertProgressAsync_UpdatesExistingProgress()
    {
        // Arrange
        var game = new GameDtoBuilder().WithId(1).WithTitle("Test Game").Build();
        _context.Games.Add(game);

        var existingProgress = new GameProgressBuilder()
            .WithGameId(1)
            .WithDateStarted(new DateOnly(2024, 1, 1))
            .WithPlatform("Physical")
            .Build();
        _context.GameProgress.Add(existingProgress);
        await _context.SaveChangesAsync();

        var dateFinished = DateOnly.FromDateTime(DateTime.UtcNow);

        // Act
        var result = await _gameService.UpsertProgressAsync(
            "Test Game",
            existingProgress.DateStarted,
            dateFinished,
            "10:45:30",
            "100% completion",
            "Updated review",
            "Physical");

        // Assert
        Assert.Equal(existingProgress.ProgressId, result.ProgressId);
        Assert.Equal(dateFinished, result.DateFinished);
        Assert.Equal("Updated review", result.Review);
    }

    [Fact]
    public async Task GetAllProgressAsync_ReturnsProgressWithGameTitles()
    {
        // Arrange
        var game = new GameDtoBuilder().WithId(1).WithTitle("Test Game").Build();
        _context.Games.Add(game);

        var progress = new GameProgressBuilder()
            .WithGameId(1)
            .WithDateStarted(new DateOnly(2024, 1, 1))
            .WithCompletionTime(new TimeSpan(5, 30, 0))
            .Build();
        _context.GameProgress.Add(progress);
        await _context.SaveChangesAsync();

        // Act
        var result = (await _gameService.GetAllProgressAsync()).ToList();

        // Assert
        Assert.Single(result);
        Assert.Equal("Test Game", result[0].GameTitle);
        Assert.Equal(new TimeSpan(5, 30, 0), result[0].CompletionTime);
    }

    [Fact]
    public async Task GetCompletedGamesAsync_ReturnsOnlyCompletedGames()
    {
        // Arrange
        var game1 = new GameDtoBuilder().WithId(1).WithTitle("Completed Game").Build();
        var game2 = new GameDtoBuilder().WithId(2).WithTitle("In Progress Game").Build();
        _context.Games.AddRange(game1, game2);

        var completedProgress = new GameProgressBuilder()
            .WithProgressId(1)
            .WithGameId(1)
            .WithDateStarted(new DateOnly(2024, 1, 1))
            .WithDateFinished(new DateOnly(2024, 1, 15))
            .Build();

        var inProgressProgress = new GameProgressBuilder()
            .WithProgressId(2)
            .WithGameId(2)
            .WithDateStarted(new DateOnly(2024, 1, 1))
            .WithDateFinished(null)
            .Build();

        _context.GameProgress.AddRange(completedProgress, inProgressProgress);
        await _context.SaveChangesAsync();

        // Act
        var result = (await _gameService.GetCompletedGamesAsync()).ToList();

        // Assert
        Assert.Single(result);
        Assert.Equal("Completed Game", result[0].GameTitle);
    }

    [Fact]
    public async Task GetOwnedTypesAsync_ReturnsOwnedTypesByGameId()
    {
        // Arrange
        _context.GamesOwned.AddRange(
            new GameOwned { GameId = 1, OwnPhysicalCopy = true, TypeOwned = "Physical" },
            new GameOwned { GameId = 2, OwnPhysicalCopy = false, TypeOwned = "Digital" }
        );
        await _context.SaveChangesAsync();

        // Act
        var result = await _gameService.GetOwnedTypesAsync();

        // Assert
        Assert.Equal(2, result.Count);
        Assert.Equal("Physical", result[1]);
        Assert.Equal("Digital", result[2]);
    }

    [Fact]
    public async Task GetCompletionStatusAsync_ReturnsEmptyDictionary_WhenNoProgress()
    {
        // Arrange - no progress records

        // Act
        var result = await _gameService.GetCompletionStatusAsync();

        // Assert
        Assert.Empty(result);
    }

    [Fact]
    public async Task GetCompletionStatusAsync_ReturnsCompleted_WhenGameIsFinished()
    {
        // Arrange
        var game = new GameDtoBuilder().WithId(1).WithTitle("Completed Game").Build();
        _context.Games.Add(game);

        var completedProgress = new GameProgressBuilder()
            .WithGameId(1)
            .WithDateStarted(new DateOnly(2024, 1, 1))
            .WithDateFinished(new DateOnly(2024, 1, 15))
            .Build();
        _context.GameProgress.Add(completedProgress);
        await _context.SaveChangesAsync();

        // Act
        var result = await _gameService.GetCompletionStatusAsync();

        // Assert
        Assert.Single(result);
        Assert.Equal("Completed", result[1]);
    }

    [Fact]
    public async Task GetCompletionStatusAsync_ReturnsInProgress_WhenGameIsNotFinished()
    {
        // Arrange
        var game = new GameDtoBuilder().WithId(1).WithTitle("In Progress Game").Build();
        _context.Games.Add(game);

        var inProgressProgress = new GameProgressBuilder()
            .WithGameId(1)
            .WithDateStarted(new DateOnly(2024, 1, 1))
            .WithDateFinished(null)
            .Build();
        _context.GameProgress.Add(inProgressProgress);
        await _context.SaveChangesAsync();

        // Act
        var result = await _gameService.GetCompletionStatusAsync();

        // Assert
        Assert.Single(result);
        Assert.Equal("In Progress", result[1]);
    }

    [Fact]
    public async Task GetCompletionStatusAsync_ReturnsCorrectStatusForMultipleGames()
    {
        // Arrange
        var game1 = new GameDtoBuilder().WithId(1).WithTitle("Completed Game").Build();
        var game2 = new GameDtoBuilder().WithId(2).WithTitle("In Progress Game").Build();
        var game3 = new GameDtoBuilder().WithId(3).WithTitle("Not Started Game").Build();
        _context.Games.AddRange(game1, game2, game3);

        var completedProgress = new GameProgressBuilder()
            .WithProgressId(1)
            .WithGameId(1)
            .WithDateStarted(new DateOnly(2024, 1, 1))
            .WithDateFinished(new DateOnly(2024, 1, 15))
            .Build();

        var inProgressProgress = new GameProgressBuilder()
            .WithProgressId(2)
            .WithGameId(2)
            .WithDateStarted(new DateOnly(2024, 2, 1))
            .WithDateFinished(null)
            .Build();

        _context.GameProgress.AddRange(completedProgress, inProgressProgress);
        await _context.SaveChangesAsync();

        // Act
        var result = await _gameService.GetCompletionStatusAsync();

        // Assert
        Assert.Equal(2, result.Count); // Only games 1 and 2 have progress
        Assert.Equal("Completed", result[1]);
        Assert.Equal("In Progress", result[2]);
        Assert.False(result.ContainsKey(3)); // Game 3 has no progress, so it's not in the dictionary
    }

    [Fact]
    public async Task AddSerialNumberAsync_AddsSerialNumberSuccessfully()
    {
        // Arrange
        var game = new GameDtoBuilder().WithId(1).WithTitle("Test Game").Build();
        _context.Games.Add(game);
        await _context.SaveChangesAsync();

        // Act
        var result = await _gameService.AddSerialNumberAsync("Test Game", "SLUS-20062", "NTSC-U", "North American release");

        // Assert
        Assert.Equal(1, result.GameId);
        Assert.Equal("SLUS-20062", result.SerialNumber);
        Assert.Equal("NTSC-U", result.Region);
        Assert.Equal("North American release", result.Notes);
    }

    [Fact]
    public async Task AddSerialNumberAsync_ThrowsWhenGameNotFound()
    {
        // Act & Assert
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _gameService.AddSerialNumberAsync("Non Existent Game", "SLUS-20062", "NTSC-U", null));
    }

    [Fact]
    public async Task AddSerialNumberAsync_ThrowsWhenSerialNumberAlreadyExists()
    {
        // Arrange
        var game1 = new GameDtoBuilder().WithId(1).WithTitle("Game 1").Build();
        var game2 = new GameDtoBuilder().WithId(2).WithTitle("Game 2").Build();
        _context.Games.AddRange(game1, game2);
        await _context.SaveChangesAsync();

        // Add serial number to game 1
        await _gameService.AddSerialNumberAsync("Game 1", "SLUS-20062", "NTSC-U", null);

        // Act & Assert - Try to add same serial to game 2
        var exception = await Assert.ThrowsAsync<InvalidOperationException>(
            () => _gameService.AddSerialNumberAsync("Game 2", "SLUS-20062", "PAL", null));

        Assert.Contains("SLUS-20062", exception.Message);
        Assert.Contains("already exists", exception.Message);
        Assert.Contains("Game 1", exception.Message);
    }

    [Fact]
    public async Task AddSerialNumberAsync_AllowsMultipleSerialNumbersForSameGame()
    {
        // Arrange
        var game = new GameDtoBuilder().WithId(1).WithTitle("Test Game").Build();
        _context.Games.Add(game);
        await _context.SaveChangesAsync();

        // Act - Add multiple serial numbers for the same game
        var serial1 = await _gameService.AddSerialNumberAsync("Test Game", "SLUS-20062", "NTSC-U", null);
        var serial2 = await _gameService.AddSerialNumberAsync("Test Game", "SCES-50326", "PAL", null);
        var serial3 = await _gameService.AddSerialNumberAsync("Test Game", "SLPS-25006", "NTSC-J", null);

        // Assert
        Assert.Equal(1, serial1.GameId);
        Assert.Equal(1, serial2.GameId);
        Assert.Equal(1, serial3.GameId);
        Assert.NotEqual(serial1.SerialNumber, serial2.SerialNumber);
        Assert.NotEqual(serial1.SerialNumber, serial3.SerialNumber);
        Assert.NotEqual(serial2.SerialNumber, serial3.SerialNumber);

        var allSerials = await _context.GameSerialNumbers.Where(s => s.GameId == 1).ToListAsync();
        Assert.Equal(3, allSerials.Count);
    }

    [Fact]
    public async Task UpdateGameAsync_ThrowsWhenGameNotFound()
    {
        var updateDto = new GameDtoBuilder().WithTitle("Updated").Build();

        await Assert.ThrowsAsync<InvalidOperationException>(() => _gameService.UpdateGameAsync(999, updateDto));
    }

    [Fact]
    public async Task UpdateGameAsync_ThrowsWhenTitleConflictsWithAnotherGame()
    {
        _context.Games.AddRange(
            new GameDtoBuilder().WithId(1).WithTitle("Original").Build(),
            new GameDtoBuilder().WithId(2).WithTitle("Conflicting").Build()
        );
        await _context.SaveChangesAsync();

        var updateDto = new GameDtoBuilder().WithTitle("Conflicting").Build();

        await Assert.ThrowsAsync<InvalidOperationException>(() => _gameService.UpdateGameAsync(1, updateDto));
    }

    [Fact]
    public async Task UpdateGameCoverUrlAsync_UpdatesCoverUrl()
    {
        var game = new GameDtoBuilder().WithId(1).WithTitle("Cover Game").Build();
        game.ImageUrl = null;
        _context.Games.Add(game);
        await _context.SaveChangesAsync();

        await _gameService.UpdateGameCoverUrlAsync(1, "new-cover.jpg");

        var updated = await _context.Games.FindAsync(1);
        Assert.NotNull(updated);
        Assert.Equal("new-cover.jpg", updated.ImageUrl);
    }

    [Fact]
    public async Task UpdateGameCoverUrlAsync_ThrowsWhenGameNotFound()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(() => _gameService.UpdateGameCoverUrlAsync(999, "x.jpg"));
    }

    [Fact]
    public async Task DeleteGameAsync_ReturnsTrueWhenDeleted()
    {
        _context.Games.Add(new GameDtoBuilder().WithId(1).WithTitle("Delete Me").Build());
        await _context.SaveChangesAsync();

        var deleted = await _gameService.DeleteGameAsync(1);

        Assert.True(deleted);
        Assert.Null(await _context.Games.FindAsync(1));
    }

    [Fact]
    public async Task UpdateExclusionAsync_AddsAndThenRemovesExclusion()
    {
        _context.Games.Add(new GameDtoBuilder().WithId(1).WithTitle("Exclude Me").Build());
        await _context.SaveChangesAsync();

        await _gameService.UpdateExclusionAsync(1, true, "Testing");
        Assert.NotNull(await _context.ExcludedGames.FirstOrDefaultAsync(e => e.GameId == 1));

        await _gameService.UpdateExclusionAsync(1, false);
        Assert.Null(await _context.ExcludedGames.FirstOrDefaultAsync(e => e.GameId == 1));
    }

    [Fact]
    public async Task UpdateExclusionAsync_UpdatesExistingReason()
    {
        _context.Games.Add(new GameDtoBuilder().WithId(1).WithTitle("Existing Exclusion").Build());
        _context.ExcludedGames.Add(new ExcludedGame { GameId = 1, Reason = "Old" });
        await _context.SaveChangesAsync();

        await _gameService.UpdateExclusionAsync(1, true, "New Reason");

        var exclusion = await _context.ExcludedGames.FirstAsync(e => e.GameId == 1);
        Assert.Equal("New Reason", exclusion.Reason);
    }

    [Fact]
    public async Task UpdateOwnershipAsync_AddsUpdatesAndRemovesOwnership()
    {
        _context.Games.Add(new GameDtoBuilder().WithId(1).WithTitle("Own Me").Build());
        await _context.SaveChangesAsync();

        await _gameService.UpdateOwnershipAsync(1, true, "PAL");
        var ownership = await _context.GamesOwned.FirstOrDefaultAsync(o => o.GameId == 1);
        Assert.NotNull(ownership);
        Assert.Equal("PAL", ownership!.TypeOwned);

        await _gameService.UpdateOwnershipAsync(1, true, "NTSC-U");
        ownership = await _context.GamesOwned.FirstOrDefaultAsync(o => o.GameId == 1);
        Assert.NotNull(ownership);
        Assert.Equal("NTSC-U", ownership!.TypeOwned);

        await _gameService.UpdateOwnershipAsync(1, false, string.Empty);
        Assert.Null(await _context.GamesOwned.FirstOrDefaultAsync(o => o.GameId == 1));
    }

    [Fact]
    public async Task GetAllOwnershipTypesAsync_ReturnsOrderedTypes()
    {
        _context.OwnershipTypes.AddRange(
            new OwnershipType { TypeOwned = "Physical" },
            new OwnershipType { TypeOwned = "Digital" }
        );
        await _context.SaveChangesAsync();

        var result = await _gameService.GetAllOwnershipTypesAsync();

        Assert.Equal(2, result.Count);
        Assert.Equal("Digital", result[0].TypeOwned);
        Assert.Equal("Physical", result[1].TypeOwned);
    }

    [Fact]
    public async Task AlternateTitleMethods_AddListDelete_WorkAsExpected()
    {
        _context.Games.Add(new GameDtoBuilder().WithId(1).WithTitle("Main Title").Build());
        await _context.SaveChangesAsync();

        var alt = await _gameService.AddAlternateTitleAsync(1, "Alt Title", "note");
        var listForGame = await _gameService.GetAlternateTitlesForGameAsync(1);
        var grouped = await _gameService.GetAlternateTitlesAsync();

        Assert.Single(listForGame);
        Assert.Equal("Alt Title", listForGame[0].Title);
        Assert.True(grouped.ContainsKey(1));
        Assert.Single(grouped[1]);

        var deleted = await _gameService.DeleteAlternateTitleAsync(1, alt.AlternateTitleId);
        Assert.True(deleted);
        Assert.Empty(await _gameService.GetAlternateTitlesForGameAsync(1));
    }

    [Fact]
    public async Task AddAlternateTitleAsync_ThrowsForDuplicateOrMissingGame()
    {
        _context.Games.Add(new GameDtoBuilder().WithId(1).WithTitle("Main Title").Build());
        _context.AlternateTitles.Add(new AlternateTitle { GameId = 1, Title = "ALT" });
        await _context.SaveChangesAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(() => _gameService.AddAlternateTitleAsync(1, "alt", null));
        await Assert.ThrowsAsync<InvalidOperationException>(() => _gameService.AddAlternateTitleAsync(999, "new", null));
    }

    [Fact]
    public async Task DeleteAlternateTitleAsync_ReturnsFalseWhenNotFound()
    {
        _context.Games.Add(new GameDtoBuilder().WithId(1).WithTitle("Main Title").Build());
        await _context.SaveChangesAsync();

        var deleted = await _gameService.DeleteAlternateTitleAsync(1, 999);

        Assert.False(deleted);
    }

    [Fact]
    public async Task GetExclusionReasonsAsync_ReturnsStoredReason()
    {
        _context.ExcludedGames.Add(new ExcludedGame { GameId = 1, Reason = "Testing reason" });
        await _context.SaveChangesAsync();

        var result = await _gameService.GetExclusionReasonsAsync();

        Assert.Equal("Testing reason", result[1]);
    }

    [Fact]
    public async Task GetGamesPageDataAsync_ReturnsCombinedSortedData()
    {
        var databaseName = Guid.NewGuid().ToString();
        var services = new ServiceCollection();
        services.AddDbContext<Ps2ChallengeDbContext>(options => options.UseInMemoryDatabase(databaseName));
        var provider = services.BuildServiceProvider();

        using (var seedScope = provider.CreateScope())
        {
            var db = seedScope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

            db.Games.AddRange(
                new GameDtoBuilder().WithId(1).WithTitle("Alpha").Build(),
                new GameDtoBuilder().WithId(2).WithTitle(".hack//G.U.").Build(),
                new GameDtoBuilder().WithId(3).WithTitle("Beta").Build());

            db.ExcludedGames.Add(new ExcludedGame { GameId = 3, Reason = "Filtered" });
            db.GamesOwned.Add(new GameOwned { GameId = 1, OwnPhysicalCopy = true, TypeOwned = "Physical" });

            db.GameProgress.AddRange(
                new GameProgressBuilder().WithProgressId(1).WithGameId(1).WithDateStarted(new DateOnly(2024, 1, 1)).WithDateFinished(new DateOnly(2024, 1, 2)).Build(),
                new GameProgressBuilder().WithProgressId(2).WithGameId(2).WithDateStarted(new DateOnly(2024, 2, 1)).WithDateFinished(null).Build());

            db.AlternateTitles.Add(new AlternateTitle { GameId = 2, Title = "hack GU", Notes = "Alt" });

            await db.SaveChangesAsync();
        }

        var gameService = new GameService(provider.GetRequiredService<IServiceScopeFactory>());

        var result = await gameService.GetGamesPageDataAsync();

        Assert.Equal(3, result.Games.Count);
        Assert.Equal(".hack//G.U.", result.Games[0].Title);
        Assert.Equal("Alpha", result.Games[1].Title);
        Assert.Equal("Beta", result.Games[2].Title);

        Assert.Equal("Physical", result.OwnedTypes[1]);
        Assert.Equal("Filtered", result.ExclusionReasons[3]);
        Assert.Equal("Completed", result.CompletionStatus[1]);
        Assert.Equal("In Progress", result.CompletionStatus[2]);
        Assert.Single(result.AlternateTitles[2]);
    }
}
