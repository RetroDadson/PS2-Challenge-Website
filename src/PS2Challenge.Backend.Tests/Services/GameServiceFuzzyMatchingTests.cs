using Microsoft.EntityFrameworkCore;
using PS2Challenge.Backend.Data;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Services;
using PS2Challenge.Backend.Tests.Helpers;

namespace PS2Challenge.Backend.Tests.Services;

public sealed class GameServiceFuzzyMatchingTests : IDisposable
{
    private readonly Ps2ChallengeDbContext _context;
    private readonly GameService _gameService;

    public GameServiceFuzzyMatchingTests()
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
    public async Task AddExcludedGameAsync_FindsGameWithDifferentCase()
    {
        // Arrange
        var game = new GameDtoBuilder().WithId(1).WithTitle("Grand Theft Auto").Build();
        _context.Games.Add(game);
        await _context.SaveChangesAsync();

        // Act - Search with all lowercase
        var result = await _gameService.AddExcludedGameAsync("grand theft auto", "Test reason");

        // Assert
        Assert.Equal(1, result.GameId);
        Assert.Equal("Test reason", result.Reason);
    }

    [Fact]
    public async Task AddExcludedGameAsync_FindsGameWithSpecialCharacterVariations()
    {
        // Arrange
        var game = new GameDtoBuilder().WithId(1).WithTitle("Metal Gear Solid 2: Sons of Liberty").Build();
        _context.Games.Add(game);
        await _context.SaveChangesAsync();

        // Act - Search without colon
        var result = await _gameService.AddExcludedGameAsync("Metal Gear Solid 2 Sons of Liberty", "Test reason");

        // Assert
        Assert.Equal(1, result.GameId);
    }

    [Fact]
    public async Task AddGameOwnedAsync_FindsGameCaseInsensitive()
    {
        // Arrange
        var game = new GameDtoBuilder().WithId(1).WithTitle("Ratchet & Clank").Build();
        _context.Games.Add(game);
        await _context.SaveChangesAsync();

        // Act - All uppercase
        var result = await _gameService.AddGameOwnedAsync("RATCHET & CLANK", true, "PAL");

        // Assert
        Assert.Equal(1, result.GameId);
    }

    [Fact]
    public async Task UpsertProgressAsync_FindsGameWithNormalizedTitle()
    {
        // Arrange
        var game = new GameDtoBuilder().WithId(1).WithTitle(".hack//G.U.").Build();
        _context.Games.Add(game);
        await _context.SaveChangesAsync();

        // Act - Search without special characters
        var result = await _gameService.UpsertProgressAsync(
            "hack G.U.",
            new DateOnly(2024, 1, 1),
            null,
            null,
            null,
            null,
            "Physical");

        // Assert
        Assert.Equal(1, result.GameId);
    }

    [Fact]
    public async Task AddExcludedGameAsync_FindsGameViaAlternateTitle()
    {
        // Arrange
        var game = new GameDtoBuilder().WithId(1).WithTitle("Ratchet & Clank").Build();
        _context.Games.Add(game);

        var alternateTitle = new AlternateTitle
        {
            GameId = 1,
            Title = "Ratchet and Clank",
            Notes = "Alternative spelling"
        };
        _context.AlternateTitles.Add(alternateTitle);
        await _context.SaveChangesAsync();

        // Act - Search using alternate title
        var result = await _gameService.AddExcludedGameAsync("Ratchet and Clank", "Test reason");

        // Assert
        Assert.Equal(1, result.GameId);
        Assert.Equal("Test reason", result.Reason);
    }

    [Fact]
    public async Task AddExcludedGameAsync_FindsGameViaAlternateTitleWithDifferentCase()
    {
        // Arrange
        var game = new GameDtoBuilder().WithId(1).WithTitle("Grand Theft Auto: San Andreas").Build();
        _context.Games.Add(game);

        var alternateTitle = new AlternateTitle
        {
            GameId = 1,
            Title = "GTA: San Andreas",
            Notes = "Common abbreviation"
        };
        _context.AlternateTitles.Add(alternateTitle);
        await _context.SaveChangesAsync();

        // Act - Search using lowercase alternate title
        var result = await _gameService.AddExcludedGameAsync("gta: san andreas", "Test reason");

        // Assert
        Assert.Equal(1, result.GameId);
    }

    [Fact]
    public async Task AddGameAsync_PreventsDuplicatesWithDifferentCase()
    {
        // Arrange
        var existingGame = new GameDtoBuilder().WithId(1).WithTitle("Metal Gear Solid").Build();
        _context.Games.Add(existingGame);
        await _context.SaveChangesAsync();

        var duplicateGame = new GameDtoBuilder()
            .WithId(0)
            .WithTitle("METAL GEAR SOLID") // Same title, different case
            .Build();

        // Act & Assert
        var exception = await Assert.ThrowsAsync<InvalidOperationException>(
            () => _gameService.AddGameAsync(duplicateGame));

        Assert.Contains("already exists", exception.Message);
    }

    [Fact]
    public async Task AddGameAsync_PreventsDuplicatesWithSpecialCharacterVariations()
    {
        // Arrange
        var existingGame = new GameDtoBuilder().WithId(1).WithTitle("Tony Hawk's Pro Skater 3").Build();
        _context.Games.Add(existingGame);
        await _context.SaveChangesAsync();

        var duplicateGame = new GameDtoBuilder()
            .WithId(0)
            .WithTitle("Tony Hawk s Pro Skater 3") // Missing apostrophe
            .Build();

        // Act & Assert
        var exception = await Assert.ThrowsAsync<InvalidOperationException>(
            () => _gameService.AddGameAsync(duplicateGame));

        Assert.Contains("already exists", exception.Message);
    }

    [Fact]
    public async Task AddSerialNumberAsync_FindsGameWithFuzzyMatching()
    {
        // Arrange
        var game = new GameDtoBuilder().WithId(1).WithTitle("The Lord of the Rings: The Two Towers").Build();
        _context.Games.Add(game);
        await _context.SaveChangesAsync();

        // Act - Search without colons
        var result = await _gameService.AddSerialNumberAsync(
            "The Lord of the Rings The Two Towers",
            "SLUS-20517",
            "NTSC-U",
            "North American release");

        // Assert
        Assert.Equal(1, result.GameId);
        Assert.Equal("SLUS-20517", result.SerialNumber);
    }

    [Fact]
    public async Task AddGameOwnedAsync_ThrowsWhenNoMatchFound()
    {
        // Arrange
        var game = new GameDtoBuilder().WithId(1).WithTitle("Metal Gear Solid").Build();
        _context.Games.Add(game);
        await _context.SaveChangesAsync();

        // Act & Assert - Search for completely different game
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _gameService.AddGameOwnedAsync("Grand Theft Auto", true, "PAL"));
    }
}
