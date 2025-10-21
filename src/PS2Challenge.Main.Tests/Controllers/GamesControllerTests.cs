using Microsoft.AspNetCore.Mvc;
using Moq;
using PS2Challenge.Api.Api.Controllers;
using PS2Challenge.Api.Api.Models;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Services;
using System.Security.Claims;

namespace PS2Challenge.Main.Tests.Controllers;

public class GamesControllerTests
{
    private readonly Mock<GameService> _mockGameService;
    private readonly Mock<ILogger<GamesController>> _mockLogger;
    private readonly GamesController _controller;

    public GamesControllerTests()
    {
        _mockGameService = new Mock<GameService>(Mock.Of<IServiceScopeFactory>());
        _mockLogger = new Mock<ILogger<GamesController>>();
        _controller = new GamesController(_mockGameService.Object, _mockLogger.Object);
    }

    // ============================================================================
    // GET GAMES TESTS
    // ============================================================================

    [Fact]
    public async Task GetGames_ReturnsAllGames_WhenNoTitleProvided()
    {
        // Arrange
        var games = new List<GameDto>
        {
            new() { Id = 1, Title = "Game 1" },
            new() { Id = 2, Title = "Game 2" }
        };
        _mockGameService.Setup(s => s.GetAllGamesAsync()).ReturnsAsync(games);

        // Act
        var result = await _controller.GetGames(null);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var returnedGames = Assert.IsAssignableFrom<IEnumerable<GameDto>>(okResult.Value);
        Assert.Equal(2, returnedGames.Count());
    }

    [Fact]
    public async Task GetGames_SearchesByTitle_WhenTitleProvided()
    {
        // Arrange
        var searchResults = new List<GameDto>
        {
            new() { Id = 1, Title = "Grand Theft Auto" }
        };
        _mockGameService.Setup(s => s.SearchGamesByTitleAsync("Grand")).ReturnsAsync(searchResults);

        // Act
        var result = await _controller.GetGames("Grand");

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var returnedGames = Assert.IsAssignableFrom<IEnumerable<GameDto>>(okResult.Value);
        Assert.Single(returnedGames);
    }

    [Fact]
    public async Task GetGameById_ReturnsGame_WhenGameExists()
    {
        // Arrange
        var game = new GameDto { Id = 1, Title = "Test Game" };
        _mockGameService.Setup(s => s.GetGameByIdAsync(1)).ReturnsAsync(game);

        // Act
        var result = await _controller.GetGameById(1);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var returnedGame = Assert.IsType<GameDto>(okResult.Value);
        Assert.Equal("Test Game", returnedGame.Title);
    }

    [Fact]
    public async Task GetGameById_ReturnsNotFound_WhenGameDoesNotExist()
    {
        // Arrange
        _mockGameService.Setup(s => s.GetGameByIdAsync(999)).ReturnsAsync((GameDto?)null);

        // Act
        var result = await _controller.GetGameById(999);

        // Assert
        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task GetGameById_ReturnsInternalServerError_WhenExceptionThrown()
    {
        // Arrange
        _mockGameService.Setup(s => s.GetGameByIdAsync(1))
            .ThrowsAsync(new Exception("Database error"));

        // Act
        var result = await _controller.GetGameById(1);

        // Assert
        var statusResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, statusResult.StatusCode);
    }

    [Fact]
    public async Task GetOwnershipTypes_ReturnsOwnershipTypes()
    {
        // Arrange
        var ownershipTypes = new List<OwnershipType>
        {
            new() { TypeOwned = "PAL" },
            new() { TypeOwned = "NTSC" },
            new() { TypeOwned = "Digital" }
        };
        _mockGameService.Setup(s => s.GetAllOwnershipTypesAsync()).ReturnsAsync(ownershipTypes);

        // Act
        var result = await _controller.GetOwnershipTypes();

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var types = Assert.IsAssignableFrom<IEnumerable<OwnershipType>>(okResult.Value);
        Assert.Equal(3, types.Count());
    }

