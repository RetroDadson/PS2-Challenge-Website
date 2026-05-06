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
        using var scope = _serviceProvider.CreateScope();
        var refreshService = scope.ServiceProvider.GetRequiredService<CoverImageRefreshService>();
        var hubContext = scope.ServiceProvider.GetRequiredService<IHubContext<GamesHub>>();

        var updatedCount = await refreshService.RefreshCoverImagesAsync(cancellationToken);
        if (updatedCount <= 0)
        {
            return;
        }

        await hubContext.Clients.All.SendAsync("GamesUpdated", cancellationToken);
        _logger.LogInformation("Sent GamesUpdated notification to connected clients");
    }
}
