using Microsoft.EntityFrameworkCore;
using PS2Challenge.Backend.Data;

namespace PS2Challenge.Backend.Services;

/// <summary>
/// Service for generating PS2 game cover image URLs from the ps2-covers repository
/// </summary>
public class GameCoverService
{
    private readonly Ps2ChallengeDbContext _context;
    private const string CoverRepositoryBaseUrl = "https://raw.githubusercontent.com/xlenore/ps2-covers/main/covers/default";

    public GameCoverService(Ps2ChallengeDbContext context)
    {
        _context = context;
    }

    /// <summary>
    /// Gets the cover image URL for a game from the default covers folder
    /// </summary>
    /// <param name="gameId">The game ID</param>
    /// <returns>The full URL to the cover image, or null if no serial number is available</returns>
    public async Task<string?> GetCoverUrlAsync(int gameId)
    {
        // Get the first serial number for this game (prefer NTSC-U*, then PAL*, then NTSC-J*)
        var serialNumber = await _context.GameSerialNumbers
            .AsNoTracking()
            .Where(s => s.GameId == gameId)
            .OrderBy(s => s.Region != null && s.Region.StartsWith("NTSC-U") ? 0 
                        : s.Region != null && s.Region.StartsWith("PAL") ? 1 
                        : s.Region != null && s.Region.StartsWith("NTSC-J") ? 2 
                        : 3)
            .Select(s => s.SerialNumber)
            .FirstOrDefaultAsync();

        if (string.IsNullOrWhiteSpace(serialNumber))
        {
            return null;
        }

        // Format the serial number for the URL (e.g., SLUS-20062 -> SLUS-20062)
        var formattedSerial = serialNumber.Trim().ToUpperInvariant();

        // Return URL for default cover
        return $"{CoverRepositoryBaseUrl}/{formattedSerial}.jpg";
    }

    /// <summary>
    /// Gets cover URLs for multiple games in a single database query
    /// </summary>
    /// <param name="gameIds">Collection of game IDs</param>
    /// <returns>Dictionary mapping game IDs to their cover URLs</returns>
    public async Task<Dictionary<int, string>> GetCoverUrlsAsync(IEnumerable<int> gameIds)
    {
        var gameIdsList = gameIds.ToList();
        
        // Get the first serial number for each game
        var serialNumbers = await _context.GameSerialNumbers
            .AsNoTracking()
            .Where(s => gameIdsList.Contains(s.GameId))
            .GroupBy(s => s.GameId)
            .Select(g => new
            {
                GameId = g.Key,
                SerialNumber = g.OrderBy(s => s.Region != null && s.Region.StartsWith("NTSC-U") ? 0 
                                            : s.Region != null && s.Region.StartsWith("PAL") ? 1 
                                            : s.Region != null && s.Region.StartsWith("NTSC-J") ? 2 
                                            : 3)
                                .Select(s => s.SerialNumber)
                                .FirstOrDefault()
            })
            .Where(x => x.SerialNumber != null)
            .ToDictionaryAsync(x => x.GameId, x => x.SerialNumber!);

        // Generate URLs
        return serialNumbers.ToDictionary(
            kvp => kvp.Key,
            kvp => $"{CoverRepositoryBaseUrl}/{kvp.Value.Trim().ToUpperInvariant()}.jpg"
        );
    }
}
