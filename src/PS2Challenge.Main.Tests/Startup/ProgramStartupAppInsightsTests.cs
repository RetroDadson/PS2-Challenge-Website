using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using PS2Challenge.Main.Api.Controllers;

namespace PS2Challenge.Main.Tests.Startup;

public sealed class ProgramStartupAppInsightsTests
{
    private const string ConnectionStringVariableName = "APPLICATIONINSIGHTS_CONNECTION_STRING";
    private const string InstrumentationKeyVariableName = "APPINSIGHTS_INSTRUMENTATIONKEY";

    [Fact]
    public void ConfigureApplicationInsights_DoesNotRegisterTelemetry_WhenNoEnvironmentVariablesExist()
    {
        using var _ = new AppInsightsEnvironmentScope(connectionString: null, instrumentationKey: null);

        var services = new ServiceCollection();
        var telemetryServiceCountBefore = CountTelemetryServices(services);

        InvokeConfigureApplicationInsights(services);

        var telemetryServiceCountAfter = CountTelemetryServices(services);
        Assert.Equal(telemetryServiceCountBefore, telemetryServiceCountAfter);
    }

    [Fact]
    public void ResolveApplicationInsightsConnectionStringFromEnvironment_UsesConnectionString_WhenConfigured()
    {
        const string expectedConnectionString = "InstrumentationKey=conn-key;IngestionEndpoint=https://westeurope-1.in.applicationinsights.azure.com/";
        using var _ = new AppInsightsEnvironmentScope(connectionString: expectedConnectionString, instrumentationKey: null);

        var resolvedConnectionString = InvokeResolveApplicationInsightsConnectionStringFromEnvironment();

        Assert.Equal(expectedConnectionString, resolvedConnectionString);
    }

    [Fact]
    public void ConfigureApplicationInsights_RegistersTelemetry_WhenConnectionStringConfigured()
    {
        const string expectedConnectionString = "InstrumentationKey=conn-key;IngestionEndpoint=https://westeurope-1.in.applicationinsights.azure.com/";
        using var _ = new AppInsightsEnvironmentScope(connectionString: expectedConnectionString, instrumentationKey: null);

        var services = new ServiceCollection();
        var telemetryServiceCountBefore = CountTelemetryServices(services);

        InvokeConfigureApplicationInsights(services);

        var telemetryServiceCountAfter = CountTelemetryServices(services);
        Assert.True(telemetryServiceCountAfter > telemetryServiceCountBefore);
    }

    [Fact]
    public void ResolveApplicationInsightsConnectionStringFromEnvironment_UsesLegacyInstrumentationKeyFallback_WhenConnectionStringMissing()
    {
        const string instrumentationKey = "legacy-key-123";
        using var _ = new AppInsightsEnvironmentScope(connectionString: null, instrumentationKey: instrumentationKey);

        var resolvedConnectionString = InvokeResolveApplicationInsightsConnectionStringFromEnvironment();

        Assert.Equal($"InstrumentationKey={instrumentationKey}", resolvedConnectionString);
    }

    [Fact]
    public void ResolveApplicationInsightsConnectionStringFromEnvironment_ReturnsNull_WhenNoVariablesConfigured()
    {
        using var _ = new AppInsightsEnvironmentScope(connectionString: null, instrumentationKey: null);

        var resolvedConnectionString = InvokeResolveApplicationInsightsConnectionStringFromEnvironment();

        Assert.Null(resolvedConnectionString);
    }

    [Fact]
    public void ResolveApplicationInsightsConnectionStringFromEnvironment_PrefersConnectionString_WhenBothVariablesConfigured()
    {
        const string expectedConnectionString = "InstrumentationKey=preferred-conn-string";
        const string instrumentationKey = "legacy-key-ignored";
        using var _ = new AppInsightsEnvironmentScope(
            connectionString: expectedConnectionString,
            instrumentationKey: instrumentationKey);

        var resolvedConnectionString = InvokeResolveApplicationInsightsConnectionStringFromEnvironment();

        Assert.Equal(expectedConnectionString, resolvedConnectionString);
    }

    private static int CountTelemetryServices(IServiceCollection services)
    {
        return services.Count(descriptor =>
            descriptor.ServiceType.Namespace?.StartsWith("OpenTelemetry", StringComparison.Ordinal) == true
            || descriptor.ServiceType.Namespace?.StartsWith("Azure.Monitor.OpenTelemetry", StringComparison.Ordinal) == true
            || descriptor.ImplementationType?.Namespace?.StartsWith("OpenTelemetry", StringComparison.Ordinal) == true
            || descriptor.ImplementationType?.Namespace?.StartsWith("Azure.Monitor.OpenTelemetry", StringComparison.Ordinal) == true);
    }

    private static string? InvokeResolveApplicationInsightsConnectionStringFromEnvironment()
    {
        var startupType = typeof(HealthController).Assembly.GetType("PS2Challenge.Main.ProgramStartup");
        Assert.NotNull(startupType);

        var method = startupType.GetMethod(
            "ResolveApplicationInsightsConnectionStringFromEnvironment",
            BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        return (string?)method.Invoke(null, null);
    }

    private static void InvokeConfigureApplicationInsights(IServiceCollection services)
    {
        var startupType = typeof(HealthController).Assembly.GetType("PS2Challenge.Main.ProgramStartup");
        Assert.NotNull(startupType);

        var method = startupType.GetMethod(
            "ConfigureApplicationInsights",
            BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        method.Invoke(null, [services]);
    }

    private sealed class AppInsightsEnvironmentScope : IDisposable
    {
        private readonly string? _previousConnectionString;
        private readonly string? _previousInstrumentationKey;

        public AppInsightsEnvironmentScope(string? connectionString, string? instrumentationKey)
        {
            _previousConnectionString = Environment.GetEnvironmentVariable(ConnectionStringVariableName);
            _previousInstrumentationKey = Environment.GetEnvironmentVariable(InstrumentationKeyVariableName);

            Environment.SetEnvironmentVariable(ConnectionStringVariableName, connectionString);
            Environment.SetEnvironmentVariable(InstrumentationKeyVariableName, instrumentationKey);
        }

        public void Dispose()
        {
            Environment.SetEnvironmentVariable(ConnectionStringVariableName, _previousConnectionString);
            Environment.SetEnvironmentVariable(InstrumentationKeyVariableName, _previousInstrumentationKey);
        }
    }
}