    [Fact]
    public async Task GetOwnershipTypes_ReturnsInternalServerError_WhenExceptionThrown()
    {
        // Arrange
        _mockGameService.Setup(s => s.GetAllOwnershipTypesAsync())
            .ThrowsAsync(new Exception("Database error"));

        // Act
        var result = await _controller.GetOwnershipTypes();

        // Assert
        var statusResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, statusResult.StatusCode);
    }

    [Fact]
    public async Task GetAllProgress_ReturnsGamesWithProgress()
    {
        // Arrange
        var gamesWithProgress = new List<GameProgressDto>
        {
            new() { ProgressId = 1, GameTitle = "Game 1", Platform = "PS2" },
            new() { ProgressId = 2, GameTitle = "Game 2", Platform = "PS2" }
        };
        _mockGameService.Setup(s => s.GetAllProgressAsync()).ReturnsAsync(gamesWithProgress);

        // Act
        var result = await _controller.GetAllProgress();

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var progress = Assert.IsAssignableFrom<IEnumerable<GameProgressDto>>(okResult.Value);
        Assert.Equal(2, progress.Count());
    }

    // ============================================================================
    // CREATE GAME TESTS
    // ============================================================================

    [Fact]
    public async Task CreateGame_ReturnsBadRequest_WhenGameDtoIsNull()
    {
        // Arrange
        SetupAdminUser();

        // Act
        var result = await _controller.CreateGame(null!);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task CreateGame_ReturnsBadRequest_WhenTitleIsEmpty()
    {
        // Arrange
        SetupAdminUser();
        var gameDto = new GameDto { Title = "" };

        // Act
        var result = await _controller.CreateGame(gameDto);

        // Assert
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result.Result);
        var errors = badRequestResult.Value as dynamic;
        Assert.NotNull(errors);
    }

    [Fact]
    public async Task CreateGame_ReturnsBadRequest_WhenTitleTooLong()
    {
        // Arrange
        SetupAdminUser();
        var gameDto = new GameDto
        {
            Title = new string('a', 151), // 151 characters
            Developer = "Test",
            Publisher = "Test",
            RegionFirstReleasedIn = "NA"
        };

        // Act
        var result = await _controller.CreateGame(gameDto);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task CreateGame_ReturnsBadRequest_WhenDeveloperTooLong()
    {
        // Arrange
        SetupAdminUser();
        var gameDto = new GameDto
        {
            Title = "Test Game",
            Developer = new string('a', 101), // 101 characters
            Publisher = "Test",
            RegionFirstReleasedIn = "NA"
        };

        // Act
        var result = await _controller.CreateGame(gameDto);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task CreateGame_ReturnsBadRequest_WhenPublisherTooLong()
    {
        // Arrange
        SetupAdminUser();
        var gameDto = new GameDto
        {
            Title = "Test Game",
            Developer = "Test",
            Publisher = new string('a', 101), // 101 characters
            RegionFirstReleasedIn = "NA"
        };

        // Act
        var result = await _controller.CreateGame(gameDto);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task CreateGame_ReturnsBadRequest_WhenRegionTooLong()
    {
        // Arrange
        SetupAdminUser();
        var gameDto = new GameDto
        {
            Title = "Test Game",
            Developer = "Test",
            Publisher = "Test",
            RegionFirstReleasedIn = new string('a', 101) // 101 characters
        };

        // Act
        var result = await _controller.CreateGame(gameDto);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task CreateGame_ReturnsBadRequest_WhenRequiredFieldsMissing()
    {
        // Arrange
        SetupAdminUser();
        var gameDto = new GameDto
        {
            Title = "Test Game",
            Developer = "",
            Publisher = "Test",
            RegionFirstReleasedIn = "NA"
        };

        // Act
        var result = await _controller.CreateGame(gameDto);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task CreateGame_ReturnsCreatedAtAction_WhenValidGame()
    {
        // Arrange
        SetupAdminUser();
        var gameDto = new GameDto
        {
            Title = "New Game",
            Developer = "Developer",
            Publisher = "Publisher",
            RegionFirstReleasedIn = "NA"
        };

        var createdGame = new GameDto
        {
            Id = 1,
            Title = "New Game",
            Developer = "Developer",
            Publisher = "Publisher",
            RegionFirstReleasedIn = "NA"
        };

        _mockGameService.Setup(s => s.AddGameAsync(It.IsAny<GameDto>())).ReturnsAsync(createdGame);

        // Act
        var result = await _controller.CreateGame(gameDto);

        // Assert
        var createdResult = Assert.IsType<CreatedAtActionResult>(result.Result);
        var returnedGame = Assert.IsType<GameDto>(createdResult.Value);
        Assert.Equal(1, returnedGame.Id);
        Assert.Equal("New Game", returnedGame.Title);
    }

    [Fact]
    public async Task CreateGame_ReturnsConflict_WhenDuplicateTitle()
    {
        // Arrange
        SetupAdminUser();
        var gameDto = new GameDto
        {
            Title = "Duplicate Game",
            Developer = "Developer",
            Publisher = "Publisher",
            RegionFirstReleasedIn = "NA"
        };

        _mockGameService
            .Setup(s => s.AddGameAsync(It.IsAny<GameDto>()))
            .ThrowsAsync(new InvalidOperationException("Game already exists"));

        // Act
        var result = await _controller.CreateGame(gameDto);

        // Assert
        Assert.IsType<ConflictObjectResult>(result.Result);
    }

    // ============================================================================
    // UPDATE GAME TESTS
    // ============================================================================

    [Fact]
    public async Task UpdateGame_ReturnsOk_WhenValidDataProvided()
    {
        // Arrange
        SetupAdminUser();
        var gameDto = new GameDto
        {
            Id = 1,
            Title = "Updated Game",
            Developer = "Dev",
            Publisher = "Pub",
            RegionFirstReleasedIn = "NA"
        };

        _mockGameService.Setup(s => s.UpdateGameAsync(1, It.IsAny<GameDto>()))
            .ReturnsAsync(gameDto);

        // Act
        var result = await _controller.UpdateGame(1, gameDto);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var returnedGame = Assert.IsType<GameDto>(okResult.Value);
        Assert.Equal("Updated Game", returnedGame.Title);
    }

    [Fact]
    public async Task UpdateGame_ReturnsBadRequest_WhenGameDtoIsNull()
    {
        // Arrange
        SetupAdminUser();

        // Act
        var result = await _controller.UpdateGame(1, null!);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UpdateGame_ReturnsBadRequest_WhenValidationFails()
    {
        // Arrange
        SetupAdminUser();
        var gameDto = new GameDto
        {
            Id = 1,
            Title = "",
            Developer = "Dev",
            Publisher = "Pub",
            RegionFirstReleasedIn = "NA"
        };

        // Act
        var result = await _controller.UpdateGame(1, gameDto);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UpdateGame_ReturnsConflict_WhenTitleAlreadyExists()
    {
        // Arrange
        SetupAdminUser();
        var gameDto = new GameDto
        {
            Id = 1,
            Title = "Duplicate Title",
            Developer = "Dev",
            Publisher = "Pub",
            RegionFirstReleasedIn = "NA"
        };

        _mockGameService.Setup(s => s.UpdateGameAsync(1, It.IsAny<GameDto>()))
            .ThrowsAsync(new InvalidOperationException("Title already exists"));

        // Act
        var result = await _controller.UpdateGame(1, gameDto);

        // Assert
        Assert.IsType<ConflictObjectResult>(result);
    }

    [Fact]
    public async Task UpdateGame_ReturnsInternalServerError_WhenUnexpectedExceptionThrown()
    {
        // Arrange
        SetupAdminUser();
        var gameDto = new GameDto
        {
            Id = 1,
            Title = "Test Game",
            Developer = "Dev",
            Publisher = "Pub",
            RegionFirstReleasedIn = "NA"
        };

        _mockGameService.Setup(s => s.UpdateGameAsync(1, It.IsAny<GameDto>()))
            .ThrowsAsync(new Exception("Unexpected error"));

        // Act
        var result = await _controller.UpdateGame(1, gameDto);

        // Assert
        var statusResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, statusResult.StatusCode);
    }

    // ============================================================================
    // DELETE GAME TESTS
    // ============================================================================

    [Fact]
    public async Task DeleteGame_ReturnsOk_WhenGameExists()
    {
        // Arrange
        SetupAdminUser();
        var game = new GameDto { Id = 1, Title = "Game to Delete" };
        _mockGameService.Setup(s => s.GetGameByIdAsync(1)).ReturnsAsync(game);
        _mockGameService.Setup(s => s.DeleteGameAsync(1)).ReturnsAsync(true);

        // Act
        var result = await _controller.DeleteGame(1);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task DeleteGame_ReturnsNotFound_WhenGameDoesNotExist()
    {
        // Arrange
        SetupAdminUser();
        _mockGameService.Setup(s => s.GetGameByIdAsync(999)).ReturnsAsync((GameDto?)null);

        // Act
        var result = await _controller.DeleteGame(999);

        // Assert
        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task DeleteGame_ReturnsInternalServerError_WhenDeleteFails()
    {
        // Arrange
        SetupAdminUser();
        var game = new GameDto { Id = 1, Title = "Test Game" };
        _mockGameService.Setup(s => s.GetGameByIdAsync(1)).ReturnsAsync(game);
        _mockGameService.Setup(s => s.DeleteGameAsync(1)).ReturnsAsync(false);

        // Act
        var result = await _controller.DeleteGame(1);

        // Assert
        var statusResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, statusResult.StatusCode);
    }

    [Fact]
    public async Task DeleteGame_ReturnsInternalServerError_WhenExceptionThrown()
    {
        // Arrange
        SetupAdminUser();
        _mockGameService.Setup(s => s.GetGameByIdAsync(1))
            .ThrowsAsync(new Exception("Database error"));

        // Act
        var result = await _controller.DeleteGame(1);

        // Assert
        var statusResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, statusResult.StatusCode);
    }

    // ============================================================================
    // EXCLUSION TESTS
    // ============================================================================

    [Fact]
    public async Task ExcludeGame_ReturnsOk_WhenValidDataProvided()
    {
        // Arrange
        SetupAdminUser();
        var request = new ExcludeGameRequest
        {
            Title = "Game to Exclude",
            Reason = "Test reason"
        };

        var excludedGame = new ExcludedGame
        {
            ExclusionId = 1,
            GameId = 1,
            Reason = "Test reason"
        };

        _mockGameService.Setup(s => s.AddExcludedGameAsync(request.Title, request.Reason))
            .ReturnsAsync(excludedGame);

        // Act
        var result = await _controller.ExcludeGame(request);

        // Assert
        Assert.IsType<OkObjectResult>(result.Result);
    }

    [Fact]
    public async Task ExcludeGame_ReturnsBadRequest_WhenReasonMissing()
    {
        // Arrange
        SetupAdminUser();
        var request = new ExcludeGameRequest
        {
            Title = "Game",
            Reason = ""
        };

        // Act
        var result = await _controller.ExcludeGame(request);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task ExcludeGame_ReturnsBadRequest_WhenRequestIsNull()
    {
        // Arrange
        SetupAdminUser();

        // Act
        var result = await _controller.ExcludeGame(null!);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task ExcludeGame_ReturnsBadRequest_WhenTitleMissing()
    {
        // Arrange
        SetupAdminUser();
        var request = new ExcludeGameRequest
        {
            Title = "",
            Reason = "Test reason"
        };

        // Act
        var result = await _controller.ExcludeGame(request);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task ExcludeGame_ReturnsConflict_WhenGameNotFound()
    {
        // Arrange
        SetupAdminUser();
        var request = new ExcludeGameRequest
        {
            Title = "Non-existent Game",
            Reason = "Test reason"
        };

        _mockGameService.Setup(s => s.AddExcludedGameAsync(request.Title, request.Reason))
            .ThrowsAsync(new InvalidOperationException("Game not found"));

        // Act
        var result = await _controller.ExcludeGame(request);

        // Assert
        Assert.IsType<ConflictObjectResult>(result.Result);
    }

    [Fact]
    public async Task UpdateExclusion_ReturnsOk_WhenValidDataProvided()
    {
        // Arrange
        SetupAdminUser();
        var game = new GameDto { Id = 1, Title = "Test Game" };
        _mockGameService.Setup(s => s.GetGameByIdAsync(1)).ReturnsAsync(game);
        _mockGameService.Setup(s => s.UpdateExclusionAsync(1, true, "Test reason"))
            .Returns(Task.CompletedTask);

        var request = new GamesController.UpdateExclusionRequest
        {
            IsExcluded = true,
            Reason = "Test reason"
        };

        // Act
        var result = await _controller.UpdateExclusion(1, request);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task UpdateExclusion_ReturnsBadRequest_WhenRequestIsNull()
    {
        // Arrange
        SetupAdminUser();

        // Act
        var result = await _controller.UpdateExclusion(1, null!);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UpdateExclusion_ReturnsNotFound_WhenGameDoesNotExist()
    {
        // Arrange
        SetupAdminUser();
        _mockGameService.Setup(s => s.GetGameByIdAsync(999)).ReturnsAsync((GameDto?)null);

        var request = new GamesController.UpdateExclusionRequest
        {
            IsExcluded = true,
            Reason = "Test reason"
        };

        // Act
        var result = await _controller.UpdateExclusion(999, request);

        // Assert
        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task UpdateExclusion_ReturnsInternalServerError_WhenExceptionThrown()
    {
        // Arrange
        SetupAdminUser();
        _mockGameService.Setup(s => s.GetGameByIdAsync(1))
            .ThrowsAsync(new Exception("Database error"));

        var request = new GamesController.UpdateExclusionRequest
        {
            IsExcluded = true,
            Reason = "Test reason"
        };

        // Act
        var result = await _controller.UpdateExclusion(1, request);

        // Assert
        var statusResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, statusResult.StatusCode);
    }

    // ============================================================================
    // OWNERSHIP TESTS
    // ============================================================================

    [Fact]
    public async Task AddGameOwned_ReturnsOk_WhenValidDataProvided()
    {
        // Arrange
        SetupAdminUser();
        var request = new AddGameOwnedRequest
        {
            Title = "Test Game",
            OwnPhysicalCopy = true,
            TypeOwned = "PAL"
        };

        var gameOwned = new GameOwned
        {
            OwnershipId = 1,
            GameId = 1,
            OwnPhysicalCopy = true,
            TypeOwned = "PAL"
        };

        _mockGameService.Setup(s => s.AddGameOwnedAsync(request.Title, request.OwnPhysicalCopy, request.TypeOwned))
            .ReturnsAsync(gameOwned);

        // Act
        var result = await _controller.AddGameOwned(request);

        // Assert
        Assert.IsType<OkObjectResult>(result.Result);
    }

    [Fact]
    public async Task UpdateOwnership_ReturnsOk_WhenValidDataProvided()
    {
        // Arrange
        SetupAdminUser();
        var game = new GameDto { Id = 1, Title = "Test Game" };
        _mockGameService.Setup(s => s.GetGameByIdAsync(1)).ReturnsAsync(game);
        _mockGameService.Setup(s => s.UpdateOwnershipAsync(1, false, "PAL"))
            .Returns(Task.CompletedTask);

        var request = new GamesController.UpdateOwnershipRequest
        {
            OwnPhysicalCopy = false,
            TypeOwned = "PAL"
        };

        // Act
        var result = await _controller.UpdateOwnership(1, request);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task AddGameOwned_ReturnsBadRequest_WhenRequestIsNull()
    {
        // Arrange
        SetupAdminUser();

        // Act
        var result = await _controller.AddGameOwned(null!);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task AddGameOwned_ReturnsBadRequest_WhenTitleMissing()
    {
        // Arrange
        SetupAdminUser();
        var request = new AddGameOwnedRequest
        {
            Title = "",
            OwnPhysicalCopy = true,
            TypeOwned = "PAL"
        };

        // Act
        var result = await _controller.AddGameOwned(request);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task AddGameOwned_ReturnsConflict_WhenGameNotFound()
    {
        // Arrange
        SetupAdminUser();
        var request = new AddGameOwnedRequest
        {
            Title = "Non-existent Game",
            OwnPhysicalCopy = true,
            TypeOwned = "PAL"
        };

        _mockGameService.Setup(s => s.AddGameOwnedAsync(request.Title, request.OwnPhysicalCopy, request.TypeOwned))
            .ThrowsAsync(new InvalidOperationException("Game not found"));

        // Act
        var result = await _controller.AddGameOwned(request);

        // Assert
        Assert.IsType<ConflictObjectResult>(result.Result);
    }

    [Fact]
    public async Task UpdateOwnership_ReturnsBadRequest_WhenRequestIsNull()
    {
        // Arrange
        SetupAdminUser();

        // Act
        var result = await _controller.UpdateOwnership(1, null!);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UpdateOwnership_ReturnsInternalServerError_WhenExceptionThrown()
    {
        // Arrange
        SetupAdminUser();
        _mockGameService.Setup(s => s.GetGameByIdAsync(1))
            .ThrowsAsync(new Exception("Database error"));

        var request = new GamesController.UpdateOwnershipRequest
        {
            OwnPhysicalCopy = false,
            TypeOwned = "PAL"
        };

        // Act
        var result = await _controller.UpdateOwnership(1, request);

        // Assert
        var statusResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, statusResult.StatusCode);
    }

    // ============================================================================
    // PROGRESS TESTS
    // ============================================================================

    [Fact]
    public async Task UpdateProgress_ReturnsOk_WhenValidDataProvided()
    {
        // Arrange
        SetupAdminUser();
        var request = new UpdateProgressRequest
        {
            Title = "Test Game",
            DateStarted = new DateOnly(2024, 1, 1),
            Platform = "PS2"
        };

        var progress = new GameProgress
        {
            ProgressId = 1,
            GameId = 1,
            DateStarted = new DateOnly(2024, 1, 1),
            Platform = "PS2"
        };

        _mockGameService.Setup(s => s.UpsertProgressAsync(
            request.Title,
            request.DateStarted,
            request.DateFinished,
            request.CompletionTime,
            request.BeatenCriteria,
            request.Review,
            request.Platform))
            .ReturnsAsync(progress);

        // Act
        var result = await _controller.UpdateProgress(request);

        // Assert
        Assert.IsType<OkObjectResult>(result.Result);
    }

    [Fact]
    public async Task UpdateProgress_ReturnsBadRequest_WhenRequestIsNull()
    {
        // Arrange
        SetupAdminUser();

        // Act
        var result = await _controller.UpdateProgress(null!);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task UpdateProgress_ReturnsBadRequest_WhenPlatformMissing()
    {
        // Arrange
        SetupAdminUser();
        var request = new UpdateProgressRequest
        {
            Title = "Test Game",
            Platform = ""
        };

        // Act
        var result = await _controller.UpdateProgress(request);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    private void SetupAdminUser()
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.Name, "TestAdmin"),
            new(ClaimTypes.Role, "Admin")
        };
        var identity = new ClaimsIdentity(claims, "TestAuthType");
        var claimsPrincipal = new ClaimsPrincipal(identity);
        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = claimsPrincipal }
        };
    }
}
