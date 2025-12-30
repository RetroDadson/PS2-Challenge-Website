using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using PS2Challenge.Main.Api.Models;

namespace PS2Challenge.Main.Api.Controllers;

/// <summary>
/// Provides health check endpoints for monitoring application status
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    private readonly HealthCheckService _healthCheckService;
    private readonly ILogger<HealthController> _logger;

    public HealthController(HealthCheckService healthCheckService, ILogger<HealthController> logger)
    {
        _healthCheckService = healthCheckService;
        _logger = logger;
    }

    /// <summary>
    /// Get detailed health status of the application and its dependencies
    /// </summary>
    /// <returns>Health check report including overall status and individual component health</returns>
    /// <response code="200">Application is healthy</response>
    /// <response code="503">Application is unhealthy or degraded</response>
    /// <remarks>
    /// This endpoint checks the health of the application including:
    /// - Database connectivity
    /// - Overall application status
    /// 
    /// Status values:
    /// - Healthy: All checks passed
    /// - Degraded: Some non-critical checks failed
    /// - Unhealthy: Critical checks failed
    /// </remarks>
    [HttpGet]
    [ProducesResponseType(typeof(HealthCheckResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(HealthCheckResponse), StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> GetHealth()
    {
        try
        {
            var healthReport = await _healthCheckService.CheckHealthAsync();

            var response = new HealthCheckResponse
            {
                Status = healthReport.Status.ToString(),
                TotalDuration = healthReport.TotalDuration,
                Checks = healthReport.Entries.Select(entry => new HealthCheckEntry
                {
                    Name = entry.Key,
                    Status = entry.Value.Status.ToString(),
                    Description = entry.Value.Description,
                    Duration = entry.Value.Duration,
                    Tags = entry.Value.Tags.ToList(),
                    Exception = entry.Value.Exception?.Message
                }).ToList()
            };

            if (healthReport.Status == HealthStatus.Healthy)
            {
                return Ok(response);
            }

            _logger.LogWarning("Health check failed: {Status}", healthReport.Status);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error performing health check");
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new HealthCheckResponse
            {
                Status = "Unhealthy",
                Checks = new List<HealthCheckEntry>
                {
                    new HealthCheckEntry
                    {
                        Name = "health-check-service",
                        Status = "Unhealthy",
                        Exception = ex.Message
                    }
                }
            });
        }
    }

    /// <summary>
    /// Simple ping endpoint to verify API availability
    /// </summary>
    /// <returns>Simple status message</returns>
    /// <response code="200">API is running</response>
    [HttpGet("ping")]
    [ProducesResponseType(typeof(PingResponse), StatusCodes.Status200OK)]
    public IActionResult Ping()
    {
        return Ok(new PingResponse
        {
            Status = "OK",
            Timestamp = DateTime.UtcNow,
            Message = "PS2 Challenge API is running"
        });
    }
}
