using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PS2Challenge.Backend.Data;
using PS2Challenge.Backend.Models;
using PS2Challenge.Main.Api.Hubs;
using PS2Challenge.Main.Frontend.Components;

namespace PS2Challenge.Main.Tests.Frontend;

public class GameProgressEditTests : BunitContext
{
    public GameProgressEditTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    [Fact]
    public async Task GameProgressEdit_CreateMode_ClampsCompletionAndSaves()
    {
        var db = CreateInMemoryDbContext();
        db.Games.Add(new GameDto { Id = 1, Title = "Known Game", Developer = "Dev", Publisher = "Pub", RegionFirstReleasedIn = "NA" });
        await db.SaveChangesAsync();
        var onSaveCalled = false;

        Services.AddSingleton(db);
        Services.AddMockHubContext<GamesHub>();

        var cut = Render<GameProgressEdit>(parameters => parameters
            .Add(p => p.IsVisible, true)
            .Add(p => p.IsEditMode, false)
            .Add(p => p.GameTitle, "Known Game")
            .Add(p => p.CompletionHours, -1)
            .Add(p => p.CompletionMinutes, 70)
            .Add(p => p.CompletionSeconds, -5)
            .Add(p => p.OnSave, EventCallback.Factory.Create(this, () => onSaveCalled = true)));

        cut.Find(".modal-footer .cta-button").Click();

        await cut.WaitForAssertionAsync(() => Assert.True(onSaveCalled));

        var saved = await db.GameProgress.SingleAsync();
        Assert.Equal(1, saved.GameId);
        Assert.Equal(TimeSpan.FromMinutes(59), saved.CompletionTime);
    }

    [Fact]
    public async Task GameProgressEdit_EditMode_UpdatesExistingProgress()
    {
        var db = CreateInMemoryDbContext();
        db.Games.Add(new GameDto { Id = 10, Title = "Target Game", Developer = "Dev", Publisher = "Pub", RegionFirstReleasedIn = "NA" });
        db.GameProgress.Add(new GameProgress
        {
            ProgressId = 7,
            GameId = 10,
            DateStarted = new DateOnly(2023, 1, 1),
            Platform = "Physical"
        });
        await db.SaveChangesAsync();

        Services.AddSingleton(db);
        Services.AddMockHubContext<GamesHub>();

        var cut = Render<GameProgressEdit>(parameters => parameters
            .Add(p => p.IsVisible, true)
            .Add(p => p.IsEditMode, true)
            .Add(p => p.ProgressId, 7)
            .Add(p => p.GameTitle, "Target Game")
            .Add(p => p.Platform, "Emulated")
            .Add(p => p.BeatenCriteria, "Any%")
            .Add(p => p.Review, "Great")
            .Add(p => p.CompletionHours, 3)
            .Add(p => p.CompletionMinutes, 5)
            .Add(p => p.CompletionSeconds, 0));

        cut.Find(".modal-footer .cta-button").Click();

        await Task.Delay(100);
        var updated = await db.GameProgress.SingleAsync(x => x.ProgressId == 7);
        Assert.Equal("Emulated", updated.Platform);
        Assert.Equal("Any%", updated.BeatenCriteria);
        Assert.Equal("Great", updated.Review);
        Assert.Equal(TimeSpan.FromHours(3) + TimeSpan.FromMinutes(5), updated.CompletionTime);
    }

    [Fact]
    public async Task GameProgressEdit_UnknownTitle_DoesNotCreateProgress()
    {
        var db = CreateInMemoryDbContext();

        Services.AddSingleton(db);
        Services.AddMockHubContext<GamesHub>();

        var cut = Render<GameProgressEdit>(parameters => parameters
            .Add(p => p.IsVisible, true)
            .Add(p => p.IsEditMode, false)
            .Add(p => p.GameTitle, "Missing Game"));

        cut.Find(".modal-footer .cta-button").Click();

        await Task.Delay(100);
        Assert.Empty(db.GameProgress);
    }

    [Fact]
    public void GameProgressEdit_ShowsSuggestions_WhenTypingMatchingTitle()
    {
        Services.AddSingleton(CreateInMemoryDbContext());
        Services.AddMockHubContext<GamesHub>();

        var cut = Render<GameProgressEdit>(parameters => parameters
            .Add(p => p.IsVisible, true)
            .Add(p => p.AllGameTitles, new List<string> { "Shadow Hearts", "Shadow of Rome", "God of War" }));

        cut.Find("input[placeholder='Game title']").Input("Shadow");

        var suggestions = cut.FindAll("ul.suggestions li");
        Assert.True(suggestions.Count >= 2);
        Assert.Contains("Shadow Hearts", suggestions[0].TextContent + string.Join(" ", suggestions.Select(s => s.TextContent)));
    }

    private static Ps2ChallengeDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<Ps2ChallengeDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new Ps2ChallengeDbContext(options);
    }

}
