using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PS2Challenge.Backend.Data;
using PS2Challenge.Backend.Data.Repositories;
using PS2Challenge.Backend.Models;

namespace PS2Challenge.Backend.Services;

public class GameService
{
    private readonly IServiceScopeFactory _scopeFactory;

    public GameService(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public virtual async Task<IEnumerable<GameDto>> GetAllGamesAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        var games = await dbContext.Games.ToListAsync();

        var excludedIds = await dbContext.ExcludedGames.Select(x => x.GameId).ToListAsync();
        var ownedIds = await dbContext.GamesOwned.Select(x => x.GameId).ToListAsync();

        foreach (var game in games)
        {
            game.IsExcluded = excludedIds.Contains(game.Id);
            game.IsOwned = ownedIds.Contains(game.Id);
        }

        // Custom sort: Special characters first, then alphanumeric
        return games.OrderBy(g =>
        {
            if (string.IsNullOrEmpty(g.Title)) return 1;
            var firstChar = g.Title[0];
            return char.IsLetterOrDigit(firstChar) ? 1 : 0;
        })
        .ThenBy(g => g.Title);
    }

    public virtual async Task<GameDto> AddGameAsync(GameDto gameDto)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        // Check if game already exists by title
        var existingGame = await dbContext.Games
            .FirstOrDefaultAsync(g => g.Title == gameDto.Title);

        if (existingGame != null)
        {
            throw new InvalidOperationException($"A game with the title '{gameDto.Title}' already exists with ID {existingGame.Id}");
        }

        // Add the game directly (GameDto is the entity)
        dbContext.Games.Add(gameDto);
        await dbContext.SaveChangesAsync();

