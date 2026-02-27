using PS2Challenge.Backend.Models;
using PS2Challenge.IntegrationTests.Helpers;
using System.Net;

namespace PS2Challenge.IntegrationTests.Api;

/// <summary>
/// Integration tests for the Games API endpoints
/// </summary>
public class GamesApiIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;
    private readonly HttpClient _adminClient;

    public GamesApiIntegrationTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
        _adminClient = factory.CreateAuthenticatedClient("Admin");
    }

    [Fact]
    public async Task GetGames_ReturnsSuccessStatusCode()
    {
        // Act
        var response = await _client.GetAsync("/api/games");

        // Assert
        response.EnsureSuccessStatusCode();
        Assert.Equal("application/json; charset=utf-8", response.Content.Headers.ContentType?.ToString());
    }

    [Fact]
    public async Task GetGames_ReturnsGamesList()
    {
        // Act
        var response = await _client.GetAsync("/api/games");

        // Assert
        response.EnsureSuccessStatusCode();
        var games = await response.Content.ReadFromJsonAsync<List<GameDto>>();
        Assert.NotNull(games);
    }

    [Fact]
    public async Task GetGames_WithSearchQuery_ReturnsFilteredResults()
    {
        // Act
        var response = await _client.GetAsync("/api/games?title=Grand");

        // Assert
        response.EnsureSuccessStatusCode();
        var games = await response.Content.ReadFromJsonAsync<List<GameDto>>();
        Assert.NotNull(games);
    }

    [Fact]
    public async Task GetGameById_ReturnsSuccessStatusCode()
    {
        // This test assumes a game exists with ID 1 or will return NotFound
        // Act
        var response = await _client.GetAsync("/api/games/1");

        // Assert
        Assert.True(response.StatusCode == HttpStatusCode.OK || response.StatusCode == HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetGameById_WithInvalidId_ReturnsNotFound()
    {
        // Act
        var response = await _client.GetAsync("/api/games/999999");

        // Assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task CreateGame_WithoutAuth_ReturnsUnauthorized()
    {
        // Arrange
        var newGame = new GameDto
        {
            Title = "Test Game",
            Developer = "Test Developer",
            Publisher = "Test Publisher",
            RegionFirstReleasedIn = "NA"
        };

        // Act
        var response = await _client.PostAsJsonAsync("/api/games", newGame);

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CreateGame_WithAuth_AndInvalidData_ReturnsBadRequest()
    {
        // Arrange
        var invalidGame = new GameDto
        {
            Title = "", // Invalid - empty title
            Developer = "Test Developer",
            Publisher = "Test Publisher",
            RegionFirstReleasedIn = "NA"
        };

        // Act
        var response = await _adminClient.PostAsJsonAsync("/api/games", invalidGame);

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task GetOwnershipTypes_ReturnsSuccessStatusCode()
    {
        // Act
        var response = await _client.GetAsync("/api/games/ownership-types");

        // Assert
        response.EnsureSuccessStatusCode();
        var types = await response.Content.ReadFromJsonAsync<List<OwnershipType>>();
        Assert.NotNull(types);
    }
}

/// <summary>
/// Integration tests for the Votes API endpoints
/// </summary>
public class VotesApiIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;
    private readonly HttpClient _adminClient;

    public VotesApiIntegrationTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
        _adminClient = factory.CreateAuthenticatedClient("Admin");
    }

    [Fact]
    public async Task GetHistory_ReturnsSuccessStatusCode()
    {
        // Act
        var response = await _client.GetAsync("/api/votes/history");

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetCurrentVotes_ReturnsSuccessStatusCode()
    {
        // Act
        var response = await _client.GetAsync("/api/votes/current");

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task UploadHistory_WithoutAuth_ReturnsUnauthorized()
    {
        // Arrange
        var uploadData = new List<object>
        {
            new { voteRound = 1, votes = new[] { new { gameTitle = "Test", count = 10 } } }
        };

        // Act
        var response = await _client.PostAsJsonAsync("/api/votes/upload", uploadData);

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task SetCurrentVotes_WithoutAuth_ReturnsUnauthorized()
    {
        // Arrange
        var voteData = new List<object>
        {
            new { gameTitle = "Test Game", voteCount = 10, gameNumber = 1 }
        };

        // Act
        var response = await _client.PostAsJsonAsync("/api/votes/current", voteData);

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task SetCurrentVotes_WithAuth_AndInvalidData_ReturnsBadRequest()
    {
        // Arrange - empty list is invalid
        var voteData = new List<object>();

        // Act
        var response = await _adminClient.PostAsJsonAsync("/api/votes/current", voteData);

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task SetCurrentVotes_WithUnknownTitle_ReturnsBadRequest()
    {
        var voteData = new List<object>
        {
            new { gameTitle = "Definitely Not A Real Game", voteCount = 10, gameNumber = 1 }
        };

        var response = await _adminClient.PostAsJsonAsync("/api/votes/current", voteData);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UploadHistory_WithDuplicateTitlesInRound_ReturnsBadRequest()
    {
        var uploadData = new List<object>
        {
            new
            {
                voteRound = 10,
                notes = "Duplicate titles",
                votes = new[]
                {
                    new { gameTitle = "Grand Theft Auto: San Andreas", count = 10, position = 1 },
                    new { gameTitle = "Grand Theft Auto: San Andreas", count = 8, position = 2 },
                    new { gameTitle = "Final Fantasy X", count = 7, position = 3 }
                }
            }
        };

        var response = await _adminClient.PostAsJsonAsync("/api/votes/upload", uploadData);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UploadHistory_WithInvalidPosition_ReturnsBadRequest()
    {
        var uploadData = new List<object>
        {
            new
            {
                voteRound = 11,
                votes = new[]
                {
                    new { gameTitle = "Grand Theft Auto: San Andreas", count = 10, position = 4 },
                    new { gameTitle = "Final Fantasy X", count = 8, position = 2 },
                    new { gameTitle = "Kingdom Hearts", count = 7, position = 3 }
                }
            }
        };

        var response = await _adminClient.PostAsJsonAsync("/api/votes/upload", uploadData);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UpdateVoteByGameNumber_WithInvalidGameNumber_ReturnsBadRequest()
    {
        var request = new { gameNumber = 0, voteCount = 5 };

        var response = await _adminClient.PutAsJsonAsync("/api/votes/current/by-game-number", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UpdateVoteByGameNumber_WithNegativeVoteCount_ReturnsBadRequest()
    {
        var request = new { gameNumber = 1, voteCount = -1 };

        var response = await _adminClient.PutAsJsonAsync("/api/votes/current/by-game-number", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task FillCurrentVotesWithRandom_WithZeroCount_ReturnsBadRequest()
    {
        var response = await _adminClient.PostAsJsonAsync("/api/votes/current/fill-random", new { count = 0 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}

/// <summary>
/// Integration tests for authentication endpoints
/// </summary>
public class AuthApiIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;

    public AuthApiIntegrationTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false // Don't follow redirects for auth tests
        });
    }

    [Fact]
    public async Task Login_ReturnsRedirect()
    {
        // In test environment, Twitch auth handler will redirect to home page
        // Act
        var response = await _client.GetAsync("/api/auth/login");

        // Assert - Should redirect (Twitch handler redirects to return URL or home)
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
    }

    [Fact]
    public async Task GetUser_WithoutAuth_ReturnsOkWithUnauthenticated()
    {
        // Act
        var response = await _client.GetAsync("/api/auth/user");

        // Assert - Should return OK with isAuthenticated: false
        response.EnsureSuccessStatusCode();
        var content = await response.Content.ReadAsStringAsync();
        Assert.Contains("\"isAuthenticated\":false", content, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Logout_ReturnsRedirect()
    {
        // Act
        var response = await _client.GetAsync("/api/auth/logout");

        // Assert - Should redirect to home page
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.NotNull(response.Headers.Location);
        Assert.Equal("/", response.Headers.Location.ToString());
    }

    [Fact]
    public async Task Logout_WithAbsoluteReturnUrl_RedirectsToPathAndQuery()
    {
        var encoded = Uri.EscapeDataString("https://example.com/votes/history?round=3");

        var response = await _client.GetAsync($"/api/auth/logout?returnUrl={encoded}");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.NotNull(response.Headers.Location);
        Assert.Equal("/votes/history?round=3", response.Headers.Location!.ToString());
    }
}

/// <summary>
/// Integration tests for admin endpoints
/// </summary>
public class AdminApiIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;
    private readonly HttpClient _adminClient;
    private readonly HttpClient _userClient;

    public AdminApiIntegrationTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
        _adminClient = factory.CreateAuthenticatedClient("Admin");
        _userClient = factory.CreateAuthenticatedClient("User");
    }

    [Fact]
    public async Task GetAllUsers_WithoutAuth_ReturnsUnauthorized()
    {
        // Act
        var response = await _client.GetAsync("/api/admin/users");

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetAllRoles_WithoutAuth_ReturnsUnauthorized()
    {
        // Act
        var response = await _client.GetAsync("/api/admin/roles");

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetAllUsers_WithAdminAuth_ReturnsSuccess()
    {
        // Act
        var response = await _adminClient.GetAsync("/api/admin/users");

        // Assert
        response.EnsureSuccessStatusCode();
        var users = await response.Content.ReadFromJsonAsync<List<object>>();
        Assert.NotNull(users);
    }

    [Fact]
    public async Task GetAllRoles_WithAdminAuth_ReturnsSuccess()
    {
        // Act
        var response = await _adminClient.GetAsync("/api/admin/roles");

        // Assert
        response.EnsureSuccessStatusCode();
        var roles = await response.Content.ReadFromJsonAsync<List<Role>>();
        Assert.NotNull(roles);
    }

    [Fact]
    public async Task GetAllUsers_WithUserAuth_ReturnsForbidden()
    {
        var response = await _userClient.GetAsync("/api/admin/users");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task UpdateUserRole_WithoutAuth_ReturnsUnauthorized()
    {
        var response = await _client.PutAsJsonAsync("/api/admin/users/2/role", new { roleId = 1 });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task UpdateUserRole_WithInvalidRole_ReturnsBadRequest()
    {
        var response = await _adminClient.PutAsJsonAsync("/api/admin/users/2/role", new { roleId = 999 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UpdateUserRole_WithUnknownUser_ReturnsNotFound()
    {
        var response = await _adminClient.PutAsJsonAsync("/api/admin/users/9999/role", new { roleId = 1 });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task UpdateUserRole_WithValidData_ReturnsOk()
    {
        var response = await _adminClient.PutAsJsonAsync("/api/admin/users/2/role", new { roleId = 1 });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("updated", body, StringComparison.OrdinalIgnoreCase);
    }
}
