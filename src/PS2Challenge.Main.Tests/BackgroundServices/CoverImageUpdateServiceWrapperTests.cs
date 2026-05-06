using System.Reflection;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using PS2Challenge.Backend.Services;
using PS2Challenge.Main.Api.Hubs;
using PS2Challenge.Main.BackgroundServices;

namespace PS2Challenge.Main.Tests.BackgroundServices;

public class CoverImageUpdateServiceWrapperTests
{
    [Fact]
    public async Task UpdateCoverImagesAsync_SendsGamesUpdated_WhenCoversChanged()
    {
        var (wrapper, clientProxy) = CreateWrapper(updatedCount: 2);

        await InvokeUpdateAsync(wrapper);

        clientProxy.Verify(
            client => client.SendCoreAsync(
                "GamesUpdated",
                It.Is<object?[]>(args => args.Length == 0),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task UpdateCoverImagesAsync_DoesNotNotify_WhenNoCoversChanged()
    {
        var (wrapper, clientProxy) = CreateWrapper(updatedCount: 0);

        await InvokeUpdateAsync(wrapper);

        clientProxy.Verify(
            client => client.SendCoreAsync(
                "GamesUpdated",
                It.IsAny<object?[]>(),
                It.IsAny<CancellationToken>()),
            Times.Never);
    }

    private static (CoverImageUpdateServiceWrapper Wrapper, Mock<IClientProxy> ClientProxy) CreateWrapper(int updatedCount)
    {
        var clientProxy = new Mock<IClientProxy>();
        clientProxy
            .Setup(client => client.SendCoreAsync(
                "GamesUpdated",
                It.IsAny<object?[]>(),
                It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var clients = new Mock<IHubClients>();
        clients.Setup(hubClients => hubClients.All).Returns(clientProxy.Object);

        var hubContext = new Mock<IHubContext<GamesHub>>();
        hubContext.Setup(context => context.Clients).Returns(clients.Object);

        var provider = new ServiceCollection()
            .AddSingleton<CoverImageRefreshService>(new FakeCoverImageRefreshService(updatedCount))
            .AddSingleton(hubContext.Object)
            .BuildServiceProvider();

        var wrapper = new CoverImageUpdateServiceWrapper(
            provider,
            NullLogger<CoverImageUpdateServiceWrapper>.Instance);

        return (wrapper, clientProxy);
    }

    private static async Task InvokeUpdateAsync(CoverImageUpdateServiceWrapper wrapper)
    {
        var updateMethod = typeof(CoverImageUpdateServiceWrapper).GetMethod(
            "UpdateCoverImagesAsync",
            BindingFlags.NonPublic | BindingFlags.Instance);

        Assert.NotNull(updateMethod);

        var task = (Task)updateMethod.Invoke(wrapper, [CancellationToken.None])!;
        await task;
    }

    private sealed class FakeCoverImageRefreshService : CoverImageRefreshService
    {
        private readonly int _updatedCount;

        public FakeCoverImageRefreshService(int updatedCount)
            : base(null!, null!, NullLogger<CoverImageRefreshService>.Instance)
        {
            _updatedCount = updatedCount;
        }

        public override Task<int> RefreshCoverImagesAsync(CancellationToken cancellationToken)
        {
            return Task.FromResult(_updatedCount);
        }
    }
}
