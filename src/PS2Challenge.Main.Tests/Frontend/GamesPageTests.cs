using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Services;
using PS2Challenge.Main.Frontend.Pages;
using Xunit;
using Moq;
using System.Security.Claims;
using Microsoft.AspNetCore.Components.Authorization;
using PS2Challenge.Main.Api.Hubs;

namespace PS2Challenge.Main.Tests.Frontend;

/// <summary>
/// End-to-end tests for the Games page from a user's perspective
/// These tests simulate how users interact with the actual website
/// </summary>
public class GamesPageTests : BunitContext
{
    private readonly Mock<GameService> _mockGameService;
    private readonly Mock<AuthenticationStateProvider> _mockAuthStateProvider;

    public GamesPageTests()
    {
        // Create mock with null parameters (won't be used in tests)
        _mockGameService = new Mock<GameService>(null!);
        _mockAuthStateProvider = new Mock<AuthenticationStateProvider>();

        // Setup default unauthenticated user
        var anonymousUser = new ClaimsPrincipal(new ClaimsIdentity());
        var authState = Task.FromResult(new AuthenticationState(anonymousUser));
        _mockAuthStateProvider.Setup(x => x.GetAuthenticationStateAsync()).Returns(authState);

        // Register services
        Services.AddSingleton(_mockGameService.Object);
        Services.AddSingleton(_mockAuthStateProvider.Object);
        Services.AddMockHubContext<GamesHub>();
        Services.AddAuthorizationCore();

        // Add JSInterop for localStorage calls
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    /// <summary>
    /// Helper method to setup game service mock with test data
    /// </summary>
    private void SetupGameServiceMock(
        List<GameDto> games,
        Dictionary<int, string>? ownedTypes = null,
        Dictionary<int, string>? exclusionReasons = null,
        Dictionary<int, string>? completionStatus = null,
        Dictionary<int, List<AlternateTitle>>? alternateTitles = null)
    {
        ownedTypes ??= new Dictionary<int, string>();
        exclusionReasons ??= new Dictionary<int, string>();
        completionStatus ??= new Dictionary<int, string>();
        alternateTitles ??= new Dictionary<int, List<AlternateTitle>>();

        var pageData = new GamesPageDataDto
        {
            Games = games,
            OwnedTypes = ownedTypes,
            ExclusionReasons = exclusionReasons,
            CompletionStatus = completionStatus,
            AlternateTitles = alternateTitles
        };

        _mockGameService.Setup(s => s.GetGamesPageDataAsync()).ReturnsAsync(pageData);

        // Also setup individual methods for backwards compatibility if any code still uses them
        _mockGameService.Setup(s => s.GetAllGamesAsync()).ReturnsAsync(games);
        _mockGameService.Setup(s => s.GetOwnedTypesAsync()).ReturnsAsync(ownedTypes);
        _mockGameService.Setup(s => s.GetExclusionReasonsAsync()).ReturnsAsync(exclusionReasons);
        _mockGameService.Setup(s => s.GetCompletionStatusAsync()).ReturnsAsync(completionStatus);
        _mockGameService.Setup(s => s.GetAlternateTitlesAsync()).ReturnsAsync(alternateTitles);
    }

    [Fact]
    public async Task GamesPage_WhenLoaded_DisplaysPageTitle()
    {
        // Arrange - Setup test data
        var games = new List<GameDto>
        {
            new GameDto { Id = 1, Title = "God of War", Developer = "SCE Santa Monica", Publisher = "Sony", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false },
            new GameDto { Id = 2, Title = "Shadow of the Colossus", Developer = "Team Ico", Publisher = "Sony", RegionFirstReleasedIn = "JP", IsOwned = true, IsExcluded = false }
        };

        SetupGameServiceMock(games);

        // Act - Render the page as a user would see it
        var cut = Render<Games>();

        // Wait for async initialization
        await Task.Delay(100);

        // Assert - Check what the user sees
        var pageTitle = cut.Find("h1");
        Assert.Contains("Games", pageTitle.TextContent);
    }

    [Fact]
    public async Task GamesPage_WhenLoaded_DisplaysAllGames()
    {
        // Arrange - Setup test data with various games
        var games = new List<GameDto>
        {
            new GameDto { Id = 1, Title = "God of War", Developer = "SCE Santa Monica", Publisher = "Sony", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false },
            new GameDto { Id = 2, Title = "Shadow of the Colossus", Developer = "Team Ico", Publisher = "Sony", RegionFirstReleasedIn = "JP", IsOwned = true, IsExcluded = false },
            new GameDto { Id = 3, Title = "Grand Theft Auto: San Andreas", Developer = "Rockstar North", Publisher = "Rockstar", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false }
        };

        SetupGameServiceMock(games);

        // Act - User navigates to the games page
        var cut = Render<Games>();

        // Wait for async initialization
        await Task.Delay(100);

        // Assert - User should see all games displayed
        var markup = cut.Markup;
        Assert.Contains("God of War", markup);
        Assert.Contains("Shadow of the Colossus", markup);
        Assert.Contains("Grand Theft Auto: San Andreas", markup);
    }

    [Fact]
    public async Task GamesPage_WhenUserSearches_SearchInputUpdates()
    {
        // Arrange
        var games = new List<GameDto>
        {
            new GameDto { Id = 1, Title = "God of War", Developer = "SCE Santa Monica", Publisher = "Sony", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false },
            new GameDto { Id = 2, Title = "God of War II", Developer = "SCE Santa Monica", Publisher = "Sony", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false },
            new GameDto { Id = 3, Title = "Shadow of the Colossus", Developer = "Team Ico", Publisher = "Sony", RegionFirstReleasedIn = "JP", IsOwned = true, IsExcluded = false }
        };

        SetupGameServiceMock(games);

        var cut = Render<Games>();
        await Task.Delay(100);

        // Act - User types "God of War" in the search box
        var searchInput = cut.Find("input[placeholder*='Search']");
        searchInput.Input("God of War");

        // Assert - Search input should contain the user's search term
        Assert.Contains("God of War", searchInput.GetAttribute("value") ?? "");
    }

    [Fact]
    public async Task GamesPage_DisplaysGameStatistics()
    {
        // Arrange - Setup games with different completion statuses
        var allGames = new List<GameDto>
        {
            new GameDto { Id = 1, Title = "Game 1", Developer = "Dev 1", Publisher = "Pub 1", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false },
            new GameDto { Id = 2, Title = "Game 2", Developer = "Dev 2", Publisher = "Pub 2", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false },
            new GameDto { Id = 3, Title = "Game 3", Developer = "Dev 3", Publisher = "Pub 3", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false }
        };

        var completionStatus = new Dictionary<int, string>
        {
            { 1, "Completed" }
        };

        SetupGameServiceMock(allGames, completionStatus: completionStatus);

        // Act - User views the page
        var cut = Render<Games>();
        await Task.Delay(100);

        // Assert - User should see game statistics
        var markup = cut.Markup;

        // Should show owned count
        Assert.Contains("Owned: 3", markup);
    }

    [Fact]
    public async Task GamesPage_WhenNoGames_DisplaysAppropriateMessage()
    {
        // Arrange - Empty game list
        SetupGameServiceMock(new List<GameDto>());

        // Act - User views the page with no games
        var cut = Render<Games>();
        await Task.Delay(100);

        // Assert - Should show no results message
        var markup = cut.Markup;
        Assert.Contains("No games found", markup);
    }

    [Fact]
    public async Task GamesPage_GameTable_ContainsEssentialInformation()
    {
        // Arrange - Setup a game with all details
        var games = new List<GameDto>
        {
            new GameDto
            {
                Id = 1,
                Title = "God of War",
                Developer = "SCE Santa Monica Studio",
                Publisher = "Sony",
                FirstReleased = new DateOnly(2005, 3, 22),
                RegionFirstReleasedIn = "NA",
                IsOwned = true,
                IsExcluded = false
            }
        };

        SetupGameServiceMock(games);

        // Act - User views game details
        var cut = Render<Games>();
        await Task.Delay(100);

        // Assert - Game row should display key information
        var markup = cut.Markup;
        Assert.Contains("God of War", markup);
        Assert.Contains("SCE Santa Monica Studio", markup);
        Assert.Contains("Sony", markup);
        Assert.Contains("2005", markup);
    }

    [Fact]
    public async Task GamesPage_FilterControls_AreAccessible()
    {
        // Arrange
        var games = new List<GameDto>
        {
            new GameDto { Id = 1, Title = "Test Game", Developer = "Test Dev", Publisher = "Test Pub", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false }
        };

        SetupGameServiceMock(games);

        // Act
        var cut = Render<Games>();
        await Task.Delay(100);

        // Assert - All filter controls should be present and accessible
        var searchInput = cut.Find("input[placeholder*='Search']");
        var ownedOnlyCheckbox = cut.Find("#showOwnedOnly");
        var excludedCheckbox = cut.Find("#showExcludedGames");

        Assert.NotNull(searchInput);
        Assert.NotNull(ownedOnlyCheckbox);
        Assert.NotNull(excludedCheckbox);
    }

    [Fact]
    public async Task GamesPage_AsAuthenticatedUser_CanSeeFullContent()
    {
        // Arrange - Setup authenticated user
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "TestUser"),
            new Claim(ClaimTypes.NameIdentifier, "test-123")
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var user = new ClaimsPrincipal(identity);
        var authState = Task.FromResult(new AuthenticationState(user));

        _mockAuthStateProvider.Setup(x => x.GetAuthenticationStateAsync()).Returns(authState);

        var games = new List<GameDto>
        {
            new GameDto { Id = 1, Title = "God of War", Developer = "SCE Santa Monica", Publisher = "Sony", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false }
        };

        SetupGameServiceMock(games);

        // Act - Authenticated user views the page
        var cut = Render<Games>();
        await Task.Delay(100);

        // Assert - Page renders successfully
        Assert.Contains("God of War", cut.Markup);
    }

