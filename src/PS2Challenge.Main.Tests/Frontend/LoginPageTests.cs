using Bunit;
using PS2Challenge.Main.Frontend.Pages;

namespace PS2Challenge.Main.Tests.Frontend;

public class LoginPageTests : BunitContext
{
    [Fact]
    public void LoginPage_UsesReturnUrlFromQuery_WhenProvided()
    {
        var nav = Services.GetRequiredService<Microsoft.AspNetCore.Components.NavigationManager>();
        nav.NavigateTo("/login?returnUrl=/votes", forceLoad: false);

        var cut = Render<Login>();

        var loginLink = cut.Find("a.btn.btn-twitch");
        var href = loginLink.GetAttribute("href") ?? string.Empty;
        Assert.Contains("/api/auth/login?returnUrl=%2Fvotes", href);
    }

    [Fact]
    public void LoginPage_DefaultsToHomeReturnUrl_WhenMissing()
    {
        var nav = Services.GetRequiredService<Microsoft.AspNetCore.Components.NavigationManager>();
        nav.NavigateTo("/login", forceLoad: false);

        var cut = Render<Login>();

        var loginLink = cut.Find("a.btn.btn-twitch");
        var href = loginLink.GetAttribute("href") ?? string.Empty;
        Assert.Contains("/api/auth/login?returnUrl=%2F", href);
    }
}
