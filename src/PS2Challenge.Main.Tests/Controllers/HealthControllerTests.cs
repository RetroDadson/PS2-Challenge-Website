using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Moq;
using PS2Challenge.Main.Api.Controllers;

namespace PS2Challenge.Main.Tests.Controllers;

public class HealthControllerTests
{
    private static readonly string[] DatabaseTags = ["db"];

    private readonly Mock<HealthCheckService> _healthCheckService;
    private readonly Mock<ILogger<HealthController>> _logger;
    private readonly HealthController _controller;

    public HealthControllerTests()
    {
        _healthCheckService = new Mock<HealthCheckService>();
        _logger = new Mock<ILogger<HealthController>>();
        _controller = new HealthController(_healthCheckService.Object, _logger.Object);
    }

    [Fact]
    public async Task GetHealth_ReturnsOk_WhenHealthy()
    {
        var report = new HealthReport(
            new Dictionary<string, HealthReportEntry>
            {
                ["db"] = new HealthReportEntry(
                    HealthStatus.Healthy,
                    "Database OK",
                    TimeSpan.FromMilliseconds(10),
                    null,
                    new Dictionary<string, object>(),
                    DatabaseTags)
            },
            TimeSpan.FromMilliseconds(12));

        _healthCheckService
            .Setup(s => s.CheckHealthAsync(It.IsAny<Func<HealthCheckRegistration, bool>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(report);

        var result = await _controller.GetHealth();

        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(ok.Value);
    }

    [Fact]
    public async Task GetHealth_ReturnsServiceUnavailable_WhenDegraded()
    {
        var report = new HealthReport(
            new Dictionary<string, HealthReportEntry>
            {
                ["db"] = new HealthReportEntry(
                    HealthStatus.Degraded,
                    "Slow",
                    TimeSpan.FromMilliseconds(150),
                    null,
                    new Dictionary<string, object>(),
                    DatabaseTags)
            },
            TimeSpan.FromMilliseconds(160));

        _healthCheckService
            .Setup(s => s.CheckHealthAsync(It.IsAny<Func<HealthCheckRegistration, bool>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(report);

        var result = await _controller.GetHealth();

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, objectResult.StatusCode);
    }

    [Fact]
    public async Task GetHealth_ReturnsServiceUnavailable_WhenExceptionThrown()
    {
        _healthCheckService
            .Setup(s => s.CheckHealthAsync(It.IsAny<Func<HealthCheckRegistration, bool>>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("Health provider error"));

        var result = await _controller.GetHealth();

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, objectResult.StatusCode);
    }

    [Fact]
    public void Ping_ReturnsOk()
    {
        var result = _controller.Ping();

        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(ok.Value);
    }
}
