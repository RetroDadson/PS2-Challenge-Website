using Microsoft.EntityFrameworkCore;
using PS2Challenge.Backend.Data;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Services;
using PS2Challenge.Backend.Tests.Helpers;

namespace PS2Challenge.Backend.Tests.Services;

public class VoteServiceTests
{
    private readonly Ps2ChallengeDbContext _context;
    private readonly VoteService _voteService;

    public VoteServiceTests()
    {
        _context = TestDbContextFactory.CreateInMemoryContext();
        var scopeFactory = TestDbContextFactory.CreateServiceScopeFactory(_context);
        _voteService = new VoteService(scopeFactory);
    }

    [Fact]
    public async Task ArchiveCurrentVotesAsync_ThrowsWhenNoCurrentVotes()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(() => _voteService.ArchiveCurrentVotesAsync());
    }

    [Fact]
    public async Task ArchiveCurrentVotesAsync_CreatesHistory_AssignsPositions_AndClearsCurrent()
    {
        _context.CurrentVotes.AddRange(
            new CurrentVote { GameId = 1, VoteCount = 30, GameNumber = 1 },
            new CurrentVote { GameId = 2, VoteCount = 20, GameNumber = 2 },
            new CurrentVote { GameId = 3, VoteCount = 10, GameNumber = 3 }
        );
        await _context.SaveChangesAsync();

        var (roundNumber, archivedCount) = await _voteService.ArchiveCurrentVotesAsync("  Round notes  ");

        Assert.Equal(1, roundNumber);
        Assert.Equal(3, archivedCount);

        var history = await _context.VoteHistory.Where(h => h.VoteRound == 1).OrderBy(h => h.GameId).ToListAsync();
        Assert.Equal(3, history.Count);
        Assert.All(history, h => Assert.Equal("Round notes", h.Notes));

        Assert.Equal(1, history.Single(h => h.GameId == 1).Position);
        Assert.Equal(2, history.Single(h => h.GameId == 2).Position);
        Assert.Equal(3, history.Single(h => h.GameId == 3).Position);

        Assert.Empty(await _context.CurrentVotes.ToListAsync());
    }

    [Fact]
    public async Task ArchiveCurrentVotesAsync_UsesManualPositions_WhenProvided()
    {
        _context.CurrentVotes.AddRange(
            new CurrentVote { GameId = 10, VoteCount = 15, GameNumber = 1 },
            new CurrentVote { GameId = 11, VoteCount = 15, GameNumber = 2 },
            new CurrentVote { GameId = 12, VoteCount = 10, GameNumber = 3 }
        );
        await _context.SaveChangesAsync();

        var manualPositions = new Dictionary<int, int>
        {
            [10] = 2,
            [11] = 1,
            [12] = 3
        };

        var result = await _voteService.ArchiveCurrentVotesAsync("", manualPositions);

        Assert.Equal(1, result.roundNumber);

        var history = await _context.VoteHistory.Where(h => h.VoteRound == 1).ToListAsync();
        Assert.Equal(2, history.Single(h => h.GameId == 10).Position);
        Assert.Equal(1, history.Single(h => h.GameId == 11).Position);
        Assert.Equal(3, history.Single(h => h.GameId == 12).Position);
        Assert.All(history, h => Assert.Null(h.Notes));
    }

    [Fact]
    public async Task SetCurrentVotesAsync_ThrowsWhenInputEmpty()
    {
        await Assert.ThrowsAsync<ArgumentException>(() => _voteService.SetCurrentVotesAsync(new List<CurrentVoteDto>()));
    }

    [Fact]
    public async Task SetCurrentVotesAsync_InsertsUpdates_AndSkipsInvalidRows()
    {
        _context.Games.AddRange(
            new GameDto { Id = 1, Title = "Game One", Developer = "D", Publisher = "P", RegionFirstReleasedIn = "NA" },
            new GameDto { Id = 2, Title = "Game Two", Developer = "D", Publisher = "P", RegionFirstReleasedIn = "NA" },
            new GameDto { Id = 3, Title = "Game Three", Developer = "D", Publisher = "P", RegionFirstReleasedIn = "NA" }
        );
        _context.CurrentVotes.Add(new CurrentVote { GameId = 1, VoteCount = 5, GameNumber = 1 });
        await _context.SaveChangesAsync();

        var payload = new List<CurrentVoteDto>
        {
            new() { GameTitle = "Game One", VoteCount = 7, GameNumber = 2 },
            new() { GameTitle = "Game Two", VoteCount = 3, GameNumber = 1 },
            new() { GameTitle = "Game Three", VoteCount = -1, GameNumber = 1 },
            new() { GameTitle = "   ", VoteCount = 2, GameNumber = 1 }
        };

        var (inserted, updated) = await _voteService.SetCurrentVotesAsync(payload);

        Assert.Equal(1, inserted);
        Assert.Equal(1, updated);

        var currentVotes = await _context.CurrentVotes.OrderBy(v => v.GameId).ToListAsync();
        Assert.Equal(2, currentVotes.Count);
        Assert.Equal(7, currentVotes.Single(v => v.GameId == 1).VoteCount);
        Assert.Equal(2, currentVotes.Single(v => v.GameId == 1).GameNumber);
        Assert.Equal(3, currentVotes.Single(v => v.GameId == 2).VoteCount);
    }

    [Fact]
    public async Task SetCurrentVotesAsync_ThrowsWhenDuplicateGameTitlesProvided()
    {
        _context.Games.Add(new GameDto { Id = 1, Title = "Game One", Developer = "D", Publisher = "P", RegionFirstReleasedIn = "NA" });
        await _context.SaveChangesAsync();

        var payload = new List<CurrentVoteDto>
        {
            new() { GameTitle = "Game One", VoteCount = 7, GameNumber = 1 },
            new() { GameTitle = "game one", VoteCount = 5, GameNumber = 2 }
        };

        var exception = await Assert.ThrowsAsync<ArgumentException>(() => _voteService.SetCurrentVotesAsync(payload));

        Assert.Contains("Duplicate game titles", exception.Message);
    }

    [Fact]
    public async Task SetCurrentVotesAsync_ThrowsWhenProjectedGameNumbersCollide()
    {
        _context.Games.AddRange(
            new GameDto { Id = 1, Title = "Game One", Developer = "D", Publisher = "P", RegionFirstReleasedIn = "NA" },
            new GameDto { Id = 2, Title = "Game Two", Developer = "D", Publisher = "P", RegionFirstReleasedIn = "NA" });
        _context.CurrentVotes.AddRange(
            new CurrentVote { GameId = 1, VoteCount = 5, GameNumber = 1 },
            new CurrentVote { GameId = 2, VoteCount = 3, GameNumber = 2 });
        await _context.SaveChangesAsync();

        var payload = new List<CurrentVoteDto>
        {
            new() { GameTitle = "Game One", VoteCount = 7, GameNumber = 2 }
        };

        var exception = await Assert.ThrowsAsync<ArgumentException>(() => _voteService.SetCurrentVotesAsync(payload));

        Assert.Contains("unique game numbers", exception.Message);
    }

    [Fact]
    public async Task RemoveCurrentVoteAsync_RemovesVote_ByCaseInsensitiveTitle()
    {
        _context.Games.Add(new GameDto { Id = 1, Title = "God of War", Developer = "D", Publisher = "P", RegionFirstReleasedIn = "NA" });
        _context.CurrentVotes.Add(new CurrentVote { GameId = 1, VoteCount = 9, GameNumber = 1 });
        await _context.SaveChangesAsync();

        var removed = await _voteService.RemoveCurrentVoteAsync("  god OF war  ");

        Assert.True(removed);
        Assert.Empty(await _context.CurrentVotes.ToListAsync());
    }

    [Fact]
    public async Task RemoveCurrentVoteAsync_ReturnsFalse_WhenVoteNotPresent()
    {
        _context.Games.Add(new GameDto { Id = 1, Title = "Silent Hill 2", Developer = "D", Publisher = "P", RegionFirstReleasedIn = "NA" });
        await _context.SaveChangesAsync();

        var removed = await _voteService.RemoveCurrentVoteAsync("Silent Hill 2");

        Assert.False(removed);
    }

    [Fact]
    public async Task GetVoteHistoryAsync_FallsBackToVoteCountOrder_WhenPositionsMissing()
    {
        _context.Games.AddRange(
            new GameDto { Id = 1, Title = "Top Game", Developer = "D", Publisher = "P", RegionFirstReleasedIn = "NA" },
            new GameDto { Id = 2, Title = "Second Game", Developer = "D", Publisher = "P", RegionFirstReleasedIn = "NA" },
            new GameDto { Id = 3, Title = "Last Game", Developer = "D", Publisher = "P", RegionFirstReleasedIn = "NA" }
        );

        _context.VoteHistory.AddRange(
            new VoteHistory { GameId = 1, VoteRound = 3, VoteCount = 50, Position = null, Notes = "Round 3 notes" },
            new VoteHistory { GameId = 2, VoteRound = 3, VoteCount = 40, Position = null, Notes = null },
            new VoteHistory { GameId = 3, VoteRound = 3, VoteCount = 30, Position = null, Notes = null }
        );
        await _context.SaveChangesAsync();

        var history = await _voteService.GetVoteHistoryAsync();

        Assert.Single(history);
        var round = history[0];
        Assert.Equal(3, round.VoteRound);
        Assert.Equal("Top Game", round.TopGameTitle);
        Assert.Equal(50, round.TopVotes);
        Assert.Equal("Second Game", round.SecondGameTitle);
        Assert.Equal(40, round.SecondVotes);
        Assert.Equal("Last Game", round.LastGameTitle);
        Assert.Equal(30, round.LastVotes);
        Assert.Equal("Round 3 notes", round.Notes);
    }

    [Fact]
    public async Task FillCurrentVotesWithRandomGamesAsync_AddsEligibleGames_UpToAvailableSlots()
    {
        _context.Games.AddRange(
            new GameDto { Id = 1, Title = "Eligible One", Developer = "D", Publisher = "P", RegionFirstReleasedIn = "NA" },
            new GameDto { Id = 2, Title = "Eligible Two", Developer = "D", Publisher = "P", RegionFirstReleasedIn = "NA" },
            new GameDto { Id = 3, Title = "Already In Votes", Developer = "D", Publisher = "P", RegionFirstReleasedIn = "NA" },
            new GameDto { Id = 4, Title = "Excluded", Developer = "D", Publisher = "P", RegionFirstReleasedIn = "NA" },
            new GameDto { Id = 5, Title = "Started", Developer = "D", Publisher = "P", RegionFirstReleasedIn = "NA" }
        );

        _context.GamesOwned.AddRange(
            new GameOwned { GameId = 1, OwnPhysicalCopy = true, TypeOwned = "PAL" },
            new GameOwned { GameId = 2, OwnPhysicalCopy = true, TypeOwned = "PAL" },
            new GameOwned { GameId = 3, OwnPhysicalCopy = true, TypeOwned = "PAL" },
            new GameOwned { GameId = 4, OwnPhysicalCopy = true, TypeOwned = "PAL" },
            new GameOwned { GameId = 5, OwnPhysicalCopy = true, TypeOwned = "PAL" }
        );

        _context.CurrentVotes.Add(new CurrentVote { GameId = 3, VoteCount = 1, GameNumber = 1 });
        _context.ExcludedGames.Add(new ExcludedGame { GameId = 4, Reason = "No longer available" });
        _context.GameProgress.Add(new GameProgress { GameId = 5, DateStarted = DateOnly.FromDateTime(DateTime.UtcNow), Platform = "PAL" });

        await _context.SaveChangesAsync();

        var added = await _voteService.FillCurrentVotesWithRandomGamesAsync(2);

        Assert.Equal(2, added);

        var currentVotes = await _context.CurrentVotes.OrderBy(cv => cv.GameNumber).ToListAsync();
        Assert.Equal(3, currentVotes.Count);
        Assert.Contains(currentVotes, cv => cv.GameId == 1);
        Assert.Contains(currentVotes, cv => cv.GameId == 2);
        Assert.Contains(currentVotes, cv => cv.GameId == 3);
        Assert.Contains(currentVotes, cv => cv.GameNumber == 2);
        Assert.Contains(currentVotes, cv => cv.GameNumber == 3);
    }

    [Fact]
    public async Task FillCurrentVotesWithRandomGameDetailsAsync_ReturnsAddedVoteDetails()
    {
        _context.Games.Add(new GameDto
        {
            Id = 6,
            Title = "Only Eligible",
            Developer = "D",
            Publisher = "P",
            RegionFirstReleasedIn = "NA"
        });
        _context.GamesOwned.Add(new GameOwned
        {
            GameId = 6,
            OwnPhysicalCopy = true,
            TypeOwned = "PAL"
        });
        await _context.SaveChangesAsync();

        var addedVotes = await _voteService.FillCurrentVotesWithRandomGameDetailsAsync(1);

        var addedVote = Assert.Single(addedVotes);
        Assert.Equal(6, addedVote.GameId);
        Assert.Equal("Only Eligible", addedVote.GameTitle);
        Assert.Equal(1, addedVote.GameNumber);
        Assert.Equal(0, addedVote.VoteCount);
    }
}
