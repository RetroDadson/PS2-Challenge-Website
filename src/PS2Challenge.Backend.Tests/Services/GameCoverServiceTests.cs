using PS2Challenge.Backend.Data;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Services;
using PS2Challenge.Backend.Tests.Helpers;

namespace PS2Challenge.Backend.Tests.Services;

public class GameCoverServiceTests : IDisposable
{
    private readonly Ps2ChallengeDbContext _context;
    private readonly GameCoverService _service;

    public GameCoverServiceTests()
    {
        _context = TestDbContextFactory.CreateInMemoryContext();
        _service = new GameCoverService(_context);
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task GetCoverUrlAsync_ReturnsNull_WhenNoSerialNumberExists()
    {
        _context.Games.Add(new GameDtoBuilder().WithId(1).WithTitle("No Serial Game").Build());
        await _context.SaveChangesAsync();

        var result = await _service.GetCoverUrlAsync(1);

        Assert.Null(result);
    }

    [Fact]
    public async Task GetCoverUrlAsync_ReturnsFormattedUrl_WithNormalizedSerial()
    {
        _context.Games.Add(new GameDtoBuilder().WithId(1).WithTitle("Test Game").Build());
        _context.GameSerialNumbers.Add(new GameSerialNumber
        {
            GameId = 1,
            SerialNumber = " slus-20062 ",
            Region = "NTSC-U"
        });
        await _context.SaveChangesAsync();

        var result = await _service.GetCoverUrlAsync(1);

        Assert.Equal("https://raw.githubusercontent.com/xlenore/ps2-covers/main/covers/default/SLUS-20062.jpg", result);
    }

    [Fact]
    public async Task GetCoverUrlAsync_PrefersNtscU_ThenPal_ThenNtscJ()
    {
        _context.Games.Add(new GameDtoBuilder().WithId(1).WithTitle("Priority Game").Build());
        _context.GameSerialNumbers.AddRange(
            new GameSerialNumber { GameId = 1, SerialNumber = "SLPS-12345", Region = "NTSC-J" },
            new GameSerialNumber { GameId = 1, SerialNumber = "SCES-54321", Region = "PAL" },
            new GameSerialNumber { GameId = 1, SerialNumber = "SLUS-99999", Region = "NTSC-U" }
        );
        await _context.SaveChangesAsync();

        var result = await _service.GetCoverUrlAsync(1);

        Assert.EndsWith("/SLUS-99999.jpg", result);
    }

    [Fact]
    public async Task GetCoverUrlsAsync_ReturnsUrlsOnlyForGamesWithSerials()
    {
        _context.Games.AddRange(
            new GameDtoBuilder().WithId(1).WithTitle("Game One").Build(),
            new GameDtoBuilder().WithId(2).WithTitle("Game Two").Build(),
            new GameDtoBuilder().WithId(3).WithTitle("Game Three").Build()
        );

        _context.GameSerialNumbers.AddRange(
            new GameSerialNumber { GameId = 1, SerialNumber = "SLUS-11111", Region = "NTSC-U" },
            new GameSerialNumber { GameId = 2, SerialNumber = "SCES-22222", Region = "PAL" }
        );

        await _context.SaveChangesAsync();

        var result = await _service.GetCoverUrlsAsync(new[] { 1, 2, 3 });

        Assert.Equal(2, result.Count);
        Assert.Equal("https://raw.githubusercontent.com/xlenore/ps2-covers/main/covers/default/SLUS-11111.jpg", result[1]);
        Assert.Equal("https://raw.githubusercontent.com/xlenore/ps2-covers/main/covers/default/SCES-22222.jpg", result[2]);
        Assert.False(result.ContainsKey(3));
    }
}
