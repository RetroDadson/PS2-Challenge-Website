using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Moq;
using PS2Challenge.Api.Api.Controllers;
using PS2Challenge.Api.Api.Models;
using PS2Challenge.Backend.Data;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Services;
using PS2Challenge.Main.Api.Hubs;
using System.Security.Claims;

namespace PS2Challenge.Main.Tests.Controllers;

public sealed class VotesControllerTests : IDisposable
{
    private readonly DbContextOptions<Ps2ChallengeDbContext> _options;
    private readonly Ps2ChallengeDbContext _context;
    private readonly VotesController _controller;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly Mock<IHubContext<VotesHub>> _mockHubContext;
    private readonly VoteService _voteService;

    public VotesControllerTests()
    {
        _options = new DbContextOptionsBuilder<Ps2ChallengeDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new Ps2ChallengeDbContext(_options);

        var services = new ServiceCollection();
        services.AddScoped(_ => new Ps2ChallengeDbContext(_options));
        var serviceProvider = services.BuildServiceProvider();
        _scopeFactory = new TestServiceScopeFactory(serviceProvider);

        // Create VoteService
        _voteService = new VoteService(_scopeFactory);

        // Mock IHubContext<VotesHub>
        _mockHubContext = new Mock<IHubContext<VotesHub>>();
        var mockClients = new Mock<IHubClients>();
        var mockClientProxy = new Mock<IClientProxy>();
        _mockHubContext.Setup(x => x.Clients).Returns(mockClients.Object);
        mockClients.Setup(x => x.All).Returns(mockClientProxy.Object);

        _controller = new VotesController(_scopeFactory, _mockHubContext.Object, _voteService);
        SetupAdminUser();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task GetHistory_ReturnsGroupedVoteHistory()
    {
        // Arrange
        var game1 = new GameDto { Id = 1, Title = "Game 1" };
        var game2 = new GameDto { Id = 2, Title = "Game 2" };
        _context.Games.AddRange(game1, game2);

        _context.VoteHistory.AddRange(
            new VoteHistory { GameId = 1, VoteRound = 1, VoteCount = 10, Notes = "Round 1 notes" },
            new VoteHistory { GameId = 2, VoteRound = 1, VoteCount = 5 },
            new VoteHistory { GameId = 1, VoteRound = 2, VoteCount = 15 }
        );
        await _context.SaveChangesAsync();

        // Act
        var result = await _controller.GetHistory();

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var rounds = Assert.IsType<List<VoteRoundDto>>(okResult.Value, exactMatch: false);
        Assert.Equal(2, rounds.Count);
        Assert.Equal("Round 1 notes", rounds[1].Notes);
    }

    [Fact]
    public async Task UploadHistory_ReturnsBadRequest_WhenNoRoundsProvided()
    {
        // Act
        var result = await _controller.UploadHistory(null);

        // Assert
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result);
        Assert.NotNull(badRequestResult.Value);
    }

    [Fact]
    public async Task UploadHistory_ReturnsBadRequest_WhenEmptyRoundsList()
    {
        // Act
        var result = await _controller.UploadHistory(new List<UploadRoundDto>());

        // Assert
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UploadHistory_ReturnsBadRequest_WhenGameTitleNotFound()
    {
        // Arrange
        var rounds = new List<UploadRoundDto>
        {
            new()
            {
                VoteRound = 1,
                Votes = new List<UploadGameVote>
                {
                    new() { GameTitle = "Non Existent Game", Count = 10 },
                    new() { GameTitle = "Another Missing Game", Count = 5 },
                    new() { GameTitle = "Third Missing Game", Count = 3 }
                }
            }
        };

        // Act
        var result = await _controller.UploadHistory(rounds);

        // Assert
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result);
        var response = badRequestResult.Value as dynamic;
        Assert.NotNull(response);
    }

