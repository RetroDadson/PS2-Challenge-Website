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
        _mockGameService = new Mock<GameService>(Mock.Of<IServiceScopeFactory>());
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
        await cut.WaitForAssertionAsync(() =>
        {
            var markup = cut.Markup;
            Assert.Contains("Game Progress", markup);
            Assert.Contains("Showing 2 of 2 games", markup);
            Assert.Contains("Completed: 1", markup);
            Assert.Contains("In Progress: 1", markup);
        });
    }

    [Fact]
    public async Task CompletedGames_WhenLoadFails_ShowsEmptyState()
    {
        var cut = RenderCompletedGamesAsAnonymous(throwOnLoad: true);
        await cut.WaitForAssertionAsync(() => Assert.Contains("No games in progress found.", cut.Markup));
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
        await cut.WaitForAssertionAsync(() => Assert.Contains("Showing 2 of 2 games", cut.Markup));

        await cut.InvokeAsync(() =>
            cut.Find("input[placeholder*='Search by title']").Input("Final"));

        await cut.WaitForAssertionAsync(() => Assert.Contains("Showing 1 of 2 games", cut.Markup));
    }

    [Fact]
    public async Task CompletedGames_ShowCompletedOnly_FilterReducesResults()
    {
        var progress = new List<GameProgressDto>
        {
            new()
            {
                ProgressId = 1,
                GameId = 1,
                GameTitle = "Completed One",
                DateStarted = new DateOnly(2024, 1, 1),
                DateFinished = new DateOnly(2024, 1, 5),
                Platform = "Physical"
            },
            new()
            {
                ProgressId = 2,
                GameId = 2,
                GameTitle = "In Progress Two",
                DateStarted = new DateOnly(2024, 1, 2),
                DateFinished = null,
                Platform = "Digital"
            }
        };

        var cut = RenderCompletedGamesAsAnonymous(progress);
        await cut.WaitForAssertionAsync(() => Assert.Contains("Showing 2 of 2 games", cut.Markup));

        await cut.InvokeAsync(() => cut.Find("#showCompletedOnly").Change(true));

        await cut.WaitForAssertionAsync(() => Assert.Contains("Showing 1 of 2 games", cut.Markup));
        Assert.DoesNotContain("In Progress Two", cut.Markup);
    }

    [Fact]
    public async Task CompletedGames_SortByStatus_BringsInProgressFirstWhenAscending()
    {
        var progress = new List<GameProgressDto>
        {
            new()
            {
                ProgressId = 1,
                GameId = 1,
                GameTitle = "Completed Alpha",
                DateStarted = new DateOnly(2024, 1, 1),
                DateFinished = new DateOnly(2024, 2, 1),
                Platform = "Physical"
            },
            new()
            {
                ProgressId = 2,
                GameId = 2,
                GameTitle = "In Progress Beta",
                DateStarted = new DateOnly(2024, 1, 2),
                DateFinished = null,
                Platform = "Digital"
            }
        };

        var cut = RenderCompletedGamesAsAnonymous(progress);
        await cut.WaitForAssertionAsync(() => Assert.Contains("Completed Alpha", cut.Markup));

        await cut.InvokeAsync(() => cut.FindAll("th").First(x => x.TextContent.Contains("Status")).Click());

        await cut.WaitForAssertionAsync(() =>
        {
            var firstRow = cut.Find("tbody tr");
            Assert.Contains("In Progress Beta", firstRow.TextContent);
        });
    }

    [Fact]
    public async Task CompletedGames_ShowInProgressOnly_FilterReducesResults()
    {
        var progress = new List<GameProgressDto>
        {
            new()
            {
                ProgressId = 1,
                GameId = 1,
                GameTitle = "Completed One",
                DateStarted = new DateOnly(2024, 1, 1),
                DateFinished = new DateOnly(2024, 1, 5),
                Platform = "Physical"
            },
            new()
            {
                ProgressId = 2,
                GameId = 2,
                GameTitle = "In Progress Two",
                DateStarted = new DateOnly(2024, 1, 2),
                DateFinished = null,
                Platform = "Digital"
            }
        };

        var cut = RenderCompletedGamesAsAnonymous(progress);
        await cut.WaitForAssertionAsync(() => Assert.Contains("Showing 2 of 2 games", cut.Markup));

        await cut.InvokeAsync(() => cut.Find("#showInProgressOnly").Change(true));

        await cut.WaitForAssertionAsync(() => Assert.Contains("Showing 1 of 2 games", cut.Markup));
        Assert.DoesNotContain("Completed One", cut.Markup);
    }

    [Fact]
    public async Task CompletedGames_SortByFinishedDate_AscendingPlacesCompletedFirst()
    {
        var progress = new List<GameProgressDto>
        {
            new()
            {
                ProgressId = 1,
                GameId = 1,
                GameTitle = "Completed Later",
                DateStarted = new DateOnly(2024, 1, 1),
                DateFinished = new DateOnly(2024, 2, 1),
                Platform = "Physical"
            },
            new()
            {
                ProgressId = 2,
                GameId = 2,
                GameTitle = "In Progress",
                DateStarted = new DateOnly(2024, 1, 2),
                DateFinished = null,
                Platform = "Digital"
            }
        };

        var cut = RenderCompletedGamesAsAnonymous(progress);
        await cut.WaitForAssertionAsync(() => Assert.Contains("Completed Later", cut.Markup));

        await cut.InvokeAsync(() => cut.FindAll("th").First(x => x.TextContent.Contains("Finished")).Click());

        await cut.WaitForAssertionAsync(() =>
        {
            var firstRow = cut.Find("tbody tr");
            Assert.Contains("Completed Later", firstRow.TextContent);
        });

        Assert.Contains("Finished ▲", cut.Markup);
    }

    [Fact]
    public async Task CompletedGames_SearchByCriteriaAndReview_FiltersResults()
    {
        var progress = new List<GameProgressDto>
        {
            new()
            {
                ProgressId = 1,
                GameId = 1,
                GameTitle = "Game One",
                DateStarted = new DateOnly(2024, 1, 1),
                DateFinished = null,
                Platform = "Physical",
                BeatenCriteria = "Any%",
                Review = "Excellent"
            },
            new()
            {
                ProgressId = 2,
                GameId = 2,
                GameTitle = "Game Two",
                DateStarted = new DateOnly(2024, 1, 2),
                DateFinished = null,
                Platform = "Digital",
                BeatenCriteria = "100%",
                Review = "Good"
            }
        };

        var cut = RenderCompletedGamesAsAnonymous(progress);
        await cut.WaitForAssertionAsync(() => Assert.Contains("Showing 2 of 2 games", cut.Markup));

        await cut.InvokeAsync(() => cut.Find("input[placeholder*='Search by title']").Input("Any%"));
        await cut.WaitForAssertionAsync(() => Assert.Contains("Showing 1 of 2 games", cut.Markup));

        await cut.InvokeAsync(() => cut.Find("input[placeholder*='Search by title']").Input("Excellent"));
        await cut.WaitForAssertionAsync(() => Assert.Contains("Showing 1 of 2 games", cut.Markup));
    }
}
