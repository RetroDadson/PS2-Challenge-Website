using Bunit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using PS2Challenge.Backend.Data;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Services;
using PS2Challenge.Main.Api.Hubs;
using PS2Challenge.Main.Frontend.Components;

namespace PS2Challenge.Main.Tests.Frontend;

public class CoverImageUpdaterTests : BunitContext
{
    private readonly Mock<GameService> _mockGameService;
    private readonly Mock<GameCoverService> _mockCoverService;

    public CoverImageUpdaterTests()
    {
        _mockGameService = new Mock<GameService>(Mock.Of<IServiceScopeFactory>());
        var options = new DbContextOptionsBuilder<Ps2ChallengeDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _mockCoverService = new Mock<GameCoverService>(new Ps2ChallengeDbContext(options));
        JSInterop.Mode = JSRuntimeMode.Loose;

        Services.AddSingleton(_mockGameService.Object);
        Services.AddSingleton(_mockCoverService.Object);
        Services.AddMockHubContext<GamesHub>();
    }

    [Fact]
    public async Task CoverImageUpdater_WhenRun_UpdatesChangedAndMissingUrls()
    {
        var games = new List<GameDto>
        {
            new() { Id = 1, Title = "A", ImageUrl = "same-url" },
            new() { Id = 2, Title = "B", ImageUrl = "old-url" },
            new() { Id = 3, Title = "C", ImageUrl = "stale-url" }
        };

        _mockGameService.Setup(s => s.GetAllGamesAsync()).ReturnsAsync(games);
        _mockCoverService.Setup(s => s.GetCoverUrlsAsync(It.IsAny<IEnumerable<int>>()))
            .ReturnsAsync(new Dictionary<int, string>
            {
                [1] = "same-url",
                [2] = "new-url"
            });

        _mockGameService.Setup(s => s.UpdateGameCoverUrlAsync(It.IsAny<int>(), It.IsAny<string?>()))
            .Returns(Task.CompletedTask);

        var cut = Render<CoverImageUpdater>();

        cut.Find("button.cta-button").Click();

        await cut.WaitForAssertionAsync(() =>
        {
            Assert.Contains("Update completed successfully", cut.Markup);
            Assert.Contains("Updated: 2", cut.Markup);
            Assert.Contains("Skipped (unchanged): 1", cut.Markup);
        });

        _mockGameService.Verify(s => s.UpdateGameCoverUrlAsync(2, "new-url"), Times.Once);
        _mockGameService.Verify(s => s.UpdateGameCoverUrlAsync(3, null), Times.Once);
    }

    [Fact]
    public async Task CoverImageUpdater_WhenServiceThrows_ShowsErrorMessage()
    {
        _mockGameService.Setup(s => s.GetAllGamesAsync())
            .ThrowsAsync(new InvalidOperationException("cover-refresh-failed"));

        var cut = Render<CoverImageUpdater>();
        cut.Find("button.cta-button").Click();

        await cut.WaitForAssertionAsync(() =>
            Assert.Contains("Error updating covers", cut.Markup));
    }
}
