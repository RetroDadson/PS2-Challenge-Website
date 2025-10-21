using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PS2Challenge.Backend.Data;

namespace PS2Challenge.Backend.Tests.Helpers;

/// <summary>
/// Helper class to create in-memory database contexts for testing
/// </summary>
public static class TestDbContextFactory
{
    /// <summary>
    /// Creates a new in-memory database context with a unique database name
    /// </summary>
    public static Ps2ChallengeDbContext CreateInMemoryContext()
    {
        var options = new DbContextOptionsBuilder<Ps2ChallengeDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        return new Ps2ChallengeDbContext(options);
    }

    /// <summary>
    /// Creates a service scope factory for testing services that require IServiceScopeFactory
    /// </summary>
    public static IServiceScopeFactory CreateServiceScopeFactory(Ps2ChallengeDbContext context)
    {
        var services = new ServiceCollection();
        services.AddScoped(_ => context);
        var serviceProvider = services.BuildServiceProvider();

        var scopeFactory = new TestServiceScopeFactory(serviceProvider);
        return scopeFactory;
    }

    private class TestServiceScopeFactory : IServiceScopeFactory
    {
        private readonly IServiceProvider _serviceProvider;

        public TestServiceScopeFactory(IServiceProvider serviceProvider)
        {
            _serviceProvider = serviceProvider;
        }

        public IServiceScope CreateScope()
        {
            return new TestServiceScope(_serviceProvider);
        }
    }

    private class TestServiceScope : IServiceScope
    {
        public TestServiceScope(IServiceProvider serviceProvider)
        {
            ServiceProvider = serviceProvider;
        }

        public IServiceProvider ServiceProvider { get; }

        public void Dispose()
        {
            // No-op for test scope
        }
    }
}
