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
        using var scope = _serviceProvider.CreateScope();
        var refreshService = scope.ServiceProvider.GetRequiredService<CoverImageRefreshService>();
        await refreshService.RefreshCoverImagesAsync(cancellationToken);
    }
}