        return gameDto;
    }

    public virtual async Task<ExcludedGame> AddExcludedGameAsync(string title, string reason)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        // Find the game by title
        var game = await dbContext.Games
            .FirstOrDefaultAsync(g => g.Title == title);

        if (game == null)
        {
            throw new InvalidOperationException($"No game found with title '{title}'");
        }

        // Check if already excluded
        var existingExclusion = await dbContext.ExcludedGames
            .FirstOrDefaultAsync(e => e.GameId == game.Id);

        if (existingExclusion != null)
        {
            throw new InvalidOperationException($"Game '{title}' is already excluded with reason: {existingExclusion.Reason}");
        }

        // Create exclusion entry
        var excludedGame = new ExcludedGame
        {
            GameId = game.Id,
            Reason = reason
        };

        dbContext.ExcludedGames.Add(excludedGame);
        await dbContext.SaveChangesAsync();

        return excludedGame;
    }

    public virtual async Task<IEnumerable<GameDto>> SearchGamesByTitleAsync(string title)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        // Search for games with title containing the search term (case-insensitive)
        // Use ILike for PostgreSQL or ToLower().Contains() for in-memory/testing
        var isInMemory = dbContext.Database.ProviderName == "Microsoft.EntityFrameworkCore.InMemory";

        var games = isInMemory
            ? await dbContext.Games
                .Where(g => g.Title.ToLower().Contains(title.ToLower()))
                .ToListAsync()
            : await dbContext.Games
                .Where(g => EF.Functions.ILike(g.Title, $"%{title}%"))
                .ToListAsync();

        var excludedIds = await dbContext.ExcludedGames.Select(x => x.GameId).ToListAsync();
        var ownedIds = await dbContext.GamesOwned.Select(x => x.GameId).ToListAsync();

        foreach (var game in games)
        {
            game.IsExcluded = excludedIds.Contains(game.Id);
            game.IsOwned = ownedIds.Contains(game.Id);
        }

        // Custom sort: Special characters first, then alphanumeric
        return games.OrderBy(g =>
        {
            if (string.IsNullOrEmpty(g.Title)) return 1;
            var firstChar = g.Title[0];
            return char.IsLetterOrDigit(firstChar) ? 1 : 0;
        })
        .ThenBy(g => g.Title);
    }

    public virtual async Task<GameOwned> AddGameOwnedAsync(string title, bool ownPhysicalCopy, string typeOwned)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        // Find the game by title
        var game = await dbContext.Games
            .FirstOrDefaultAsync(g => g.Title == title);

        if (game == null)
        {
            throw new InvalidOperationException($"No game found with title '{title}'");
        }

        // Check if already owned
        var existingOwnership = await dbContext.GamesOwned
            .FirstOrDefaultAsync(o => o.GameId == game.Id);

        if (existingOwnership != null)
        {
            throw new InvalidOperationException($"Game '{title}' is already marked as owned");
        }

        // Create ownership entry
        var gameOwned = new GameOwned
        {
            GameId = game.Id,
            OwnPhysicalCopy = ownPhysicalCopy,
            TypeOwned = typeOwned
        };

        dbContext.GamesOwned.Add(gameOwned);
        await dbContext.SaveChangesAsync();

        return gameOwned;
    }

    public virtual async Task<GameProgress> UpsertProgressAsync(string title, DateOnly dateStarted, DateOnly? dateFinished,
        string? completionTimeString, string? beatenCriteria, string? review, string platform)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        // Find the game by title
        var game = await dbContext.Games
            .FirstOrDefaultAsync(g => g.Title == title);

        if (game == null)
        {
            throw new InvalidOperationException($"No game found with title '{title}'");
        }

        // Parse TimeSpan from string in HH:MM:SS format
        TimeSpan? completionTime = null;
        if (!string.IsNullOrWhiteSpace(completionTimeString))
        {
            // Split the time string to handle hours > 24
            var parts = completionTimeString.Split(':');
            if (parts.Length == 3 &&
                int.TryParse(parts[0], out var hours) &&
                int.TryParse(parts[1], out var minutes) &&
                int.TryParse(parts[2], out var seconds))
            {
                completionTime = new TimeSpan(hours, minutes, seconds);
            }
            else if (TimeSpan.TryParse(completionTimeString, out var parsedTime))
            {
                // Fallback to standard parsing for formats like "1.06:00:00"
                completionTime = parsedTime;
            }
        }

        // Check if progress already exists for this game
        var existingProgress = await dbContext.GameProgress
            .FirstOrDefaultAsync(p => p.GameId == game.Id);

        if (existingProgress != null)
        {
            // Update existing progress
            existingProgress.DateStarted = dateStarted;
            existingProgress.DateFinished = dateFinished;
            existingProgress.CompletionTime = completionTime;
            existingProgress.BeatenCriteria = beatenCriteria;
            existingProgress.Review = review;
            existingProgress.Platform = platform;
        }
        else
        {
            // Create new progress entry
            existingProgress = new GameProgress
            {
                GameId = game.Id,
                DateStarted = dateStarted,
                DateFinished = dateFinished,
                CompletionTime = completionTime,
                BeatenCriteria = beatenCriteria,
                Review = review,
                Platform = platform
            };

            dbContext.GameProgress.Add(existingProgress);
        }

        await dbContext.SaveChangesAsync();

        return existingProgress;
    }

    public virtual async Task<IEnumerable<GameProgressDto>> GetAllProgressAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        var gamesWithProgress = await dbContext.GameProgress
            .Join(
                dbContext.Games,
                progress => progress.GameId,
                game => game.Id,
                (progress, game) => new GameProgressDto
                {
                    ProgressId = progress.ProgressId,
                    GameTitle = game.Title,
                    DateStarted = progress.DateStarted,
                    DateFinished = progress.DateFinished,
                    CompletionTime = progress.CompletionTime,
                    BeatenCriteria = progress.BeatenCriteria,
                    Review = progress.Review,
                    Platform = progress.Platform
                })
            .OrderByDescending(p => p.DateStarted)
            .ToListAsync();

        return gamesWithProgress;
    }

    public virtual async Task<IEnumerable<GameProgressDto>> GetCompletedGamesAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        var completedGames = await dbContext.GameProgress
            .Where(p => p.DateFinished != null)
            .OrderByDescending(p => p.DateFinished)
            .Select(p => new GameProgressDto
            {
                ProgressId = p.ProgressId,
                GameTitle = dbContext.Games.First(g => g.Id == p.GameId).Title,
                DateStarted = p.DateStarted,
                DateFinished = p.DateFinished,
                CompletionTime = p.CompletionTime,
                BeatenCriteria = p.BeatenCriteria,
                Review = p.Review,
                Platform = p.Platform
            })
            .ToListAsync();

        return completedGames;
    }

    public virtual async Task<Dictionary<int, string>> GetOwnedTypesAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        var owned = await dbContext.GamesOwned
            .AsNoTracking()
            .ToListAsync();

        // Map GameId -> TypeOwned (empty string if null)
        return owned.ToDictionary(o => o.GameId, o => o.TypeOwned ?? string.Empty);
    }

    public virtual async Task<Dictionary<int, string>> GetExclusionReasonsAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        var excluded = await dbContext.ExcludedGames
            .AsNoTracking()
            .ToListAsync();

        // Map GameId -> Reason
        return excluded.ToDictionary(e => e.GameId, e => e.Reason ?? "No reason provided");
    }

    /// <summary>
    /// Gets a dictionary mapping GameId to completion status (Completed, In Progress, or Not Started)
    /// </summary>
    public virtual async Task<Dictionary<int, string>> GetCompletionStatusAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        var progressData = await dbContext.GameProgress
            .AsNoTracking()
            .ToListAsync();

        // Map GameId -> Status
        var statusMap = new Dictionary<int, string>();
        foreach (var progress in progressData)
        {
            if (progress.DateFinished.HasValue)
            {
                statusMap[progress.GameId] = "Completed";
            }
            else
            {
                statusMap[progress.GameId] = "In Progress";
            }
        }

        return statusMap;
    }

    public virtual async Task<GameDto?> GetGameByIdAsync(int id)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();
        var repository = new GameRepository(dbContext);

        return await repository.GetByIdAsync(id);
    }

    public virtual async Task<GameDto> UpdateGameAsync(int id, GameDto gameDto)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();
        var repository = new GameRepository(dbContext);

        // Check if game exists
        var existingGame = await repository.GetByIdAsync(id);
        if (existingGame == null)
        {
            throw new InvalidOperationException($"No game found with ID {id}");
        }

        // Check if title is changing and conflicts with another game
        if (existingGame.Title != gameDto.Title && await repository.ExistsByTitleAsync(gameDto.Title, id))
        {
            throw new InvalidOperationException($"A game with the title '{gameDto.Title}' already exists");
        }

        // Update properties
        existingGame.Title = gameDto.Title;
        existingGame.Developer = gameDto.Developer;
        existingGame.Publisher = gameDto.Publisher;
        existingGame.FirstReleased = gameDto.FirstReleased;
        existingGame.RegionFirstReleasedIn = gameDto.RegionFirstReleasedIn;
        existingGame.ReleasedInEuPalOrNa = gameDto.ReleasedInEuPalOrNa;

        return await repository.UpdateAsync(existingGame);
    }

    public virtual async Task<bool> DeleteGameAsync(int id)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();
        var repository = new GameRepository(dbContext);

        return await repository.DeleteAsync(id);
    }

    public virtual async Task UpdateExclusionAsync(int gameId, bool exclude, string? reason = null)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();
        var repository = new GameRepository(dbContext);

        var existingExclusion = await repository.GetExclusionAsync(gameId);

        if (exclude)
        {
            if (existingExclusion != null)
            {
                // Update existing exclusion reason
                await repository.UpdateExclusionAsync(gameId, reason ?? "No reason provided");
            }
            else
            {
                // Add new exclusion
                await repository.AddExclusionAsync(gameId, reason ?? "No reason provided");
            }
        }
        else
        {
            // Remove exclusion if it exists
            if (existingExclusion != null)
            {
                await repository.RemoveExclusionAsync(gameId);
            }
        }
    }

    public virtual async Task UpdateOwnershipAsync(int gameId, bool ownPhysicalCopy, string typeOwned)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();
        var repository = new GameRepository(dbContext);

        var existingOwnership = await repository.GetOwnershipAsync(gameId);

        if (ownPhysicalCopy)
        {
            if (existingOwnership != null)
            {
                // Update existing ownership
                await repository.UpdateOwnershipAsync(gameId, ownPhysicalCopy, typeOwned);
            }
            else
            {
                // Add new ownership
                await repository.AddOwnershipAsync(gameId, ownPhysicalCopy, typeOwned);
            }
        }
        else
        {
            // Remove ownership if it exists
            if (existingOwnership != null)
            {
                await repository.RemoveOwnershipAsync(gameId);
            }
        }
    }

    public virtual async Task<List<OwnershipType>> GetAllOwnershipTypesAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        return await dbContext.OwnershipTypes
            .OrderBy(ot => ot.TypeOwned)
            .ToListAsync();
    }

    /// <summary>
    /// Adds a serial number for a game by title.
    /// Throws InvalidOperationException if game not found, or if serial number already exists.
    /// </summary>
    public virtual async Task<GameSerialNumber> AddSerialNumberAsync(string title, string serialNumber, string? region, string? notes)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        // Find the game by title
        var game = await dbContext.Games
            .FirstOrDefaultAsync(g => g.Title == title);

        if (game == null)
        {
            throw new InvalidOperationException($"No game found with title '{title}'");
        }

        // Check if serial number already exists
        var existingSerial = await dbContext.GameSerialNumbers
            .FirstOrDefaultAsync(gsn => gsn.SerialNumber == serialNumber);

        if (existingSerial != null)
        {
            var existingGame = await dbContext.Games.FindAsync(existingSerial.GameId);
            throw new InvalidOperationException(
                $"Serial number '{serialNumber}' already exists for game ID {existingSerial.GameId} ('{existingGame?.Title ?? "Unknown"}')");
        }

        // Create serial number entry
        var gameSerialNumber = new GameSerialNumber
        {
            GameId = game.Id,
            SerialNumber = serialNumber,
            Region = region,
            Notes = notes
        };

        dbContext.GameSerialNumbers.Add(gameSerialNumber);
        await dbContext.SaveChangesAsync();

        return gameSerialNumber;
    }
}
