using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using PS2Challenge.Backend.Services;

namespace PS2Challenge.Backend.BackgroundServices;

/// <summary>
/// Background service that periodically updates game cover image URLs from the ps2-covers repository
/// </summary>
public class CoverImageUpdateService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<CoverImageUpdateService> _logger;
    private readonly TimeSpan _updateInterval = TimeSpan.FromHours(24); // Update once per day

    public CoverImageUpdateService(
        IServiceProvider serviceProvider,
        ILogger<CoverImageUpdateService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Cover Image Update Service is starting");

        // Wait 1 minute after startup before first update
        await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await UpdateCoverImagesAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while updating cover images");
            }

            // Wait for the next update interval
            await Task.Delay(_updateInterval, stoppingToken);
        }

        _logger.LogInformation("Cover Image Update Service is stopping");
    }

    private async Task UpdateCoverImagesAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Starting cover image update process");

        using var scope = _serviceProvider.CreateScope();
        var coverService = scope.ServiceProvider.GetRequiredService<GameCoverService>();
        var gameService = scope.ServiceProvider.GetRequiredService<GameService>();

        try
        {
            // Get all games
            var games = await gameService.GetAllGamesAsync();
            var gamesList = games.ToList();

            if (_logger.IsEnabled(LogLevel.Information))
            {
                _logger.LogInformation("Updating cover URLs for {GameCount} games", gamesList.Count);
            }

            // Get cover URLs for all games in batch
            var gameIds = gamesList.Select(g => g.Id);
            var coverUrls = await coverService.GetCoverUrlsAsync(gameIds);

            // Update each game's ImageUrl
            int updatedCount = 0;
            foreach (var game in gamesList)
            {
                if (cancellationToken.IsCancellationRequested)
                    break;

                if (coverUrls.TryGetValue(game.Id, out var coverUrl))
                {
                    // Only update if the URL has changed or is null
                    if (game.ImageUrl != coverUrl)
                    {
                        await gameService.UpdateGameCoverUrlAsync(game.Id, coverUrl);
                        updatedCount++;
                    }
                }
                else
                {
                    // No serial number = no cover
                    if (game.ImageUrl != null)
                    {
                        await gameService.UpdateGameCoverUrlAsync(game.Id, null);
                        updatedCount++;
                    }
                }
            }

            if (_logger.IsEnabled(LogLevel.Information))
            {
                _logger.LogInformation(
                    "Cover image update completed. Updated {UpdatedCount} out of {TotalCount} games",
                    updatedCount,
                    gamesList.Count);
            }
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException("Failed to update cover images.", ex);
        }
    }
}
