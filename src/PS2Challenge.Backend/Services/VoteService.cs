using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PS2Challenge.Backend.Data;
using PS2Challenge.Backend.Models;

namespace PS2Challenge.Backend.Services;

public class VoteService
{
    private readonly IServiceScopeFactory _scopeFactory;

    public VoteService(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    /// <summary>
    /// Archives current votes to vote history with the next available round number
    /// </summary>
    /// <param name="notes">Optional notes about the voting round</param>
    /// <param name="manualPositions">Optional manual position assignments (GameId -> Position)</param>
    /// <returns>Tuple containing the round number and count of archived votes</returns>
    public virtual async Task<(int roundNumber, int archivedCount)> ArchiveCurrentVotesAsync(string? notes = null, Dictionary<int, int>? manualPositions = null)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        // Get all current votes
        var currentVotes = await db.CurrentVotes.ToListAsync();
        if (!currentVotes.Any())
        {
            throw new InvalidOperationException("No current votes to archive");
        }

        // Get the next round number (max round + 1, or 1 if no history exists)
        var maxRound = await db.VoteHistory.AnyAsync()
            ? await db.VoteHistory.MaxAsync(vh => vh.VoteRound)
            : 0;

        var nextRound = maxRound + 1;

        // Sort current votes by vote count (descending) to determine automatic positions
        var sortedVotes = currentVotes.OrderByDescending(cv => cv.VoteCount).ToList();

        // Create vote history entries
        var historyEntries = new List<VoteHistory>();
        for (int i = 0; i < sortedVotes.Count; i++)
        {
            var cv = sortedVotes[i];
            int? position = null;

            // Check if manual position is specified
            if (manualPositions != null && manualPositions.TryGetValue(cv.GameId, out var manualPos))
            {
                position = manualPos;
            }
            else
            {
                // Auto-assign position if there are no ties
                if (i == 0)
                {
                    // Check if first place is unique
                    if (sortedVotes.Count == 1 || sortedVotes[1].VoteCount != cv.VoteCount)
                        position = 1;
                }
                else if (i == 1)
                {
                    // Check if second place is unique and different from first
                    if (sortedVotes[0].VoteCount != cv.VoteCount &&
                        (sortedVotes.Count == 2 || sortedVotes[2].VoteCount != cv.VoteCount))
                        position = 2;
                }
                else if (i == 2)
                {
                    // Check if third place is unique and different from second
                    if (sortedVotes[1].VoteCount != cv.VoteCount)
                        position = 3;
                }
            }

            historyEntries.Add(new VoteHistory
            {
                GameId = cv.GameId,
                VoteRound = nextRound,
                VoteCount = cv.VoteCount,
                Position = position,
                Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim()
            });
        }

        // Add to history
        await db.VoteHistory.AddRangeAsync(historyEntries);

        // Clear current votes
        db.CurrentVotes.RemoveRange(currentVotes);

        await db.SaveChangesAsync();

        return (nextRound, historyEntries.Count);
    }

    /// <summary>
    /// Gets all current votes with game titles
    /// </summary>
    public virtual async Task<List<CurrentVoteDto>> GetCurrentVotesAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        var current = await db.CurrentVotes.AsNoTracking().ToListAsync();
        if (!current.Any())
        {
            return new List<CurrentVoteDto>();
        }

        var gameIds = current.Select(c => c.GameId).Distinct().ToList();
        var games = await db.Games.AsNoTracking().Where(g => gameIds.Contains(g.Id)).ToListAsync();
        var idToTitle = games.ToDictionary(g => g.Id, g => g.Title);