    [Fact]
    public async Task GamesPage_ShowsCompletionStatusBadges()
    {
        // Arrange - Setup games with different completion statuses
        var games = new List<GameDto>
        {
            new GameDto { Id = 1, Title = "Completed Game", Developer = "Dev", Publisher = "Pub", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false },
            new GameDto { Id = 2, Title = "In Progress Game", Developer = "Dev", Publisher = "Pub", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false },
            new GameDto { Id = 3, Title = "Not Started Game", Developer = "Dev", Publisher = "Pub", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false }
        };

        var completionStatus = new Dictionary<int, string>
        {
            { 1, "Completed" },
            { 2, "In Progress" }
        };

        SetupGameServiceMock(games, completionStatus: completionStatus);

        // Act
        var cut = Render<Games>();
        await Task.Delay(100);

        // Assert - Should display all three status types
        var markup = cut.Markup;
        Assert.Contains("Completed", markup);
        Assert.Contains("In Progress", markup);
        Assert.Contains("Not Started", markup);
    }

    [Fact]
    public async Task GamesPage_FiltersExcludedGamesWhenCheckboxUnchecked()
    {
        // Arrange - Setup with both included and excluded games
        var games = new List<GameDto>
        {
            new GameDto { Id = 1, Title = "Included Game", Developer = "Dev", Publisher = "Pub", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false },
            new GameDto { Id = 2, Title = "Excluded Game", Developer = "Dev", Publisher = "Pub", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = true }
        };

        SetupGameServiceMock(games, exclusionReasons: new Dictionary<int, string> { { 2, "Test reason" } });

        // Act
        var cut = Render<Games>();
        await Task.Delay(100);

        // Assert - By default, excluded games should not be shown
        var markup = cut.Markup;
        Assert.Contains("Included Game", markup);
        // The "Excluded Game" text might appear in the status badge, so we check the overall structure
        Assert.Contains("Showing 1 of 2 games", markup);
    }

