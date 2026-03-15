using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using PS2Challenge.Api.Api.Models;
using PS2Challenge.Backend.Data;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Services;
using PS2Challenge.Main.Api.Hubs;
using System.Security.Cryptography;

namespace PS2Challenge.Api.Api.Controllers;

/// <summary>
/// Manages voting history and current vote tracking for the PS2 Challenge
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class VotesController : ControllerBase
{
    private const string InternalServerErrorMessage = "Internal server error";
    private const string VotesUpdatedEvent = "VotesUpdated";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHubContext<VotesHub> _hubContext;
    private readonly VoteService _voteService;

    public VotesController(IServiceScopeFactory scopeFactory, IHubContext<VotesHub> hubContext, VoteService voteService)
    {
        _scopeFactory = scopeFactory;
        _hubContext = hubContext;
        _voteService = voteService;
    }

    /// <summary>
    /// Get complete voting history for all rounds
    /// </summary>
    /// <returns>List of all historical vote rounds with game titles, counts, and positions</returns>
    /// <response code="200">Returns the voting history</response>
    /// <response code="500">Internal server error</response>
    [HttpGet("history")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetHistory()
    {
        try
        {
            var result = await _voteService.GetVoteHistoryAsync();
            return Ok(result);
        }
        catch (Exception)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = InternalServerErrorMessage });
        }
    }

    /// <summary>
    /// Upload historical voting data for multiple rounds (Admin only)
    /// </summary>
    /// <param name="rounds">List of vote rounds with game titles and vote counts</param>
    /// <returns>Count of inserted and updated vote records</returns>
    /// <response code="200">Vote history uploaded successfully</response>
    /// <response code="400">Invalid data - validation errors in request</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="500">Internal server error</response>
    /// <remarks>
    /// Each round must contain exactly 3 votes with distinct game titles.
    /// Vote counts must be non-negative, and positions (if provided) must be 1, 2, or 3.
    /// Existing vote records will be updated, new records will be inserted.
    ///
    /// Sample request:
    ///
    ///     POST /api/votes/upload
    ///     [
    ///         {
    ///             "voteRound": 1,
    ///             "notes": "First voting round",
    ///             "votes": [
    ///                 { "gameTitle": "Final Fantasy X", "count": 150, "position": 1 },
    ///                 { "gameTitle": "Kingdom Hearts", "count": 120, "position": 2 },
    ///                 { "gameTitle": "Gran Turismo 3", "count": 90, "position": 3 }
    ///             ]
    ///         }
    ///     ]
    /// </remarks>
    [HttpPost("upload")]
    [Authorize(Policy = "AdminCookieOrApiKey")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> UploadHistory([FromBody] List<UploadRoundDto>? rounds)
    {
        if (rounds == null || !rounds.Any())
            return BadRequest(new { message = "No rounds provided" });

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        // collect all titles (normalize)
        var titles = rounds
            .SelectMany(r => r.Votes.Select(v => v.GameTitle?.Trim() ?? string.Empty))
            .Where(t => !string.IsNullOrEmpty(t))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (!titles.Any())
            return BadRequest(new { message = "No game titles provided" });

        // case-insensitive lookup: translate titles to lower then compare using column ToLower()
        var titlesLower = titles.Select(t => t.ToLowerInvariant()).ToList();

        var games = await db.Games
            .AsNoTracking()
            .Where(g => titlesLower.Contains(g.Title.ToLower()))
            .ToListAsync();

        // map title(lower) -> id
        var titleToId = games
            .ToDictionary(g => g.Title.ToLowerInvariant(), g => g.Id);

        // determine missing titles
        var missing = titlesLower.Where(t => !titleToId.ContainsKey(t)).ToList();
        if (missing.Any())
        {
            return BadRequest(new { message = "Some game titles were not found", missing });
        }

        var roundsNumbers = rounds.Select(r => r.VoteRound).Distinct().ToList();
        var allGameIds = rounds.SelectMany(r => r.Votes.Select(v => titleToId[v.GameTitle!.Trim().ToLowerInvariant()])).Distinct().ToList();

        // Load existing history rows for these rounds and games
        var existing = await db.VoteHistory
            .Where(vh => roundsNumbers.Contains(vh.VoteRound) && allGameIds.Contains(vh.GameId))
            .ToListAsync();

        var toInsert = new List<VoteHistory>();
        var updatedCount = 0;
        var insertedCount = 0;

        foreach (var round in rounds)
        {
            var validationError = ValidateUploadRound(round);
            if (validationError != null)
            {
                return validationError;
            }

            foreach (var vote in round.Votes!)
            {
                UpsertVoteHistoryEntry(
                    round,
                    vote,
                    titleToId,
                    existing,
                    toInsert,
                    ref insertedCount,
                    ref updatedCount);
            }
        }

        await db.VoteHistory.AddRangeAsync(toInsert);

        // Save changes (updates tracked existing rows + inserted ones)
        await db.SaveChangesAsync();

        return Ok(new { inserted = insertedCount, updated = updatedCount });
    }

    /// <summary>
    /// Get the current active votes
    /// </summary>
    /// <returns>List of games currently being voted on with their vote counts and positions</returns>
    /// <response code="200">Returns the current votes</response>
    /// <response code="500">Internal server error</response>
    [HttpGet("current")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetCurrentVotes()
    {
        try
        {
            var result = await _voteService.GetCurrentVotesAsync();
            return Ok(result);
        }
        catch (Exception)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = InternalServerErrorMessage });
        }
    }

    /// <summary>
    /// Set or update the current active votes (Admin only)
    /// </summary>
    /// <param name="votes">List of current votes with game titles and vote counts</param>
    /// <returns>Count of inserted and updated vote records</returns>
    /// <response code="200">Current votes updated successfully</response>
    /// <response code="400">Invalid data - validation errors in request</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="500">Internal server error</response>
    /// <remarks>
    /// Updates existing vote entries or creates new ones. Triggers real-time update to connected clients via SignalR.
    /// Vote counts must be non-negative.
    ///
    /// Sample request:
    ///
    ///     POST /api/votes/current
    ///     [
    ///         { "gameTitle": "Final Fantasy X", "voteCount": 150, "gameNumber": 1 },
    ///         { "gameTitle": "Kingdom Hearts", "voteCount": 120, "gameNumber": 2 },
    ///         { "gameTitle": "Gran Turismo 3", "voteCount": 90, "gameNumber": 3 }
    ///     ]
    /// </remarks>
    [Authorize(Policy = "AdminCookieOrApiKey")]
    [HttpPost("current")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> SetCurrentVotes([FromBody] List<CurrentVoteDto>? votes)
    {
        if (votes == null || !votes.Any())
            return BadRequest(new { message = "No votes provided" });

        try
        {
            var (inserted, updated) = await _voteService.SetCurrentVotesAsync(votes);

            // Notify SignalR clients that votes were updated
            await _hubContext.Clients.All.SendAsync(VotesUpdatedEvent);

            return Ok(new { inserted, updated });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = InternalServerErrorMessage });
        }
    }

    /// <summary>
    /// Remove a game from current votes by title (Admin only)
    /// </summary>
    /// <param name="gameTitle">The title of the game to remove from current votes</param>
    /// <returns>Confirmation message</returns>
    /// <response code="200">Current vote removed successfully</response>
    /// <response code="400">Invalid request data</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="404">Game not found in current votes</response>
    /// <response code="500">Internal server error</response>
    [Authorize(Policy = "AdminCookieOrApiKey")]
    [HttpDelete("current/{gameTitle}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> RemoveCurrentVote(string gameTitle)
    {
        try
        {
            var removed = await _voteService.RemoveCurrentVoteAsync(gameTitle);

            if (!removed)
            {
                return NotFound(new { message = $"No current vote found for '{gameTitle}'" });
            }

            // Notify SignalR clients that votes were updated
            await _hubContext.Clients.All.SendAsync(VotesUpdatedEvent);

            return Ok(new { message = $"Current vote for '{gameTitle}' removed successfully" });
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = InternalServerErrorMessage });
        }
    }

    /// <summary>
    /// Archive current votes to voting history (Admin only)
    /// </summary>
    /// <param name="request">Optional notes about the voting round being archived</param>
    /// <returns>Round number and count of archived votes</returns>
    /// <response code="200">Current votes archived successfully</response>
    /// <response code="400">No current votes to archive or invalid request</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="500">Internal server error</response>
    /// <remarks>
    /// Moves all current votes to the voting history as a new round and clears the current votes.
    /// The round number is automatically incremented from the last historical round.
    /// Triggers real-time update to connected clients via SignalR.
    /// </remarks>
    [Authorize(Policy = "AdminCookieOrApiKey")]
    [HttpPost("archive")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> ArchiveCurrentVotes([FromBody] ArchiveVotesRequest? request)
    {
        try
        {
            var (roundNumber, archivedCount) = await _voteService.ArchiveCurrentVotesAsync(request?.Notes);

            // Notify SignalR clients that votes were updated
            await _hubContext.Clients.All.SendAsync(VotesUpdatedEvent);

            return Ok(new
            {
                message = "Current votes archived successfully",
                round = roundNumber,
                archivedCount
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = InternalServerErrorMessage });
        }
    }

    /// <summary>
    /// Update vote count for a game by game number position (Admin only)
    /// </summary>
    /// <param name="request">Game number (1-3) and new vote count</param>
    /// <returns>Confirmation with updated game information</returns>
    /// <response code="200">Vote count updated successfully</response>
    /// <response code="400">Invalid game number (must be 1-3) or negative vote count</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="404">No current vote found for the specified game number</response>
    /// <response code="500">Internal server error</response>
    /// <remarks>
    /// Updates the vote count for the game in position 1, 2, or 3 of the current votes.
    /// Triggers real-time update to connected clients via SignalR.
    /// </remarks>
    [Authorize(Policy = "AdminCookieOrApiKey")]
    [HttpPut("current/by-game-number")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> UpdateVoteCountByGameNumber([FromBody] UpdateVoteByGameNumberRequest request)
    {
        if (request == null)
        {
            return BadRequest(new { message = "Request data is required" });
        }

        // Validate game number (1-3)
        if (request.GameNumber < 1 || request.GameNumber > 3)
        {
            return BadRequest(new { message = "Game number must be between 1 and 3" });
        }

        // Validate vote count (non-negative)
        if (request.VoteCount < 0)
        {
            return BadRequest(new { message = "Vote count cannot be negative" });
        }

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        try
        {
            // Find the current vote with the specified game number
            var currentVote = await db.CurrentVotes
                .FirstOrDefaultAsync(cv => cv.GameNumber == request.GameNumber);

            if (currentVote == null)
            {
                return NotFound(new
                {
                    message = $"No current vote found for game number {request.GameNumber}"
                });
            }

            // Get game title for response
            var game = await db.Games
                .AsNoTracking()
                .FirstOrDefaultAsync(g => g.Id == currentVote.GameId);

            var gameTitle = game?.Title ?? "Unknown";

            // Update the vote count
            currentVote.VoteCount = request.VoteCount;
            await db.SaveChangesAsync();

            // Notify SignalR clients that votes were updated
            await _hubContext.Clients.All.SendAsync(VotesUpdatedEvent);

            return Ok(new
            {
                message = $"Vote count updated successfully for game number {request.GameNumber}",
                gameNumber = currentVote.GameNumber,
                gameTitle = gameTitle,
                gameId = currentVote.GameId,
                voteCount = currentVote.VoteCount
            });
        }
        catch (Exception)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = InternalServerErrorMessage });
        }
    }

    /// <summary>
    /// Fill current votes with random owned games that have not been started (Admin only)
    /// </summary>
    /// <param name="request">Number of games to add (will fill up to 3 total games)</param>
    /// <returns>List of added games with their game numbers</returns>
    /// <response code="200">Current votes filled successfully with random games</response>
    /// <response code="400">Invalid request data or no eligible games available</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="500">Internal server error</response>
    /// <remarks>
    /// Fills the current votes table with random games that are:
    /// - Owned (marked in game_owned table)
    /// - Not excluded (not in excluded_games table)
    /// - Not started (no entry in progress table or entry without date_started)
    ///
    /// The number of games added is calculated as: min(count, 3 - current_votes_count)
    /// This ensures you never have more than 3 games in the current votes table.
    ///
    /// Each game is assigned a game number (1-3) based on available slots.
    /// All added games start with 0 votes.
    ///
    /// Sample request:
    ///
    ///     POST /api/votes/current/fill-random
    ///     {
    ///         "count": 3
    ///     }
    /// </remarks>
    [Authorize(Policy = "AdminCookieOrApiKey")]
    [HttpPost("current/fill-random")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> FillCurrentVotesWithRandom([FromBody] FillRandomVotesRequest? request)
    {
        if (request == null)
        {
            return BadRequest(new { message = "Request data is required" });
        }

        if (request.Count <= 0)
        {
            return BadRequest(new { message = "Count must be greater than 0" });
        }

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        try
        {
            // Get current vote count
            var currentVotesCount = await db.CurrentVotes.CountAsync();

            // Calculate how many games we can add (max 3 total)
            var slotsAvailable = 3 - currentVotesCount;
            if (slotsAvailable <= 0)
            {
                return BadRequest(new { message = "Current votes already has 3 games. Archive or remove existing votes first." });
            }

            var gamesToAdd = Math.Min(request.Count, slotsAvailable);

            // Get owned game IDs
            var ownedGameIds = await db.GamesOwned
                .Select(go => go.GameId)
                .ToListAsync();

            // Get excluded game IDs
            var excludedGameIds = await db.ExcludedGames
                .Select(eg => eg.GameId)
                .ToListAsync();

            // Get games that have been started (have progress with date started)
            var startedGameIds = await db.GameProgress
                .Select(gp => gp.GameId)
                .ToListAsync();

            // Get game IDs already in current votes
            var currentVoteGameIds = await db.CurrentVotes
                .Select(cv => cv.GameId)
                .ToListAsync();

            // Get eligible game IDs: owned, not excluded, not started, not in current votes
            var eligibleGameIds = ownedGameIds
                .Where(id => !excludedGameIds.Contains(id))
                .Where(id => !startedGameIds.Contains(id))
                .Where(id => !currentVoteGameIds.Contains(id))
                .ToList();

            if (!eligibleGameIds.Any())
            {
                return BadRequest(new { message = "No eligible games found. Games must be owned, not excluded, and not started." });
            }

            if (eligibleGameIds.Count < gamesToAdd)
            {
                return BadRequest(new
                {
                    message = $"Only {eligibleGameIds.Count} eligible game(s) available, but {gamesToAdd} requested.",
                    availableGames = eligibleGameIds.Count,
                    requestedGames = gamesToAdd
                });
            }

            // Randomly select games
            var shuffledGameIds = eligibleGameIds.ToList();
            for (var i = shuffledGameIds.Count - 1; i > 0; i--)
            {
                var j = RandomNumberGenerator.GetInt32(i + 1);
                (shuffledGameIds[i], shuffledGameIds[j]) = (shuffledGameIds[j], shuffledGameIds[i]);
            }

            var selectedGameIds = shuffledGameIds
                .Take(gamesToAdd)
                .ToList();

            // Get used game numbers
            var usedGameNumbers = await db.CurrentVotes
                .Select(cv => cv.GameNumber)
                .ToListAsync();

            // Find available game numbers (1-3)
            var availableGameNumbers = Enumerable.Range(1, 3)
                .Where(n => !usedGameNumbers.Contains(n))
                .ToList();

            // Create new current vote entries
            var newVotes = new List<CurrentVote>();
            for (int i = 0; i < selectedGameIds.Count; i++)
            {
                newVotes.Add(new CurrentVote
                {
                    GameId = selectedGameIds[i],
                    VoteCount = 0,
                    GameNumber = availableGameNumbers[i]
                });
            }

            await db.CurrentVotes.AddRangeAsync(newVotes);
            await db.SaveChangesAsync();

            // Get game titles for response
            var addedGames = await db.Games
                .AsNoTracking()
                .Where(g => selectedGameIds.Contains(g.Id))
                .Select(g => new { g.Id, g.Title })
                .ToListAsync();

            var response = newVotes.Select(cv => new
            {
                gameId = cv.GameId,
                gameTitle = addedGames.FirstOrDefault(g => g.Id == cv.GameId)?.Title ?? "Unknown",
                gameNumber = cv.GameNumber,
                voteCount = cv.VoteCount
            }).ToList();

            // Notify SignalR clients that votes were updated
            await _hubContext.Clients.All.SendAsync(VotesUpdatedEvent);

            return Ok(new
            {
                message = $"Successfully added {newVotes.Count} random game(s) to current votes",
                addedGames = response
            });
        }
        catch (Exception)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = InternalServerErrorMessage });
        }
    }

    private IActionResult? ValidateUploadRound(UploadRoundDto round)
    {
        if (round.Votes == null || round.Votes.Count != 3)
        {
            return BadRequest(new { message = $"Round {round.VoteRound} must contain exactly 3 vote entries" });
        }

        var titlesInRound = round.Votes.Select(v => (v.GameTitle ?? string.Empty).Trim()).ToList();
        if (titlesInRound.Count != titlesInRound.Distinct(StringComparer.OrdinalIgnoreCase).Count())
        {
            return BadRequest(new { message = $"Round {round.VoteRound} contains duplicate game titles" });
        }

        foreach (var vote in round.Votes)
        {
            if (string.IsNullOrWhiteSpace(vote.GameTitle))
            {
                return BadRequest(new { message = $"Empty game title in round {round.VoteRound}" });
            }

            if (vote.Count < 0)
            {
                return BadRequest(new { message = $"Invalid vote count in round {round.VoteRound} for '{vote.GameTitle}'" });
            }

            if (vote.Position is < 1 or > 3)
            {
                return BadRequest(new { message = $"Invalid position {vote.Position} in round {round.VoteRound} for '{vote.GameTitle}'. Position must be 1, 2, or 3." });
            }
        }

        return null;
    }

    private static void UpsertVoteHistoryEntry(
        UploadRoundDto round,
        UploadGameVote vote,
        Dictionary<string, int> titleToId,
        List<VoteHistory> existing,
        List<VoteHistory> toInsert,
        ref int insertedCount,
        ref int updatedCount)
    {
        var titleKey = vote.GameTitle!.Trim().ToLowerInvariant();
        var gameId = titleToId[titleKey];

        var existingRow = existing.FirstOrDefault(e => e.VoteRound == round.VoteRound && e.GameId == gameId);
        if (existingRow != null)
        {
            existingRow.VoteCount = vote.Count;
            existingRow.Position = vote.Position;
            existingRow.Notes = round.Notes?.Trim();
            updatedCount++;
            return;
        }

        toInsert.Add(new VoteHistory
        {
            GameId = gameId,
            VoteRound = round.VoteRound,
            VoteCount = vote.Count,
            Position = vote.Position,
            Notes = round.Notes?.Trim()
        });
        insertedCount++;
    }
}

/// <summary>
/// Request model for updating vote count by game number
/// </summary>
public class UpdateVoteByGameNumberRequest
{
    /// <summary>
    /// Game position number (1, 2, or 3)
    /// </summary>
    public int GameNumber { get; set; }

    /// <summary>
    /// New vote count (must be non-negative)
    /// </summary>
    public int VoteCount { get; set; }
}

/// <summary>
/// Request model for filling current votes with random games
/// </summary>
public class FillRandomVotesRequest
{
    /// <summary>
    /// Number of random games to add (will be limited by available slots and eligible games)
    /// </summary>
    public int Count { get; set; }
}
