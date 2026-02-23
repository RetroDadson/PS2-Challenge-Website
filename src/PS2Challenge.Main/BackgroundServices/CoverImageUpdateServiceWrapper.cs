using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using PS2Challenge.Backend.Services;
using PS2Challenge.Main.Api.Hubs;

namespace PS2Challenge.Main.BackgroundServices;

/// <summary>
/// Wrapper for the CoverImageUpdateService that adds SignalR notifications
/// </summary>
public class CoverImageUpdateServiceWrapper : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<CoverImageUpdateServiceWrapper> _logger;
    private readonly TimeSpan _updateInterval = TimeSpan.FromHours(24); // Update once per day

    public CoverImageUpdateServiceWrapper(
        IServiceProvider serviceProvider,
        ILogger<CoverImageUpdateServiceWrapper> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Cover Image Update Service Wrapper is starting");

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

        _logger.LogInformation("Cover Image Update Service Wrapper is stopping");
    }

    private async Task UpdateCoverImagesAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Starting cover image update process");

        using var scope = _serviceProvider.CreateScope();
        var coverService = scope.ServiceProvider.GetRequiredService<GameCoverService>();
        var gameService = scope.ServiceProvider.GetRequiredService<GameService>();
        var hubContext = scope.ServiceProvider.GetRequiredService<IHubContext<GamesHub>>();

        try
        {
            // Get all games
            var games = await gameService.GetAllGamesAsync();
            var gamesList = games.ToList();

            _logger.LogInformation("Updating cover URLs for {GameCount} games", gamesList.Count);

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

            _logger.LogInformation(
                "Cover image update completed. Updated {UpdatedCount} out of {TotalCount} games",
                updatedCount,
                gamesList.Count);

            // Notify connected clients that game data (including cover images) has been updated
            if (updatedCount > 0)
            {
                await hubContext.Clients.All.SendAsync("GamesUpdated", cancellationToken);
                _logger.LogInformation("Sent GamesUpdated notification to connected clients");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update cover images");
            throw;
        }
    }
}
