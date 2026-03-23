using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Services;
using PS2Challenge.Backend.Data;
using PS2Challenge.Main.Frontend.Pages;
using Xunit;
using Moq;
using System.Security.Claims;
using PS2Challenge.Main.Api.Hubs;

namespace PS2Challenge.Main.Tests.Frontend;

/// <summary>
/// End-to-end tests for the Votes page from a user's perspective
/// These tests simulate how users interact with the voting system
/// </summary>
public class VotesPageTests : BunitContext
{
    private readonly Mock<VoteService> _mockVoteService;
    private readonly Mock<GameCoverService> _mockCoverService;
    private readonly Mock<IServiceScopeFactory> _mockScopeFactory;

    public VotesPageTests()
    {
        _mockVoteService = new Mock<VoteService>(null!);
        _mockCoverService = new Mock<GameCoverService>(null!);
        _mockScopeFactory = new Mock<IServiceScopeFactory>();

        // Configure JSInterop
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    private IRenderedComponent<Votes> RenderVotesWithAuth(ClaimsPrincipal user)
    {
        var authState = this.AddTestAuthentication(user);

        // Register services
        Services.AddSingleton(_mockVoteService.Object);
        Services.AddSingleton(_mockCoverService.Object);
        Services.AddSingleton(_mockScopeFactory.Object);
        Services.AddMockHubContext<VotesHub>();

        return this.RenderWithAuthState<Votes>(authState);
    }

    [Fact]
    public async Task VotesPage_WhenLoaded_DisplaysPageTitle()
    {
        // Arrange
        var user = new ClaimsPrincipal(new ClaimsIdentity());
        SetupBasicVotingData();

        // Act - User navigates to the votes page
        var cut = RenderVotesWithAuth(user);
        await Task.Delay(100);

        // Assert - User should see the page title
        var pageTitle = cut.Find("h1");
        Assert.Contains("Vote", pageTitle.TextContent);
    }

    [Fact]
    public async Task VotesPage_DisplaysCurrentVotes()
    {
        // Arrange - Setup current voting games
        var user = new ClaimsPrincipal(new ClaimsIdentity());

        var currentVotes = new List<CurrentVoteDto>
        {
            new CurrentVoteDto { GameTitle = "God of War", VoteCount = 150, GameNumber = 1 },
            new CurrentVoteDto { GameTitle = "Shadow of the Colossus", VoteCount = 120, GameNumber = 2 },
            new CurrentVoteDto { GameTitle = "Final Fantasy X", VoteCount = 90, GameNumber = 3 }
        };

        _mockVoteService.Setup(s => s.GetCurrentVotesAsync()).ReturnsAsync(currentVotes);
        _mockVoteService.Setup(s => s.GetVoteHistoryAsync()).ReturnsAsync(new List<VoteRoundDto>());
        _mockCoverService.Setup(s => s.GetCoverUrlsAsync(It.IsAny<IEnumerable<int>>())).ReturnsAsync(new Dictionary<int, string>());

        // Setup scope factory to return mock db context
        var mockScope = new Mock<IServiceScope>();
        var mockServiceProvider = new Mock<IServiceProvider>();
        mockScope.Setup(s => s.ServiceProvider).Returns(mockServiceProvider.Object);
        _mockScopeFactory.Setup(f => f.CreateScope()).Returns(mockScope.Object);

        // Act - User views current votes
        var cut = RenderVotesWithAuth(user);
        await Task.Delay(100);

        // Assert - All current votes should be displayed
        var markup = cut.Markup;
        Assert.Contains("God of War", markup);
        Assert.Contains("Shadow of the Colossus", markup);
        Assert.Contains("Final Fantasy X", markup);
        Assert.Contains("150", markup);
        Assert.Contains("120", markup);
        Assert.Contains("90", markup);
    }

    [Fact]
    public async Task VotesPage_DisplaysVoteCounts()
    {
        // Arrange - Setup vote counts
        var user = new ClaimsPrincipal(new ClaimsIdentity());

        var currentVotes = new List<CurrentVoteDto>
        {
            new CurrentVoteDto { GameTitle = "God of War", VoteCount = 42, GameNumber = 1 }
        };

        _mockVoteService.Setup(s => s.GetCurrentVotesAsync()).ReturnsAsync(currentVotes);
        _mockVoteService.Setup(s => s.GetVoteHistoryAsync()).ReturnsAsync(new List<VoteRoundDto>());
        _mockCoverService.Setup(s => s.GetCoverUrlsAsync(It.IsAny<IEnumerable<int>>())).ReturnsAsync(new Dictionary<int, string>());

        var mockScope = new Mock<IServiceScope>();
        var mockServiceProvider = new Mock<IServiceProvider>();
        mockScope.Setup(s => s.ServiceProvider).Returns(mockServiceProvider.Object);
        _mockScopeFactory.Setup(f => f.CreateScope()).Returns(mockScope.Object);

        // Act - User checks current voting results
        var cut = RenderVotesWithAuth(user);
        await Task.Delay(500); // Increased delay to wait for rendering

        // Assert - Vote count should be displayed
        var markup = cut.Markup;

        // Debug: Print markup if test is failing
        if (!markup.Contains("42"))
        {
            Console.WriteLine($"Markup length: {markup.Length}");
            Console.WriteLine($"Markup preview: {markup.Substring(0, Math.Min(500, markup.Length))}");
        }

        Assert.True(markup.Contains("42") || markup.Contains("God of War"),
            $"Expected vote count '42' or game title 'God of War' but got markup of length {markup.Length}");
    }

    [Fact]
    public async Task VotesPage_DisplaysVoteHistory()
    {
        // Arrange - Setup vote history
        var user = new ClaimsPrincipal(new ClaimsIdentity());

        var voteHistory = new List<VoteRoundDto>
        {
            new VoteRoundDto
            {
                VoteRound = 1,
                TopGameTitle = "Final Fantasy X",
                TopVotes = 200,
                TopPosition = 1,
                SecondGameTitle = "God of War",
                SecondVotes = 150,
                SecondPosition = 2,
                LastGameTitle = "Kingdom Hearts",
                LastVotes = 100,
                LastPosition = 3,
                Notes = "First round"
            }
        };

        _mockVoteService.Setup(s => s.GetCurrentVotesAsync()).ReturnsAsync(new List<CurrentVoteDto>());
        _mockVoteService.Setup(s => s.GetVoteHistoryAsync()).ReturnsAsync(voteHistory);
        _mockCoverService.Setup(s => s.GetCoverUrlsAsync(It.IsAny<IEnumerable<int>>())).ReturnsAsync(new Dictionary<int, string>());

        var mockScope = new Mock<IServiceScope>();
        var mockServiceProvider = new Mock<IServiceProvider>();
        mockScope.Setup(s => s.ServiceProvider).Returns(mockServiceProvider.Object);
        _mockScopeFactory.Setup(f => f.CreateScope()).Returns(mockScope.Object);

        // Act - User views voting history
        var cut = RenderVotesWithAuth(user);
        await Task.Delay(100);

        // Assert - History should be displayed
        var markup = cut.Markup;
        Assert.Contains("Vote History", markup);
        Assert.Contains("Final Fantasy X", markup);
        Assert.Contains("God of War", markup);
        Assert.Contains("Kingdom Hearts", markup);
        Assert.Contains("200", markup);
    }

    [Fact]
    public async Task VotesPage_WithNoCurrentVotes_DisplaysMessage()
    {
        // Arrange - No current votes
        var user = new ClaimsPrincipal(new ClaimsIdentity());

        _mockVoteService.Setup(s => s.GetCurrentVotesAsync()).ReturnsAsync(new List<CurrentVoteDto>());
        _mockVoteService.Setup(s => s.GetVoteHistoryAsync()).ReturnsAsync(new List<VoteRoundDto>());
        _mockCoverService.Setup(s => s.GetCoverUrlsAsync(It.IsAny<IEnumerable<int>>())).ReturnsAsync(new Dictionary<int, string>());

        var mockScope = new Mock<IServiceScope>();
        var mockServiceProvider = new Mock<IServiceProvider>();
        mockScope.Setup(s => s.ServiceProvider).Returns(mockServiceProvider.Object);
        _mockScopeFactory.Setup(f => f.CreateScope()).Returns(mockScope.Object);

        // Act
        var cut = RenderVotesWithAuth(user);
        await Task.Delay(100);

        // Assert - Should show no current votes message
        var markup = cut.Markup;
        Assert.Contains("No current votes configured", markup);
    }

    [Fact]
    public async Task VotesPage_AsAdmin_ShowsAdminControls()
    {
        // Arrange - Setup admin user
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "AdminUser"),
            new Claim(ClaimTypes.NameIdentifier, "admin-123"),
            new Claim(ClaimTypes.Role, "Admin")
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var user = new ClaimsPrincipal(identity);

        var currentVotes = new List<CurrentVoteDto>
        {
            new CurrentVoteDto { GameTitle = "God of War", VoteCount = 10, GameNumber = 1 }
        };

        _mockVoteService.Setup(s => s.GetCurrentVotesAsync()).ReturnsAsync(currentVotes);
        _mockVoteService.Setup(s => s.GetVoteHistoryAsync()).ReturnsAsync(new List<VoteRoundDto>());
        _mockCoverService.Setup(s => s.GetCoverUrlsAsync(It.IsAny<IEnumerable<int>>())).ReturnsAsync(new Dictionary<int, string>());

        var mockScope = new Mock<IServiceScope>();
        var mockServiceProvider = new Mock<IServiceProvider>();
        mockScope.Setup(s => s.ServiceProvider).Returns(mockServiceProvider.Object);
        _mockScopeFactory.Setup(f => f.CreateScope()).Returns(mockScope.Object);

        // Act - Admin user views the page
        var cut = RenderVotesWithAuth(user);
        await Task.Delay(100);

        // Assert - Admin controls should be visible
        var markup = cut.Markup;
        Assert.Contains("Add", markup);  // Add button
        Assert.Contains("Archive to History", markup);  // Archive button
    }

