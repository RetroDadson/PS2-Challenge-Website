namespace PS2Challenge.Main.Api.Models;

/// <summary>
/// Health check response model
/// </summary>
public class HealthCheckResponse
{
    /// <summary>
    /// Overall health status (Healthy, Degraded, or Unhealthy)
    /// </summary>
    public string Status { get; set; } = string.Empty;

    /// <summary>
    /// Total duration of all health checks
    /// </summary>
    public TimeSpan TotalDuration { get; set; }

    /// <summary>
    /// Individual health check results
    /// </summary>
    public List<HealthCheckEntry> Checks { get; set; } = new();
}

/// <summary>
/// Individual health check entry
/// </summary>
public class HealthCheckEntry
{
    /// <summary>
    /// Name of the health check
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Status of this health check (Healthy, Degraded, or Unhealthy)
    /// </summary>
    public string Status { get; set; } = string.Empty;

    /// <summary>
    /// Description of the health check
    /// </summary>
    public string? Description { get; set; }

    /// <summary>
    /// Duration of this health check
    /// </summary>
    public TimeSpan Duration { get; set; }

    /// <summary>
    /// Tags associated with this health check
    /// </summary>
    public List<string> Tags { get; set; } = new();

    /// <summary>
    /// Exception message if the health check failed
    /// </summary>
    public string? Exception { get; set; }
}

/// <summary>
/// Ping response model
/// </summary>
public class PingResponse
{
    /// <summary>
    /// Status indicator (OK)
    /// </summary>
    public string Status { get; set; } = string.Empty;

    /// <summary>
    /// Current UTC timestamp
    /// </summary>
    public DateTime Timestamp { get; set; }

    /// <summary>
    /// Status message
    /// </summary>
    public string Message { get; set; } = string.Empty;
}
