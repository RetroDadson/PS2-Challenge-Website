using Bunit;
using Microsoft.AspNetCore.Components.Authorization;
using System.Security.Claims;
using PS2Challenge.Main.Frontend.Shared;

namespace PS2Challenge.Main.Tests.Frontend;

public class NavMenuTests : BunitContext
{
    private readonly AuthenticationState _authState;

    public NavMenuTests()
    {
        _authState = this.AddTestAuthentication(new ClaimsPrincipal(new ClaimsIdentity()));
    }

    private IRenderedComponent<NavMenu> RenderNavMenu()
    {
        return this.RenderWithAuthState<NavMenu>(_authState);
    }

    [Fact]
    public void NavMenu_DefaultsToExpanded()
    {
        var cut = RenderNavMenu();

        var navMenu = cut.Find(".nav-menu");
        Assert.DoesNotContain("collapsed", navMenu.ClassList);
    }

    [Fact]
    public void NavMenu_ToggleButton_CollapsesAndExpandsMenu()
    {
        var cut = RenderNavMenu();

        var toggleButton = cut.Find(".nav-toggle");
        toggleButton.Click();
        Assert.Contains("collapsed", cut.Find(".nav-menu").ClassList);

        toggleButton.Click();
        Assert.DoesNotContain("collapsed", cut.Find(".nav-menu").ClassList);
    }

    [Fact]
    public void NavMenu_ChallengeToggle_OpensAndClosesDropdown()
    {
        var cut = RenderNavMenu();

        var challengeToggle = cut.Find(".dropdown-toggle");
        challengeToggle.Click();
        Assert.Contains("open", cut.Find("li.dropdown").ClassList);

        challengeToggle.Click();
        Assert.DoesNotContain("open", cut.Find("li.dropdown").ClassList);
    }

    [Fact]
    public void NavMenu_ClosingMainMenu_AlsoClosesChallengeDropdown()
    {
        var cut = RenderNavMenu();

        cut.Find(".dropdown-toggle").Click();
        Assert.Contains("open", cut.Find("li.dropdown").ClassList);

        cut.Find(".nav-toggle").Click();
        Assert.DoesNotContain("open", cut.Find("li.dropdown").ClassList);
        Assert.Contains("collapsed", cut.Find(".nav-menu").ClassList);
    }
}
