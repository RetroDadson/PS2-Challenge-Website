using Microsoft.EntityFrameworkCore;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Helpers;

namespace PS2Challenge.Backend.Data.Repositories;

public class GameRepository
{
    private readonly Ps2ChallengeDbContext _dbContext;

    public GameRepository(Ps2ChallengeDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<GameDto?> GetByIdAsync(int id)
    {
        var game = await _dbContext.Games.FindAsync(id);
        if (game == null) return null;

        // Load related data
        var isExcluded = await _dbContext.ExcludedGames.AnyAsync(e => e.GameId == id);
        var isOwned = await _dbContext.GamesOwned.AnyAsync(o => o.GameId == id);

        game.IsExcluded = isExcluded;
        game.IsOwned = isOwned;

        return game;
    }

    public async Task<GameDto> CreateAsync(GameDto game)
    {
        _dbContext.Games.Add(game);
        await _dbContext.SaveChangesAsync();
        return game;
    }

    public async Task<GameDto> UpdateAsync(GameDto game)
    {
        _dbContext.Games.Update(game);
        await _dbContext.SaveChangesAsync();
        return game;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var game = await _dbContext.Games.FindAsync(id);
        if (game == null) return false;

        // Remove related records first
        var exclusions = _dbContext.ExcludedGames.Where(e => e.GameId == id);
        _dbContext.ExcludedGames.RemoveRange(exclusions);

        var ownerships = _dbContext.GamesOwned.Where(o => o.GameId == id);
        _dbContext.GamesOwned.RemoveRange(ownerships);

        var progress = _dbContext.GameProgress.Where(p => p.GameId == id);
        _dbContext.GameProgress.RemoveRange(progress);

        _dbContext.Games.Remove(game);
        await _dbContext.SaveChangesAsync();
        return true;
    }

    public async Task<ExcludedGame?> GetExclusionAsync(int gameId)
    {
        return await _dbContext.ExcludedGames.FirstOrDefaultAsync(e => e.GameId == gameId);
    }

    public async Task<ExcludedGame> AddExclusionAsync(int gameId, string reason)
    {
        var exclusion = new ExcludedGame
        {
            GameId = gameId,
            Reason = reason
        };
        _dbContext.ExcludedGames.Add(exclusion);
        await _dbContext.SaveChangesAsync();
        return exclusion;
    }

    public async Task<ExcludedGame?> UpdateExclusionAsync(int gameId, string reason)
    {
        var exclusion = await _dbContext.ExcludedGames.FirstOrDefaultAsync(e => e.GameId == gameId);
        if (exclusion == null) return null;

        exclusion.Reason = reason;
        await _dbContext.SaveChangesAsync();
        return exclusion;
    }

    public async Task<bool> RemoveExclusionAsync(int gameId)
    {
        var exclusion = await _dbContext.ExcludedGames.FirstOrDefaultAsync(e => e.GameId == gameId);
        if (exclusion == null) return false;

        _dbContext.ExcludedGames.Remove(exclusion);
        await _dbContext.SaveChangesAsync();
        return true;
    }

    public async Task<GameOwned?> GetOwnershipAsync(int gameId)
    {
        return await _dbContext.GamesOwned.FirstOrDefaultAsync(o => o.GameId == gameId);
    }

    public async Task<GameOwned> AddOwnershipAsync(int gameId, bool ownPhysicalCopy, string typeOwned)
    {
        var ownership = new GameOwned
        {
            GameId = gameId,
            OwnPhysicalCopy = ownPhysicalCopy,
            TypeOwned = typeOwned
        };
        _dbContext.GamesOwned.Add(ownership);
        await _dbContext.SaveChangesAsync();
        return ownership;
    }

    public async Task<GameOwned?> UpdateOwnershipAsync(int gameId, bool ownPhysicalCopy, string typeOwned)
    {
        var ownership = await _dbContext.GamesOwned.FirstOrDefaultAsync(o => o.GameId == gameId);
        if (ownership == null) return null;

        ownership.OwnPhysicalCopy = ownPhysicalCopy;
        ownership.TypeOwned = typeOwned;
        await _dbContext.SaveChangesAsync();
        return ownership;
    }

    public async Task<bool> RemoveOwnershipAsync(int gameId)
    {
        var ownership = await _dbContext.GamesOwned.FirstOrDefaultAsync(o => o.GameId == gameId);
        if (ownership == null) return false;

        _dbContext.GamesOwned.Remove(ownership);
        await _dbContext.SaveChangesAsync();
        return true;
    }

    public async Task<bool> ExistsByTitleAsync(string title, int? excludeId = null)
    {
        if (string.IsNullOrWhiteSpace(title))
            return false;

        var trimmedTitle = title.Trim();

        // Step 1: Try exact match (case-insensitive)
        var query = _dbContext.Games.Where(g => EF.Functions.Like(g.Title.ToLower(), trimmedTitle.ToLower()));
        if (excludeId.HasValue)
        {
            query = query.Where(g => g.Id != excludeId.Value);
        }

        if (await query.AnyAsync())
            return true;

        // Step 2: Try normalized fuzzy match
        var normalizedSearch = TitleMatchingHelper.NormalizeTitle(trimmedTitle);
        var games = excludeId.HasValue 
            ? await _dbContext.Games.Where(g => g.Id != excludeId.Value).ToListAsync()
            : await _dbContext.Games.ToListAsync();
        
        var fuzzyMatch = games
            .Any(g => TitleMatchingHelper.NormalizeTitle(g.Title) == normalizedSearch);

        return fuzzyMatch;
    }
}
