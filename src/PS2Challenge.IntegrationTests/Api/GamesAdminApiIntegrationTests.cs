using PS2Challenge.Backend.Models;
using PS2Challenge.IntegrationTests.Helpers;
using System.Net;

namespace PS2Challenge.IntegrationTests.Api;

/// <summary>
/// Integration tests for the Games Admin API endpoints (admin-only operations on /api/games)
/// </summary>
public class GamesAdminApiIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;
    private readonly HttpClient _adminClient;
    private readonly CustomWebApplicationFactory _factory;

    public GamesAdminApiIntegrationTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
        _adminClient = factory.CreateAuthenticatedClient("Admin");
    }

    [Fact]
    public async Task UpdateGame_WithoutAuth_ReturnsUnauthorized()
    {
        // Arrange
        var gameDto = new GameDto
        {
            Title = "Updated Game",
            Developer = "Dev",
            Publisher = "Pub",
            RegionFirstReleasedIn = "NA"
        };

        // Act
        var response = await _client.PutAsJsonAsync("/api/games/1", gameDto);

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task DeleteGame_WithoutAuth_ReturnsUnauthorized()
    {
        // Act
        var response = await _client.DeleteAsync("/api/games/1");

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task UpdateExclusion_WithoutAuth_ReturnsUnauthorized()
    {
        // Arrange
        var exclusionRequest = new
        {
            IsExcluded = true,
            Reason = "Test reason"
        };

        // Act
        var response = await _client.PutAsJsonAsync("/api/games/1/exclusion", exclusionRequest);

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task UpdateOwnership_WithoutAuth_ReturnsUnauthorized()
    {
        // Arrange
        var ownershipRequest = new
        {
            OwnPhysicalCopy = false,
            TypeOwned = "PAL"
        };

        // Act
        var response = await _client.PutAsJsonAsync("/api/games/1/ownership", ownershipRequest);

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CreateGame_WithAdminAuth_AndValidData_ReturnsCreated()
    {
        // Arrange
        var newGame = new GameDto
        {
            Title = $"Admin Test Game {Guid.NewGuid()}",
            Developer = "Test Developer",
            Publisher = "Test Publisher",
            RegionFirstReleasedIn = "NA",
            ReleasedInEuPalOrNa = true
        };

        // Act
        var response = await _adminClient.PostAsJsonAsync("/api/games", newGame);

        // Assert
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var createdGame = await response.Content.ReadFromJsonAsync<GameDto>();
        Assert.NotNull(createdGame);
        Assert.True(createdGame.Id > 0);
        Assert.Equal(newGame.Title, createdGame.Title);
    }

    [Fact]
    public async Task UpdateGame_WithAdminAuth_AndValidData_ReturnsOk()
    {
        // Arrange - First create a game
        var uniqueTitle = $"Game to Update {Guid.NewGuid()}";
        var newGame = new GameDto
        {
            Title = uniqueTitle,
            Developer = "Original Dev",
            Publisher = "Original Pub",
            RegionFirstReleasedIn = "NA"
        };

        var createResponse = await _adminClient.PostAsJsonAsync("/api/games", newGame);
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        var createdGame = await createResponse.Content.ReadFromJsonAsync<GameDto>();
        Assert.NotNull(createdGame);

        // Update the game - change only Developer and Publisher to avoid title conflict
        var updateDto = new GameDto
        {
            Id = createdGame.Id,
            Title = uniqueTitle, // Keep same title
            Developer = "Updated Developer",
            Publisher = "Updated Publisher",
            RegionFirstReleasedIn = "NA"
        };

        // Act
        var response = await _adminClient.PutAsJsonAsync($"/api/games/{createdGame.Id}", updateDto);

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updatedGame = await response.Content.ReadFromJsonAsync<GameDto>();
        Assert.NotNull(updatedGame);
        Assert.Equal("Updated Developer", updatedGame.Developer);
        Assert.Equal("Updated Publisher", updatedGame.Publisher);
    }

    [Fact]
    public async Task DeleteGame_WithAdminAuth_AndExistingGame_ReturnsOk()
    {
        // Arrange - First create a game
        var newGame = new GameDto
        {
            Title = $"Game to Delete {Guid.NewGuid()}",
            Developer = "Test Dev",
            Publisher = "Test Pub",
            RegionFirstReleasedIn = "NA"
        };

        var createResponse = await _adminClient.PostAsJsonAsync("/api/games", newGame);
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        var createdGame = await createResponse.Content.ReadFromJsonAsync<GameDto>();
        Assert.NotNull(createdGame);

        // Act
        var response = await _adminClient.DeleteAsync($"/api/games/{createdGame.Id}");

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task UpdateExclusion_WithAdminAuth_AndValidData_ReturnsOk()
    {
        // Arrange - First create a game
        var newGame = new GameDto
        {
            Title = $"Game to Exclude {Guid.NewGuid()}",
            Developer = "Test Dev",
            Publisher = "Test Pub",
            RegionFirstReleasedIn = "NA"
        };

        var createResponse = await _adminClient.PostAsJsonAsync("/api/games", newGame);
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        var createdGame = await createResponse.Content.ReadFromJsonAsync<GameDto>();
        Assert.NotNull(createdGame);

        var exclusionRequest = new
        {
            IsExcluded = true,
            Reason = "Test exclusion reason"
        };

        // Act
        var response = await _adminClient.PutAsJsonAsync($"/api/games/{createdGame.Id}/exclusion", exclusionRequest);

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task UpdateOwnership_WithAdminAuth_AndValidData_ReturnsOk()
    {
        // Arrange - First create a game
        var newGame = new GameDto
        {
            Title = $"Game to Own {Guid.NewGuid()}",
            Developer = "Test Dev",
            Publisher = "Test Pub",
            RegionFirstReleasedIn = "NA"
        };

        var createResponse = await _adminClient.PostAsJsonAsync("/api/games", newGame);
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        var createdGame = await createResponse.Content.ReadFromJsonAsync<GameDto>();
        Assert.NotNull(createdGame);

        var ownershipRequest = new
        {
            OwnPhysicalCopy = true,
            TypeOwned = "PAL"
        };

        // Act
        var response = await _adminClient.PutAsJsonAsync($"/api/games/{createdGame.Id}/ownership", ownershipRequest);

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task UpdateGame_WithAdminAuth_AndInvalidData_ReturnsBadRequest()
    {
        // Arrange
        var invalidGame = new GameDto
        {
            Title = "", // Invalid - empty title
            Developer = "Test Dev",
            Publisher = "Test Pub",
            RegionFirstReleasedIn = "NA"
        };

        // Act
        var response = await _adminClient.PutAsJsonAsync("/api/games/1", invalidGame);

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UpdateExclusion_WithAdminAuth_AndMissingReason_ReturnsBadRequest()
    {
        // Arrange - First create a game
        var newGame = new GameDto
        {
            Title = $"Test Game {Guid.NewGuid()}",
            Developer = "Test Dev",
            Publisher = "Test Pub",
            RegionFirstReleasedIn = "NA"
        };

        var createResponse = await _adminClient.PostAsJsonAsync("/api/games", newGame);
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        var createdGame = await createResponse.Content.ReadFromJsonAsync<GameDto>();
        Assert.NotNull(createdGame);

        var exclusionRequest = new
        {
            IsExcluded = true,
            Reason = "" // Missing reason
        };

        // Act
        var response = await _adminClient.PutAsJsonAsync($"/api/games/{createdGame.Id}/exclusion", exclusionRequest);

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task DeleteGame_WithAdminAuth_AndNonExistentGame_ReturnsNotFound()
    {
        // Act
        var response = await _adminClient.DeleteAsync("/api/games/999999");

        // Assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
