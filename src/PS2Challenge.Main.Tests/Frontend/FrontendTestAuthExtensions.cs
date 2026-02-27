using Bunit;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using System.Security.Claims;

namespace PS2Challenge.Main.Tests.Frontend;

internal static class FrontendTestAuthExtensions
{
    public static AuthenticationState AddTestAuthentication(this BunitContext context, ClaimsPrincipal user)
    {
        var authStateProvider = new Mock<AuthenticationStateProvider>();
        var authState = new AuthenticationState(user);
        authStateProvider.Setup(x => x.GetAuthenticationStateAsync()).ReturnsAsync(authState);

        context.Services.AddSingleton(authStateProvider.Object);
        context.Services.AddAuthorizationCore();

        var authorizationService = new Mock<IAuthorizationService>();
        authorizationService.Setup(x => x.AuthorizeAsync(
                It.IsAny<ClaimsPrincipal>(),
                It.IsAny<object>(),
                It.IsAny<IEnumerable<IAuthorizationRequirement>>()))
            .ReturnsAsync((ClaimsPrincipal principal, object resource, IEnumerable<IAuthorizationRequirement> requirements) =>
                principal.Identity?.IsAuthenticated == true
                    ? AuthorizationResult.Success()
                    : AuthorizationResult.Failed());

        context.Services.AddSingleton(authorizationService.Object);

        return authState;
    }

    public static IRenderedComponent<TComponent> RenderWithAuthState<TComponent>(
        this BunitContext context,
        AuthenticationState authState) where TComponent : IComponent
    {
        var authStateTask = Task.FromResult(authState);

        return context.Render<TComponent>(builder =>
        {
            builder.OpenComponent<CascadingValue<Task<AuthenticationState>>>(0);
            builder.AddComponentParameter(1, "Value", authStateTask);
            builder.AddComponentParameter(2, "ChildContent", (RenderFragment)(childBuilder =>
            {
                childBuilder.OpenComponent<TComponent>(0);
                childBuilder.CloseComponent();
            }));
            builder.CloseComponent();
        });
    }
}