using Bunit;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Services;
using PS2Challenge.Main.Api.Hubs;
using PS2Challenge.Main.Frontend.Pages;
using System.Security.Claims;

namespace PS2Challenge.Main.Tests.Frontend;

public class CompletedGamesPageTests : BunitContext
{
    private readonly Mock<GameService> _mockGameService;

    public CompletedGamesPageTests()
    {
        _mockGameService = new Mock<GameService>(null!);
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    private IRenderedComponent<CompletedGames> RenderCompletedGamesAsAnonymous(IEnumerable<GameProgressDto>? progress = null, bool throwOnLoad = false)
    {
        var anonymous = new ClaimsPrincipal(new ClaimsIdentity());
        var authProvider = new Mock<AuthenticationStateProvider>();
        authProvider.Setup(x => x.GetAuthenticationStateAsync())
            .ReturnsAsync(new AuthenticationState(anonymous));

        if (throwOnLoad)
        {
            _mockGameService.Setup(s => s.GetAllProgressAsync())
                .ThrowsAsync(new InvalidOperationException("load failed"));
        }
        else
        {
            _mockGameService.Setup(s => s.GetAllProgressAsync())
                .ReturnsAsync(progress ?? Enumerable.Empty<GameProgressDto>());
        }

        _mockGameService.Setup(s => s.GetAlternateTitlesAsync())
            .ReturnsAsync(new Dictionary<int, List<AlternateTitle>>());

        Services.AddSingleton(_mockGameService.Object);
        Services.AddSingleton(authProvider.Object);
        Services.AddSingleton(Mock.Of<IServiceScopeFactory>());
        Services.AddMockHubContext<GamesHub>();

        return Render<CompletedGames>();
    }

    [Fact]
    public async Task CompletedGames_WhenLoaded_ShowsSummaryCounts()
    {
        var progress = new List<GameProgressDto>
        {
            new()
            {
                ProgressId = 1,
                GameId = 1,
                GameTitle = "Completed One",
                DateStarted = new DateOnly(2024, 1, 1),
                DateFinished = new DateOnly(2024, 1, 20),
                Platform = "Physical"
            },
            new()
            {
                ProgressId = 2,
                GameId = 2,
                GameTitle = "In Progress Two",
                DateStarted = new DateOnly(2024, 2, 1),
                DateFinished = null,
                Platform = "Digital"
            }
        };

        var cut = RenderCompletedGamesAsAnonymous(progress);
        await Task.Delay(100);

        var markup = cut.Markup;
        Assert.Contains("Game Progress", markup);
        Assert.Contains("Showing 2 of 2 games", markup);
        Assert.Contains("Completed: 1", markup);
        Assert.Contains("In Progress: 1", markup);
    }

    [Fact]
    public async Task CompletedGames_WhenLoadFails_ShowsEmptyState()
    {
        var cut = RenderCompletedGamesAsAnonymous(throwOnLoad: true);
        await Task.Delay(100);

        var markup = cut.Markup;
        Assert.Contains("No games in progress found.", markup);
    }

    [Fact]
    public async Task CompletedGames_SearchFiltersSummaryCount()
    {
        var progress = new List<GameProgressDto>
        {
            new()
            {
                ProgressId = 1,
                GameId = 1,
                GameTitle = "Final Fantasy X",
                DateStarted = new DateOnly(2024, 1, 1),
                Platform = "Physical"
            },
            new()
            {
                ProgressId = 2,
                GameId = 2,
                GameTitle = "Shadow Hearts",
                DateStarted = new DateOnly(2024, 1, 2),
                Platform = "Physical"
            }
        };

        var cut = RenderCompletedGamesAsAnonymous(progress);
        await Task.Delay(100);

        var search = cut.Find("input[placeholder*='Search by title']");
        await search.InputAsync("Final");

        Assert.Contains("Showing 1 of 2 games", cut.Markup);
    }
}