    [Fact]
    public async Task GamesPage_AsAdmin_ShowsAddNewGameAction()
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "AdminUser"),
            new Claim(ClaimTypes.NameIdentifier, "admin-123"),
            new Claim(ClaimTypes.Role, "Admin")
        };
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "Test"));
        _mockAuthStateProvider.Setup(x => x.GetAuthenticationStateAsync())
            .Returns(Task.FromResult(new AuthenticationState(user)));

        SetupGameServiceMock(new List<GameDto>
        {
            new GameDto { Id = 1, Title = "Admin Game", Developer = "Dev", Publisher = "Pub", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false }
        });

        var cut = Render<Games>();
        await Task.Delay(100);

        Assert.Contains("+ Add New Game", cut.Markup);
    }

    [Fact]
    public async Task GamesPage_WhenDataLoadThrows_ShowsNoGamesMessage()
    {
        _mockGameService.Setup(s => s.GetGamesPageDataAsync())
            .ThrowsAsync(new InvalidOperationException("load failed"));

        var cut = Render<Games>();
        await Task.Delay(100);

        Assert.Contains("No games found.", cut.Markup);
    }

    [Fact]
    public async Task GamesPage_SearchByDeveloper_FiltersResultsCount()
    {
        var games = new List<GameDto>
        {
            new GameDto { Id = 1, Title = "Game A", Developer = "Rockstar North", Publisher = "Rockstar", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false },
            new GameDto { Id = 2, Title = "Game B", Developer = "Square", Publisher = "Square Enix", RegionFirstReleasedIn = "JP", IsOwned = true, IsExcluded = false }
        };

        SetupGameServiceMock(games);

        var cut = Render<Games>();
        await Task.Delay(100);

        var searchInput = cut.Find("input[placeholder*='Search games']");
        await searchInput.InputAsync("Rockstar");

        Assert.Contains("Showing 1 of 2 games", cut.Markup);
    }

    [Fact]
    public async Task GamesPage_SearchByAlternateTitle_FiltersResultsCount()
    {
        var games = new List<GameDto>
        {
            new GameDto { Id = 1, Title = "Ratchet and Clank 2", Developer = "Insomniac", Publisher = "Sony", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false },
            new GameDto { Id = 2, Title = "Dark Cloud", Developer = "Level-5", Publisher = "Sony", RegionFirstReleasedIn = "JP", IsOwned = true, IsExcluded = false }
        };

        var alternateTitles = new Dictionary<int, List<AlternateTitle>>
        {
            [1] = new List<AlternateTitle> { new() { GameId = 1, Title = "Going Commando" } }
        };

        SetupGameServiceMock(games, alternateTitles: alternateTitles);

        var cut = Render<Games>();
        await Task.Delay(100);

        var searchInput = cut.Find("input[placeholder*='Search games']");
        await searchInput.InputAsync("Commando");

        Assert.Contains("Showing 1 of 2 games", cut.Markup);
    }

    [Fact]
    public async Task GamesPage_ShowOwnedOnly_FilterReducesVisibleResults()
    {
        var games = new List<GameDto>
        {
            new GameDto { Id = 1, Title = "Owned Game", Developer = "Dev", Publisher = "Pub", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false },
            new GameDto { Id = 2, Title = "Not Owned Game", Developer = "Dev", Publisher = "Pub", RegionFirstReleasedIn = "NA", IsOwned = false, IsExcluded = false }
        };

        SetupGameServiceMock(games);

        var cut = Render<Games>();
        await Task.Delay(100);
        Assert.Contains("Showing 2 of 2 games", cut.Markup);

        await cut.InvokeAsync(() => cut.Find("#showOwnedOnly").Change(true));

        await cut.WaitForAssertionAsync(() => Assert.Contains("Showing 1 of 2 games", cut.Markup));
    }

    [Fact]
    public async Task GamesPage_SortByDeveloper_ChangesDisplayedOrder()
    {
        var games = new List<GameDto>
        {
            new GameDto { Id = 1, Title = "Game A", Developer = "ZZZ Studio", Publisher = "Pub", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false },
            new GameDto { Id = 2, Title = "Game B", Developer = "AAA Studio", Publisher = "Pub", RegionFirstReleasedIn = "NA", IsOwned = true, IsExcluded = false }
        };

        SetupGameServiceMock(games);

        var cut = Render<Games>();
        await Task.Delay(100);

        await cut.InvokeAsync(() => cut.FindAll("th").First(x => x.TextContent.Contains("Developer")).Click());

        await cut.WaitForAssertionAsync(() =>
        {
            var firstRow = cut.Find("tbody tr");
            Assert.Contains("Game B", firstRow.TextContent);
        });
    }
}