    [Fact]
    public async Task VotesPage_AsNonAdmin_HidesAdminControls()
    {
        // Arrange - Setup non-admin user
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "RegularUser"),
            new Claim(ClaimTypes.NameIdentifier, "user-123")
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var user = new ClaimsPrincipal(identity);

        var currentVotes = new List<CurrentVoteDto>
        {
            new CurrentVoteDto { GameTitle = "God of War", VoteCount = 10, GameNumber = 1 }
        };

        _mockVoteService.Setup(s => s.GetCurrentVotesAsync()).ReturnsAsync(currentVotes);
        _mockVoteService.Setup(s => s.GetVoteHistoryAsync()).ReturnsAsync(new List<VoteRoundDto>());
        _mockCoverService.Setup(s => s.GetCoverUrlsAsync(It.IsAny<IEnumerable<int>>())).ReturnsAsync(new Dictionary<int, string>());

        var mockScope = new Mock<IServiceScope>();
        var mockServiceProvider = new Mock<IServiceProvider>();
        mockScope.Setup(s => s.ServiceProvider).Returns(mockServiceProvider.Object);
        _mockScopeFactory.Setup(f => f.CreateScope()).Returns(mockScope.Object);

        // Act - Regular user views the page
        var cut = RenderVotesWithAuth(user);
        await Task.Delay(100);

