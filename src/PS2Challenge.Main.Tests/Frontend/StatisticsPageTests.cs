using Bunit;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Services;
using PS2Challenge.Main.Frontend.Pages;

namespace PS2Challenge.Main.Tests.Frontend;

public class StatisticsPageTests : BunitContext
{
    private readonly Mock<GameService> _gameService;

    public StatisticsPageTests()
    {
        _gameService = new Mock<GameService>(null!);
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddSingleton(_gameService.Object);
    }

    [Fact]
    public async Task Statistics_WhenNoData_ShowsEmptyPlaceholders()
    {
        _gameService.Setup(s => s.GetAllGamesAsync()).ReturnsAsync(new List<GameDto>());
        _gameService.Setup(s => s.GetAllProgressAsync()).ReturnsAsync(new List<GameProgressDto>());
        _gameService.Setup(s => s.GetOwnedTypesAsync()).ReturnsAsync(new Dictionary<int, string>());

        var cut = Render<Statistics>();

        await cut.WaitForAssertionAsync(() =>
        {
            var markup = cut.Markup;
            Assert.Contains("Challenge Statistics", markup);
            Assert.Contains("0.00%", markup);
            Assert.Contains("N/A", markup);
            Assert.Contains("No completed games with duration data yet", markup);
            Assert.Contains("No progress data available yet", markup);
            Assert.Contains("No ownership data available yet", markup);
        });
    }

    [Fact]
    public async Task Statistics_WithProgressData_ShowsCalculatedValuesAndChartControls()
    {
        var games = new List<GameDto>
        {
            new() { Id = 1, Title = "Game One", IsOwned = true, IsExcluded = false },
            new() { Id = 2, Title = "Game Two", IsOwned = true, IsExcluded = false },
            new() { Id = 3, Title = "Game Three", IsOwned = false, IsExcluded = false },
            new() { Id = 4, Title = "Game Four", IsOwned = true, IsExcluded = true }
        };

        var progress = new List<GameProgressDto>
        {
            new()
            {
                ProgressId = 1,
                GameId = 1,
                GameTitle = "Game One",
                DateStarted = new DateOnly(2024, 1, 1),
                DateFinished = new DateOnly(2024, 1, 2),
                CompletionTime = TimeSpan.FromHours(2),
                Platform = "Physical"
            },
            new()
            {
                ProgressId = 2,
                GameId = 2,
                GameTitle = "Game Two",
                DateStarted = new DateOnly(2025, 2, 1),
                DateFinished = new DateOnly(2025, 2, 3),
                CompletionTime = TimeSpan.FromHours(4),
                Platform = "Digital"
            }
        };

        _gameService.Setup(s => s.GetAllGamesAsync()).ReturnsAsync(games);
        _gameService.Setup(s => s.GetAllProgressAsync()).ReturnsAsync(progress);
        _gameService.Setup(s => s.GetOwnedTypesAsync()).ReturnsAsync(new Dictionary<int, string>
        {
            { 1, "Physical" },
            { 2, "Digital" },
            { 3, "Physical" }
        });

        var cut = Render<Statistics>();

        await cut.WaitForAssertionAsync(() =>
        {
            var markup = cut.Markup;
            Assert.Contains("2", markup); // completed
            Assert.Contains("3", markup); // in challenge
            Assert.Contains("1", markup); // remaining
            Assert.Contains("66.67%", markup); // challenge completion
            Assert.Contains("3h", markup); // average game duration
            Assert.Contains("3h", markup); // estimated time remaining
            Assert.Contains("Reset Zoom", markup);
            Assert.Contains("Ownership Type Distribution", markup);
            Assert.Contains("Game Completion by Year", markup);
            Assert.Contains("2025", markup);
            Assert.Contains("2024", markup);
        });
    }

    [Fact]
    public async Task Statistics_WhenServicesThrow_StillRendersFallbackState()
    {
        _gameService.Setup(s => s.GetAllGamesAsync()).ThrowsAsync(new InvalidOperationException("boom"));

        var cut = Render<Statistics>();

        await cut.WaitForAssertionAsync(() =>
        {
            var markup = cut.Markup;
            Assert.Contains("Challenge Statistics", markup);
            Assert.Contains("0.00%", markup);
            Assert.Contains("No progress data available yet", markup);
        });
    }
}
