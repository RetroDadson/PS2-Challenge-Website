using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using PS2Challenge.Backend.BackgroundServices;
using PS2Challenge.Backend.Data;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Services;
using PS2Challenge.Backend.Tests.Helpers;

namespace PS2Challenge.Backend.Tests.BackgroundServices;

public class CoverImageUpdateServiceTests : IDisposable
{
    private readonly Ps2ChallengeDbContext _context;
    private bool _disposed;

    public CoverImageUpdateServiceTests()
    {
        _context = TestDbContextFactory.CreateInMemoryContext();
    }

    public void Dispose()
    {
        Dispose(true);
        GC.SuppressFinalize(this);
    }

    protected virtual void Dispose(bool disposing)
    {
        if (_disposed)
        {
            return;
        }

        if (disposing)
        {
            _context.Database.EnsureDeleted();
            _context.Dispose();
        }

        _disposed = true;
    }

    [Fact]
    public async Task UpdateCoverImagesAsync_UpdatesChangedAndMissingCoverUrls()
    {
        var game1 = new GameDtoBuilder().WithId(1).WithTitle("Game 1").Build();
        game1.ImageUrl = "old-url";
        var game2 = new GameDtoBuilder().WithId(2).WithTitle("Game 2").Build();
        game2.ImageUrl = null;
        var game3 = new GameDtoBuilder().WithId(3).WithTitle("Game 3").Build();
        game3.ImageUrl = "remove-me";

        var fakeGameService = new FakeGameService(_context, [game1, game2, game3]);
        var fakeCoverService = new FakeGameCoverService(_context, new Dictionary<int, string>
        {
            [1] = "new-url",
            [2] = "cover-2"
        });

        var provider = new ServiceCollection()
            .AddSingleton<GameService>(fakeGameService)
            .AddSingleton<GameCoverService>(fakeCoverService)
            .BuildServiceProvider();

        var service = new CoverImageUpdateService(provider, NullLogger<CoverImageUpdateService>.Instance);

        var updateMethod = typeof(CoverImageUpdateService).GetMethod(
            "UpdateCoverImagesAsync",
            BindingFlags.NonPublic | BindingFlags.Instance);

        Assert.NotNull(updateMethod);

        var task = (Task)updateMethod.Invoke(service, [CancellationToken.None])!;
        await task;

        Assert.Equal(3, fakeGameService.Updates.Count);
        Assert.Contains(fakeGameService.Updates, u => u.GameId == 1 && u.ImageUrl == "new-url");
        Assert.Contains(fakeGameService.Updates, u => u.GameId == 2 && u.ImageUrl == "cover-2");
        Assert.Contains(fakeGameService.Updates, u => u.GameId == 3 && u.ImageUrl == null);
    }

    [Fact]
    public async Task UpdateCoverImagesAsync_StopsWhenCancellationRequested()
    {
        var game1 = new GameDtoBuilder().WithId(1).WithTitle("Game 1").Build();
        game1.ImageUrl = "old-url";
        var game2 = new GameDtoBuilder().WithId(2).WithTitle("Game 2").Build();
        game2.ImageUrl = "old-url-2";

        var fakeGameService = new FakeGameService(_context, [game1, game2]);
        var fakeCoverService = new FakeGameCoverService(_context, new Dictionary<int, string>
        {
            [1] = "new-url",
            [2] = "new-url-2"
        });

        var provider = new ServiceCollection()
            .AddSingleton<GameService>(fakeGameService)
            .AddSingleton<GameCoverService>(fakeCoverService)
            .BuildServiceProvider();

        var service = new CoverImageUpdateService(provider, NullLogger<CoverImageUpdateService>.Instance);

        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();

        var updateMethod = typeof(CoverImageUpdateService).GetMethod(
            "UpdateCoverImagesAsync",
            BindingFlags.NonPublic | BindingFlags.Instance);

        Assert.NotNull(updateMethod);

        var task = (Task)updateMethod.Invoke(service, [cts.Token])!;
        await task;

        Assert.Empty(fakeGameService.Updates);
    }

    private sealed class FakeGameService : GameService
    {
        private readonly IEnumerable<GameDto> _games;

        public List<(int GameId, string? ImageUrl)> Updates { get; } = [];

        public FakeGameService(Ps2ChallengeDbContext context, IEnumerable<GameDto> games)
            : base(TestDbContextFactory.CreateServiceScopeFactory(context))
        {
            _games = games;
        }

        public override Task<IEnumerable<GameDto>> GetAllGamesAsync()
        {
            return Task.FromResult(_games);
        }

        public override Task UpdateGameCoverUrlAsync(int gameId, string? imageUrl)
        {
            Updates.Add((gameId, imageUrl));
            return Task.CompletedTask;
        }
    }

    private sealed class FakeGameCoverService : GameCoverService
    {
        private readonly Dictionary<int, string> _coverUrls;

        public FakeGameCoverService(Ps2ChallengeDbContext context, Dictionary<int, string> coverUrls)
            : base(context)
        {
            _coverUrls = coverUrls;
        }

        public override Task<Dictionary<int, string>> GetCoverUrlsAsync(IEnumerable<int> gameIds)
        {
            var result = _coverUrls
                .Where(kvp => gameIds.Contains(kvp.Key))
                .ToDictionary(kvp => kvp.Key, kvp => kvp.Value);

            return Task.FromResult(result);
        }
    }
}