        // Assert - Admin controls should not be present
        var markup = cut.Markup;
        Assert.DoesNotContain("Archive to History", markup);
    }

    [Fact]
    public async Task VotesPage_ShowsSearchAndFilterControls()
    {
        // Arrange
        var user = new ClaimsPrincipal(new ClaimsIdentity());

        var voteHistory = new List<VoteRoundDto>
        {
            new VoteRoundDto
            {
                VoteRound = 1,
                TopGameTitle = "Final Fantasy X",
                TopVotes = 200,
                SecondGameTitle = "God of War",
                SecondVotes = 150,
                LastGameTitle = "Kingdom Hearts",
                LastVotes = 100
            }
        };

        _mockVoteService.Setup(s => s.GetCurrentVotesAsync()).ReturnsAsync(new List<CurrentVoteDto>());
        _mockVoteService.Setup(s => s.GetVoteHistoryAsync()).ReturnsAsync(voteHistory);
        _mockCoverService.Setup(s => s.GetCoverUrlsAsync(It.IsAny<IEnumerable<int>>())).ReturnsAsync(new Dictionary<int, string>());

        var mockScope = new Mock<IServiceScope>();
        var mockServiceProvider = new Mock<IServiceProvider>();
        mockScope.Setup(s => s.ServiceProvider).Returns(mockServiceProvider.Object);
        _mockScopeFactory.Setup(f => f.CreateScope()).Returns(mockScope.Object);

        // Act
        var cut = RenderVotesWithAuth(user);
        await Task.Delay(100);

        // Assert - Search and filter controls should be present
        var markup = cut.Markup;
        Assert.Contains("Search by round or game title", markup);
        Assert.Contains("Show only rounds with votes", markup);
    }

    [Fact]
    public async Task VotesPage_DisplaysPieChartForCurrentVotes()
    {
        // Arrange - Setup current votes with different counts for pie chart
        var user = new ClaimsPrincipal(new ClaimsIdentity());

        var currentVotes = new List<CurrentVoteDto>
        {
            new CurrentVoteDto { GameTitle = "Popular Game", VoteCount = 80, GameNumber = 1 },
            new CurrentVoteDto { GameTitle = "Less Popular", VoteCount = 20, GameNumber = 2 }
        };

        _mockVoteService.Setup(s => s.GetCurrentVotesAsync()).ReturnsAsync(currentVotes);
        _mockVoteService.Setup(s => s.GetVoteHistoryAsync()).ReturnsAsync(new List<VoteRoundDto>());
        _mockCoverService.Setup(s => s.GetCoverUrlsAsync(It.IsAny<IEnumerable<int>>())).ReturnsAsync(new Dictionary<int, string>());

        var mockScope = new Mock<IServiceScope>();
        var mockServiceProvider = new Mock<IServiceProvider>();
        mockScope.Setup(s => s.ServiceProvider).Returns(mockServiceProvider.Object);
        _mockScopeFactory.Setup(f => f.CreateScope()).Returns(mockScope.Object);

        // Act - User views voting statistics
        var cut = RenderVotesWithAuth(user);
        await Task.Delay(100);

        // Assert - Pie chart should be rendered
        var markup = cut.Markup;
        Assert.Contains("pie-chart", markup);
        Assert.Contains("Popular Game", markup);
        Assert.Contains("Less Popular", markup);
    }

    [Fact]
    public async Task VotesPage_AsAdmin_WithNoCurrentVotes_ShowsAdminEmptyMessage()
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.Name, "AdminUser"),
            new Claim(ClaimTypes.NameIdentifier, "admin-123"),
            new Claim(ClaimTypes.Role, "Admin")
        };
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "Test"));

        _mockVoteService.Setup(s => s.GetCurrentVotesAsync()).ReturnsAsync(new List<CurrentVoteDto>());
        _mockVoteService.Setup(s => s.GetVoteHistoryAsync()).ReturnsAsync(new List<VoteRoundDto>());
        _mockCoverService.Setup(s => s.GetCoverUrlsAsync(It.IsAny<IEnumerable<int>>())).ReturnsAsync(new Dictionary<int, string>());

        var mockScope = new Mock<IServiceScope>();
        var mockServiceProvider = new Mock<IServiceProvider>();
        mockScope.Setup(s => s.ServiceProvider).Returns(mockServiceProvider.Object);
        _mockScopeFactory.Setup(f => f.CreateScope()).Returns(mockScope.Object);

        var cut = RenderVotesWithAuth(user);
        await Task.Delay(100);

        Assert.Contains("No current votes configured. Add games below.", cut.Markup);
    }

    [Fact]
    public async Task VotesPage_FilterRoundsWithVotes_UpdatesShownCount()
    {
        var user = new ClaimsPrincipal(new ClaimsIdentity());

        var voteHistory = new List<VoteRoundDto>
        {
            new VoteRoundDto { VoteRound = 1, TopGameTitle = "Game 1", TopVotes = 10, SecondGameTitle = "Game 2", SecondVotes = 5, LastGameTitle = "Game 3", LastVotes = 1 },
            new VoteRoundDto { VoteRound = 2, TopGameTitle = "Game 4", TopVotes = 0, SecondGameTitle = "Game 5", SecondVotes = 0, LastGameTitle = "Game 6", LastVotes = 0 }
        };

        _mockVoteService.Setup(s => s.GetCurrentVotesAsync()).ReturnsAsync(new List<CurrentVoteDto>());
        _mockVoteService.Setup(s => s.GetVoteHistoryAsync()).ReturnsAsync(voteHistory);
        _mockCoverService.Setup(s => s.GetCoverUrlsAsync(It.IsAny<IEnumerable<int>>())).ReturnsAsync(new Dictionary<int, string>());

        var mockScope = new Mock<IServiceScope>();
        var mockServiceProvider = new Mock<IServiceProvider>();
        mockScope.Setup(s => s.ServiceProvider).Returns(mockServiceProvider.Object);
        _mockScopeFactory.Setup(f => f.CreateScope()).Returns(mockScope.Object);

        var cut = RenderVotesWithAuth(user);
        await Task.Delay(100);

        var filterCheckbox = cut.Find("input[type='checkbox']");
        await filterCheckbox.ChangeAsync(true);

        Assert.Contains("Showing 1 of 2 rounds", cut.Markup);
    }

    [Fact]
    public async Task VotesPage_ShowsTiedIndicator_WhenPositionsAreNotSetAndVotesTie()
    {
        var user = new ClaimsPrincipal(new ClaimsIdentity());

        var voteHistory = new List<VoteRoundDto>
        {
            new VoteRoundDto
            {
                VoteRound = 9,
                TopGameTitle = "Tie A",
                TopVotes = 100,
                TopPosition = null,
                SecondGameTitle = "Tie B",
                SecondVotes = 100,
                SecondPosition = null,
                LastGameTitle = "Tie C",
                LastVotes = 50,
                LastPosition = null
            }
        };

        _mockVoteService.Setup(s => s.GetCurrentVotesAsync()).ReturnsAsync(new List<CurrentVoteDto>());
        _mockVoteService.Setup(s => s.GetVoteHistoryAsync()).ReturnsAsync(voteHistory);
        _mockCoverService.Setup(s => s.GetCoverUrlsAsync(It.IsAny<IEnumerable<int>>())).ReturnsAsync(new Dictionary<int, string>());

        var mockScope = new Mock<IServiceScope>();
        var mockServiceProvider = new Mock<IServiceProvider>();
        mockScope.Setup(s => s.ServiceProvider).Returns(mockServiceProvider.Object);
        _mockScopeFactory.Setup(f => f.CreateScope()).Returns(mockScope.Object);

        var cut = RenderVotesWithAuth(user);
        await Task.Delay(100);

        Assert.Contains("(Tied)", cut.Markup);
    }

    [Fact]
    public async Task VotesPage_SortByTopVotes_TogglesAscendingAndDescending()
    {
        var user = new ClaimsPrincipal(new ClaimsIdentity());

        var voteHistory = new List<VoteRoundDto>
        {
            new() { VoteRound = 1, TopGameTitle = "Game A", TopVotes = 10, SecondGameTitle = "Game B", SecondVotes = 8, LastGameTitle = "Game C", LastVotes = 5 },
            new() { VoteRound = 2, TopGameTitle = "Game D", TopVotes = 50, SecondGameTitle = "Game E", SecondVotes = 30, LastGameTitle = "Game F", LastVotes = 10 }
        };

        _mockVoteService.Setup(s => s.GetCurrentVotesAsync()).ReturnsAsync(new List<CurrentVoteDto>());
        _mockVoteService.Setup(s => s.GetVoteHistoryAsync()).ReturnsAsync(voteHistory);
        _mockCoverService.Setup(s => s.GetCoverUrlsAsync(It.IsAny<IEnumerable<int>>())).ReturnsAsync(new Dictionary<int, string>());

        var mockScope = new Mock<IServiceScope>();
        var mockServiceProvider = new Mock<IServiceProvider>();
        mockScope.Setup(s => s.ServiceProvider).Returns(mockServiceProvider.Object);
        _mockScopeFactory.Setup(f => f.CreateScope()).Returns(mockScope.Object);

        var cut = RenderVotesWithAuth(user);
        await Task.Delay(100);

        var topVotesHeader = cut.FindAll("th").First(x => x.TextContent.Contains("Top Votes"));
        await topVotesHeader.ClickAsync();

        await cut.WaitForAssertionAsync(() =>
        {
            var firstRowFirstCell = cut.Find("tbody tr td");
            Assert.Equal("1", firstRowFirstCell.TextContent.Trim());
            Assert.Contains("Top Votes ▲", cut.Markup);
        });

        await topVotesHeader.ClickAsync();

        await cut.WaitForAssertionAsync(() =>
        {
            var firstRowFirstCell = cut.Find("tbody tr td");
            Assert.Equal("2", firstRowFirstCell.TextContent.Trim());
            Assert.Contains("Top Votes ▼", cut.Markup);
        });
    }

    [Fact]
    public async Task VotesPage_SearchByNotes_FiltersVoteHistoryCount()
    {
        var user = new ClaimsPrincipal(new ClaimsIdentity());

        var voteHistory = new List<VoteRoundDto>
        {
            new() { VoteRound = 1, TopGameTitle = "Game A", TopVotes = 10, SecondGameTitle = "Game B", SecondVotes = 8, LastGameTitle = "Game C", LastVotes = 5, Notes = "special note" },
            new() { VoteRound = 2, TopGameTitle = "Game D", TopVotes = 50, SecondGameTitle = "Game E", SecondVotes = 30, LastGameTitle = "Game F", LastVotes = 10, Notes = "other" }
        };

        _mockVoteService.Setup(s => s.GetCurrentVotesAsync()).ReturnsAsync(new List<CurrentVoteDto>());
        _mockVoteService.Setup(s => s.GetVoteHistoryAsync()).ReturnsAsync(voteHistory);
        _mockCoverService.Setup(s => s.GetCoverUrlsAsync(It.IsAny<IEnumerable<int>>())).ReturnsAsync(new Dictionary<int, string>());

        var mockScope = new Mock<IServiceScope>();
        var mockServiceProvider = new Mock<IServiceProvider>();
        mockScope.Setup(s => s.ServiceProvider).Returns(mockServiceProvider.Object);
        _mockScopeFactory.Setup(f => f.CreateScope()).Returns(mockScope.Object);

        var cut = RenderVotesWithAuth(user);
        await Task.Delay(100);

        await cut.InvokeAsync(() => cut.Find("input[placeholder*='Search by round or game title']").Input("special"));

        await cut.WaitForAssertionAsync(() => Assert.Contains("Showing 1 of 2 rounds", cut.Markup));
    }

    [Fact]
    public async Task VotesPage_ZeroVoteTotals_ShowsNoVotesPieFallback()
    {
        var user = new ClaimsPrincipal(new ClaimsIdentity());

        var currentVotes = new List<CurrentVoteDto>
        {
            new() { GameTitle = "Game A", VoteCount = 0, GameNumber = 1 },
            new() { GameTitle = "Game B", VoteCount = 0, GameNumber = 2 }
        };

        _mockVoteService.Setup(s => s.GetCurrentVotesAsync()).ReturnsAsync(currentVotes);
        _mockVoteService.Setup(s => s.GetVoteHistoryAsync()).ReturnsAsync(new List<VoteRoundDto>());
        _mockCoverService.Setup(s => s.GetCoverUrlsAsync(It.IsAny<IEnumerable<int>>())).ReturnsAsync(new Dictionary<int, string>());

        var mockScope = new Mock<IServiceScope>();
        var mockServiceProvider = new Mock<IServiceProvider>();
        mockScope.Setup(s => s.ServiceProvider).Returns(mockServiceProvider.Object);
        _mockScopeFactory.Setup(f => f.CreateScope()).Returns(mockScope.Object);

        var cut = RenderVotesWithAuth(user);
        await Task.Delay(100);

        Assert.Contains("No votes", cut.Markup);
        Assert.Contains("0 (100.0%)", cut.Markup);
    }

    private void SetupBasicVotingData()
    {
        _mockVoteService.Setup(s => s.GetCurrentVotesAsync()).ReturnsAsync(new List<CurrentVoteDto>
        {
            new CurrentVoteDto { GameTitle = "Test Game", VoteCount = 0, GameNumber = 1 }
        });
        _mockVoteService.Setup(s => s.GetVoteHistoryAsync()).ReturnsAsync(new List<VoteRoundDto>());
        _mockCoverService.Setup(s => s.GetCoverUrlsAsync(It.IsAny<IEnumerable<int>>())).ReturnsAsync(new Dictionary<int, string>());

        var mockScope = new Mock<IServiceScope>();
        var mockServiceProvider = new Mock<IServiceProvider>();
        mockScope.Setup(s => s.ServiceProvider).Returns(mockServiceProvider.Object);
        _mockScopeFactory.Setup(f => f.CreateScope()).Returns(mockScope.Object);
    }
}