        return current
            .Select(c => new CurrentVoteDto
            {
                GameId = c.GameId,
                GameTitle = idToTitle.TryGetValue(c.GameId, out var t) ? t : string.Empty,
                VoteCount = c.VoteCount,
                GameNumber = c.GameNumber
            })
            .OrderBy(x => x.GameNumber)
            .ThenByDescending(x => x.VoteCount)
            .ThenBy(x => x.GameTitle)
            .ToList();
    }

    /// <summary>
    /// Sets current votes (upsert operation)
    /// </summary>
    public virtual async Task<(int inserted, int updated)> SetCurrentVotesAsync(List<CurrentVoteDto> votes)
    {
        if (votes == null || !votes.Any())
        {
            throw new ArgumentException("No votes provided", nameof(votes));
        }

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        // Collect all titles (normalize)
        var titles = votes
            .Select(v => v.GameTitle?.Trim() ?? string.Empty)
            .Where(t => !string.IsNullOrEmpty(t))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (!titles.Any())
        {
            throw new ArgumentException("No game titles provided");
        }

        // Load all games into memory and build a case-insensitive map
        var allGames = await db.Games.AsNoTracking().ToListAsync();
        var titleToId = allGames
            .Where(g => !string.IsNullOrWhiteSpace(g.Title))
            .ToDictionary(g => g.Title.Trim(), g => g.Id, StringComparer.OrdinalIgnoreCase);

        // Determine missing titles
        var missing = titles.Where(t => !titleToId.ContainsKey(t)).ToList();
        if (missing.Any())
        {
            throw new InvalidOperationException($"Some game titles were not found: {string.Join(", ", missing)}");
        }

        var gameIds = titleToId.Values.Distinct().ToList();

        // Load existing current votes for the relevant game ids
        var existingDict = await db.CurrentVotes
            .Where(cv => gameIds.Contains(cv.GameId))
            .ToDictionaryAsync(cv => cv.GameId, cv => cv);

        var insertedCount = 0;
        var updatedCount = 0;
        var toInsert = new List<CurrentVote>();

        foreach (var v in votes)
        {
            var rawTitle = v.GameTitle?.Trim() ?? string.Empty;
            if (string.IsNullOrEmpty(rawTitle) || v.VoteCount < 0 || v.GameNumber < 1 || v.GameNumber > 3)
            {
                continue;
            }

            if (!titleToId.TryGetValue(rawTitle, out var gameId))
            {
                continue;
            }

            if (existingDict.TryGetValue(gameId, out var existingRow))
            {
                if (existingRow.VoteCount != v.VoteCount || existingRow.GameNumber != v.GameNumber)
                {
                    existingRow.VoteCount = v.VoteCount;
                    existingRow.GameNumber = v.GameNumber;
                    updatedCount++;
                }
            }
            else
            {
                toInsert.Add(new CurrentVote
                {
                    GameId = gameId,
                    VoteCount = v.VoteCount,
                    GameNumber = v.GameNumber
                });
                insertedCount++;
            }
        }

        if (toInsert.Any())
        {
            await db.CurrentVotes.AddRangeAsync(toInsert);
        }

        await db.SaveChangesAsync();

        return (insertedCount, updatedCount);
    }

    /// <summary>
    /// Removes a current vote by game title
    /// </summary>
    public virtual async Task<bool> RemoveCurrentVoteAsync(string gameTitle)
    {
        if (string.IsNullOrWhiteSpace(gameTitle))
        {
            throw new ArgumentException("Game title is required", nameof(gameTitle));
        }

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        // Find game by title (case-insensitive)
        var game = await db.Games
            .AsNoTracking()
            .FirstOrDefaultAsync(g => g.Title.ToLower() == gameTitle.Trim().ToLower());

        if (game == null)
        {
            throw new InvalidOperationException($"Game '{gameTitle}' not found");
        }

        // Find and remove the current vote for this game
        var currentVote = await db.CurrentVotes
            .FirstOrDefaultAsync(cv => cv.GameId == game.Id);

        if (currentVote == null)
        {
            return false;
        }

        db.CurrentVotes.Remove(currentVote);
        await db.SaveChangesAsync();

        return true;
    }

    /// <summary>
    /// Gets vote history grouped by round
    /// </summary>
    public virtual async Task<List<VoteRoundDto>> GetVoteHistoryAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        // Get all vote history with position
        var allHistory = await db.VoteHistory
            .AsNoTracking()
            .ToListAsync();

        var rounds = allHistory.Select(h => h.VoteRound).Distinct().OrderByDescending(r => r).ToList();

        // Preload game titles for used game ids
        var allGameIds = allHistory.Select(h => h.GameId).Distinct().ToList();
        var games = await db.Games.AsNoTracking().Where(g => allGameIds.Contains(g.Id)).ToListAsync();
        var idToTitle = games.ToDictionary(g => g.Id, g => g.Title);

        var result = new List<VoteRoundDto>();

        foreach (var round in rounds)
        {
            var perRound = allHistory.Where(h => h.VoteRound == round).ToList();

            // Try to use position first, fallback to vote count ordering
            var top = perRound.FirstOrDefault(h => h.Position == 1);
            var second = perRound.FirstOrDefault(h => h.Position == 2);
            var last = perRound.FirstOrDefault(h => h.Position == 3);

            // Fallback: if positions aren't set, use vote count
            if (top == null || second == null || last == null)
            {
                var ordered = perRound.OrderByDescending(h => h.VoteCount).ToList();
                top ??= ordered.ElementAtOrDefault(0);
                second ??= ordered.ElementAtOrDefault(1);
                last ??= ordered.ElementAtOrDefault(2);
            }

            // Pick notes for the round
            var notesForRound = perRound
                .Where(h => !string.IsNullOrEmpty(h.Notes))
                .Select(h => h.Notes)
                .FirstOrDefault();

            string GetTitle(int gameId) => idToTitle.TryGetValue(gameId, out var t) ? t : string.Empty;

            result.Add(new VoteRoundDto
            {
                VoteRound = round,
                TopGameTitle = top != null ? GetTitle(top.GameId) : string.Empty,
                TopVotes = top?.VoteCount ?? 0,
                TopPosition = top?.Position,
                SecondGameTitle = second != null ? GetTitle(second.GameId) : string.Empty,
                SecondVotes = second?.VoteCount ?? 0,
                SecondPosition = second?.Position,
                LastGameTitle = last != null ? GetTitle(last.GameId) : string.Empty,
                LastVotes = last?.VoteCount ?? 0,
                LastPosition = last?.Position,
                Notes = notesForRound ?? string.Empty
            });
        }

        return result;
    }

    /// <summary>
    /// Gets all game titles for autocomplete/suggestions
    /// </summary>
    public virtual async Task<List<string>> GetAllGameTitlesAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        return await db.Games
            .AsNoTracking()
            .Select(g => g.Title)
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Distinct()
            .ToListAsync();
    }

    /// <summary>
    /// Fills current votes with random eligible games
    /// </summary>
    /// <param name="count">Number of games to add (will be limited by available slots)</param>
    /// <returns>Number of games added</returns>
    public virtual async Task<int> FillCurrentVotesWithRandomGamesAsync(int count)
    {
        if (count <= 0)
        {
            throw new ArgumentException("Count must be greater than 0", nameof(count));
        }

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        // Get current vote count
        var currentVotesCount = await db.CurrentVotes.CountAsync();

        // Calculate how many games we can add (max 3 total)
        var slotsAvailable = 3 - currentVotesCount;
        if (slotsAvailable <= 0)
        {
            throw new InvalidOperationException("Current votes already has 3 games. Archive or remove existing votes first.");
        }

        var gamesToAdd = Math.Min(count, slotsAvailable);

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
            .Where(gp => gp.DateStarted != null)
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
            throw new InvalidOperationException("No eligible games found. Games must be owned, not excluded, and not started.");
        }

        if (eligibleGameIds.Count < gamesToAdd)
        {
            throw new InvalidOperationException($"Only {eligibleGameIds.Count} eligible game(s) available, but {gamesToAdd} requested.");
        }

        // Randomly select games
        var random = new Random();
        var selectedGameIds = eligibleGameIds
            .OrderBy(x => random.Next())
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

        return newVotes.Count;
    }
}
