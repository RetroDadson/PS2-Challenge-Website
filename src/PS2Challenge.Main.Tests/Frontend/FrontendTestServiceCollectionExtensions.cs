using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Moq;

namespace PS2Challenge.Main.Tests.Frontend;

internal static class FrontendTestServiceCollectionExtensions
{
    public static IServiceCollection AddMockHubContext<THub>(this IServiceCollection services)
        where THub : Hub
    {
        var mockClientProxy = new Mock<IClientProxy>();
        mockClientProxy.Setup(x => x.SendCoreAsync(
                It.IsAny<string>(),
                It.IsAny<object?[]>(),
                It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var mockHubClients = new Mock<IHubClients>();
        mockHubClients.Setup(x => x.All).Returns(mockClientProxy.Object);

        var mockHubContext = new Mock<IHubContext<THub>>();
        mockHubContext.Setup(x => x.Clients).Returns(mockHubClients.Object);

        services.AddSingleton(mockHubContext.Object);

        return services;
    }
}