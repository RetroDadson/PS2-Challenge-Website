using Microsoft.Extensions.Logging;
using PS2Challenge.Backend.Models;

namespace PS2Challenge.Backend.Services;

/// <summary>
/// Refreshes stored game cover image URLs from known game serial numbers.
/// </summary>
public class CoverImageRefreshService
{
    private readonly GameService _gameService;
    private readonly GameCoverService _coverService;
    private readonly ILogger<CoverImageRefreshService> _logger;

    public CoverImageRefreshService(
        GameService gameService,
        GameCoverService coverService,
        ILogger<CoverImageRefreshService> logger)
    {
        _gameService = gameService;
        _coverService = coverService;
        _logger = logger;
    }

    public virtual async Task<int> RefreshCoverImagesAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Starting cover image update process");

        try
        {
            var games = await _gameService.GetAllGamesAsync();
            var gamesList = games.ToList();

            if (_logger.IsEnabled(LogLevel.Information))
            {
                _logger.LogInformation("Updating cover URLs for {GameCount} games", gamesList.Count);
            }

            var coverUrls = await _coverService.GetCoverUrlsAsync(gamesList.Select(g => g.Id));
            var updatedCount = await UpdateCoverUrlsAsync(gamesList, coverUrls, cancellationToken);

            if (_logger.IsEnabled(LogLevel.Information))
            {
                _logger.LogInformation(
                    "Cover image update completed. Updated {UpdatedCount} out of {TotalCount} games",
                    updatedCount,
                    gamesList.Count);
            }

            return updatedCount;
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException("Failed to update cover images.", ex);
        }
    }

    private async Task<int> UpdateCoverUrlsAsync(
        List<GameDto> games,
        Dictionary<int, string> coverUrls,
        CancellationToken cancellationToken)
    {
        var updatedCount = 0;

        foreach (var game in games)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                break;
            }

            var coverUrl = coverUrls.GetValueOrDefault(game.Id);
            if (game.ImageUrl == coverUrl)
            {
                continue;
            }

            await _gameService.UpdateGameCoverUrlAsync(game.Id, coverUrl);
            updatedCount++;
        }

        return updatedCount;
    }
}