    [Fact]
    public async Task UploadHistory_ReturnsBadRequest_WhenRoundDoesNotHaveExactly3Votes()
    {
        // Arrange
        var game1 = new GameDto { Id = 1, Title = "Game 1" };
        _context.Games.Add(game1);
        await _context.SaveChangesAsync();

        var rounds = new List<UploadRoundDto>
        {
            new()
            {
                VoteRound = 1,
                Votes = new List<UploadGameVote>
                {
                    new() { GameTitle = "Game 1", Count = 10 }
                }
            }
        };

        // Act
        var result = await _controller.UploadHistory(rounds);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UploadHistory_InsertsNewVoteHistory()
    {
        // Arrange
        var game1 = new GameDto { Id = 1, Title = "Game 1" };
        var game2 = new GameDto { Id = 2, Title = "Game 2" };
        var game3 = new GameDto { Id = 3, Title = "Game 3" };
        _context.Games.AddRange(game1, game2, game3);
        await _context.SaveChangesAsync();

        var rounds = new List<UploadRoundDto>
        {
            new()
            {
                VoteRound = 1,
                Notes = "Test notes",
                Votes = new List<UploadGameVote>
                {
                    new() { GameTitle = "Game 1", Count = 10 },
                    new() { GameTitle = "Game 2", Count = 5 },
                    new() { GameTitle = "Game 3", Count = 2 }
                }
            }
        };

        // Act
        var result = await _controller.UploadHistory(rounds);

        // Assert
        Assert.IsType<OkObjectResult>(result);
        var insertedVotes = await _context.VoteHistory.CountAsync();
        Assert.Equal(3, insertedVotes);
    }

    [Fact]
    public async Task UploadHistory_UpdatesExistingVoteHistory()
    {
        // Arrange
        var game1 = new GameDto { Id = 1, Title = "Game 1" };
        var game2 = new GameDto { Id = 2, Title = "Game 2" };
        var game3 = new GameDto { Id = 3, Title = "Game 3" };
        _context.Games.AddRange(game1, game2, game3);
        _context.VoteHistory.Add(new VoteHistory { GameId = 1, VoteRound = 1, VoteCount = 5, Position = 1 });
        await _context.SaveChangesAsync();

        var rounds = new List<UploadRoundDto>
        {
            new()
            {
                VoteRound = 1,
                Votes = new List<UploadGameVote>
                {
                    new() { GameTitle = "Game 1", Count = 15 },
                    new() { GameTitle = "Game 2", Count = 8 },
                    new() { GameTitle = "Game 3", Count = 4 }
                }
            }
        };

        // Act
        var result = await _controller.UploadHistory(rounds);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(okResult.Value);

        await using var verificationContext = new Ps2ChallengeDbContext(_options);
        var updatedEntry = await verificationContext.VoteHistory.FirstAsync(v => v.GameId == 1 && v.VoteRound == 1);
        Assert.Equal(15, updatedEntry.VoteCount);

        var totalEntries = await verificationContext.VoteHistory.CountAsync(v => v.VoteRound == 1);
        Assert.Equal(3, totalEntries);
    }

    [Fact]
    public async Task GetCurrentVotes_ReturnsEmptyArray_WhenNoVotes()
    {
        // Act
        var result = await _controller.GetCurrentVotes();

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var votes = Assert.IsType<IEnumerable<CurrentVoteDto>>(okResult.Value, exactMatch: false);
        Assert.Empty(votes);
    }

    [Fact]
    public async Task GetCurrentVotes_ReturnsCurrentVotesWithTitles()
    {
        // Arrange
        var game1 = new GameDto { Id = 1, Title = "Game 1" };
        var game2 = new GameDto { Id = 2, Title = "Game 2" };
        _context.Games.AddRange(game1, game2);

        _context.CurrentVotes.AddRange(
            new CurrentVote { GameId = 1, VoteCount = 10, GameNumber = 1 },
            new CurrentVote { GameId = 2, VoteCount = 5, GameNumber = 2 }
        );
        await _context.SaveChangesAsync();

        // Act
        var result = await _controller.GetCurrentVotes();

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var votes = Assert.IsType<List<CurrentVoteDto>>(okResult.Value, exactMatch: false);
        Assert.Equal(2, votes.Count);
    }

    [Fact]
    public async Task SetCurrentVotes_ReturnsBadRequest_WhenNoVotesProvided()
    {
        // Act
        var result = await _controller.SetCurrentVotes(null);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task SetCurrentVotes_ReturnsBadRequest_WhenGameNotFound()
    {
        // Arrange
        var votes = new List<CurrentVoteDto>
        {
            new() { GameTitle = "Non Existent Game", VoteCount = 10, GameNumber = 1 }
        };

        // Act
        var result = await _controller.SetCurrentVotes(votes);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task SetCurrentVotes_InsertsNewCurrentVotes()
    {
        // Arrange
        var game1 = new GameDto { Id = 1, Title = "Game 1" };
        _context.Games.Add(game1);
        await _context.SaveChangesAsync();

        var votes = new List<CurrentVoteDto>
        {
            new() { GameTitle = "Game 1", VoteCount = 10, GameNumber = 1 }
        };

        // Act
        var result = await _controller.SetCurrentVotes(votes);

        // Assert
        Assert.IsType<OkObjectResult>(result);
        var currentVotes = await _context.CurrentVotes.CountAsync();
        Assert.Equal(1, currentVotes);
    }

    [Fact]
    public async Task SetCurrentVotes_UpdatesExistingCurrentVotes()
    {
        // Arrange
        var game1 = new GameDto { Id = 1, Title = "Game 1" };
        _context.Games.Add(game1);
        _context.CurrentVotes.Add(new CurrentVote { GameId = 1, VoteCount = 5, GameNumber = 1 });
        await _context.SaveChangesAsync();

        var votes = new List<CurrentVoteDto>
        {
            new() { GameTitle = "Game 1", VoteCount = 15, GameNumber = 2 }
        };

        // Act
        await _controller.SetCurrentVotes(votes);

        // Assert
        // Clear the change tracker to force a fresh query from the database
        _context.ChangeTracker.Clear();

        var updatedVote = await _context.CurrentVotes.FirstAsync();
        Assert.Equal(15, updatedVote.VoteCount);
        Assert.Equal(2, updatedVote.GameNumber);
    }

    [Fact]
    public async Task RemoveCurrentVote_ReturnsBadRequest_WhenGameTitleEmpty()
    {
        // Act
        var result = await _controller.RemoveCurrentVote("");

        // Assert
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task RemoveCurrentVote_ReturnsNotFound_WhenGameNotFound()
    {
        // Act
        var result = await _controller.RemoveCurrentVote("Non Existent Game");

        // Assert
        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task RemoveCurrentVote_ReturnsNotFound_WhenNoCurrentVote()
    {
        // Arrange
        var game1 = new GameDto { Id = 1, Title = "Game 1" };
        _context.Games.Add(game1);
        await _context.SaveChangesAsync();

        // Act
        var result = await _controller.RemoveCurrentVote("Game 1");

        // Assert
        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task RemoveCurrentVote_RemovesCurrentVoteSuccessfully()
    {
        // Arrange
        var game1 = new GameDto { Id = 1, Title = "Game 1" };
        _context.Games.Add(game1);
        _context.CurrentVotes.Add(new CurrentVote { GameId = 1, VoteCount = 10, GameNumber = 1 });
        await _context.SaveChangesAsync();

        // Act
        var result = await _controller.RemoveCurrentVote("Game 1");

        // Assert
        Assert.IsType<OkObjectResult>(result);
        var remainingVotes = await _context.CurrentVotes.CountAsync();
        Assert.Equal(0, remainingVotes);
    }

    [Fact]
    public async Task ArchiveCurrentVotes_ReturnsBadRequest_WhenNoCurrentVotesExist()
    {
        var result = await _controller.ArchiveCurrentVotes(new ArchiveVotesRequest { Notes = "Round note" });

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task ArchiveCurrentVotes_ReturnsOk_WhenCurrentVotesExist()
    {
        _context.Games.AddRange(
            new GameDto { Id = 1, Title = "Game 1" },
            new GameDto { Id = 2, Title = "Game 2" });
        _context.CurrentVotes.AddRange(
            new CurrentVote { GameId = 1, VoteCount = 25, GameNumber = 1 },
            new CurrentVote { GameId = 2, VoteCount = 10, GameNumber = 2 });
        await _context.SaveChangesAsync();

        var result = await _controller.ArchiveCurrentVotes(new ArchiveVotesRequest { Notes = "Archived" });

        Assert.IsType<OkObjectResult>(result);
        Assert.Equal(0, await _context.CurrentVotes.CountAsync());
        Assert.Equal(2, await _context.VoteHistory.CountAsync());
    }

    [Fact]
    public async Task UpdateVoteCountByGameNumber_ReturnsBadRequest_WhenRequestIsNull()
    {
        var result = await _controller.UpdateVoteCountByGameNumber(null!);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UpdateVoteCountByGameNumber_ReturnsBadRequest_WhenGameNumberInvalid()
    {
        var result = await _controller.UpdateVoteCountByGameNumber(new UpdateVoteByGameNumberRequest
        {
            GameNumber = 4,
            VoteCount = 12
        });

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UpdateVoteCountByGameNumber_ReturnsBadRequest_WhenVoteCountNegative()
    {
        var result = await _controller.UpdateVoteCountByGameNumber(new UpdateVoteByGameNumberRequest
        {
            GameNumber = 1,
            VoteCount = -1
        });

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UpdateVoteCountByGameNumber_ReturnsNotFound_WhenCurrentVoteMissing()
    {
        var result = await _controller.UpdateVoteCountByGameNumber(new UpdateVoteByGameNumberRequest
        {
            GameNumber = 2,
            VoteCount = 10
        });

        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task UpdateVoteCountByGameNumber_ReturnsOk_AndUpdatesVoteCount()
    {
        _context.Games.Add(new GameDto { Id = 1, Title = "Game 1" });
        _context.CurrentVotes.Add(new CurrentVote { GameId = 1, VoteCount = 5, GameNumber = 2 });
        await _context.SaveChangesAsync();

        var result = await _controller.UpdateVoteCountByGameNumber(new UpdateVoteByGameNumberRequest
        {
            GameNumber = 2,
            VoteCount = 33
        });

        Assert.IsType<OkObjectResult>(result);
        _context.ChangeTracker.Clear();
        var updated = await _context.CurrentVotes.FirstAsync(cv => cv.GameNumber == 2);
        Assert.Equal(33, updated.VoteCount);
    }

    [Fact]
    public async Task FillCurrentVotesWithRandom_ReturnsBadRequest_WhenRequestIsNull()
    {
        var result = await _controller.FillCurrentVotesWithRandom(null);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task FillCurrentVotesWithRandom_ReturnsBadRequest_WhenCountIsZero()
    {
        var result = await _controller.FillCurrentVotesWithRandom(new FillRandomVotesRequest { Count = 0 });

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task FillCurrentVotesWithRandom_ReturnsBadRequest_WhenNoSlotsAvailable()
    {
        _context.CurrentVotes.AddRange(
            new CurrentVote { GameId = 1, VoteCount = 0, GameNumber = 1 },
            new CurrentVote { GameId = 2, VoteCount = 0, GameNumber = 2 },
            new CurrentVote { GameId = 3, VoteCount = 0, GameNumber = 3 });
        await _context.SaveChangesAsync();

        var result = await _controller.FillCurrentVotesWithRandom(new FillRandomVotesRequest { Count = 1 });

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task FillCurrentVotesWithRandom_ReturnsBadRequest_WhenNoEligibleGames()
    {
        var result = await _controller.FillCurrentVotesWithRandom(new FillRandomVotesRequest { Count = 2 });

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task FillCurrentVotesWithRandom_ReturnsBadRequest_WhenInsufficientEligibleGames()
    {
        _context.Games.Add(new GameDto { Id = 10, Title = "Only Eligible" });
        _context.GamesOwned.Add(new GameOwned { OwnershipId = 1, GameId = 10, OwnPhysicalCopy = true, TypeOwned = "PAL" });
        await _context.SaveChangesAsync();

        var result = await _controller.FillCurrentVotesWithRandom(new FillRandomVotesRequest { Count = 3 });

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task FillCurrentVotesWithRandom_ReturnsOk_AndCreatesVotes_WhenEligibleGamesExist()
    {
        _context.Games.AddRange(
            new GameDto { Id = 20, Title = "Game 20" },
            new GameDto { Id = 21, Title = "Game 21" },
            new GameDto { Id = 22, Title = "Game 22" });
        _context.GamesOwned.AddRange(
            new GameOwned { OwnershipId = 20, GameId = 20, OwnPhysicalCopy = true, TypeOwned = "PAL" },
            new GameOwned { OwnershipId = 21, GameId = 21, OwnPhysicalCopy = true, TypeOwned = "PAL" },
            new GameOwned { OwnershipId = 22, GameId = 22, OwnPhysicalCopy = true, TypeOwned = "PAL" });
        await _context.SaveChangesAsync();

        var result = await _controller.FillCurrentVotesWithRandom(new FillRandomVotesRequest { Count = 2 });

        Assert.IsType<OkObjectResult>(result);
        var currentVotesCount = await _context.CurrentVotes.CountAsync();
        Assert.Equal(2, currentVotesCount);
    }

    private void SetupAdminUser()
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.Name, "testadmin"),
            new(ClaimTypes.Role, "Admin")
        };
        var identity = new ClaimsIdentity(claims, "TestAuthType");
        var claimsPrincipal = new ClaimsPrincipal(identity);

        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = claimsPrincipal }
        };
    }

    // Helper class for test service scope factory
    private class TestServiceScopeFactory : IServiceScopeFactory
    {
        private readonly IServiceProvider _serviceProvider;

        public TestServiceScopeFactory(IServiceProvider serviceProvider)
        {
            _serviceProvider = serviceProvider;
        }

        public IServiceScope CreateScope()
        {
            return new TestServiceScope(_serviceProvider);
        }
    }

    private sealed class TestServiceScope : IServiceScope
    {
        public TestServiceScope(IServiceProvider serviceProvider)
        {
            ServiceProvider = serviceProvider;
        }

        public IServiceProvider ServiceProvider { get; }

        public void Dispose() { }
    }
}
