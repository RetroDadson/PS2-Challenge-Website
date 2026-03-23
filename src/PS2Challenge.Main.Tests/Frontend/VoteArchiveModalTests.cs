using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using PS2Challenge.Backend.Data;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Services;
using PS2Challenge.Main.Api.Hubs;
using PS2Challenge.Main.Frontend.Components;

namespace PS2Challenge.Main.Tests.Frontend;

public class VoteArchiveModalTests : BunitContext
{
    private readonly Mock<VoteService> _voteService;

    public VoteArchiveModalTests()
    {
        _voteService = new Mock<VoteService>(null!);
        Services.AddSingleton(_voteService.Object);
        Services.AddDbContext<Ps2ChallengeDbContext>(o => o.UseInMemoryDatabase(Guid.NewGuid().ToString()));
        Services.AddMockHubContext<VotesHub>();
    }

    [Fact]
    public void VoteArchiveModal_WhenNotVisible_RendersNothing()
    {
        var cut = Render<VoteArchiveModal>(p => p
            .Add(x => x.IsVisible, false)
            .Add(x => x.CurrentVotes, new List<CurrentVoteDto>()));

        Assert.Equal(string.Empty, cut.Markup.Trim());
    }

    [Fact]
    public async Task VoteArchiveModal_ArchiveWithoutTies_InvokesServiceAndOnArchived()
    {
        _voteService
            .Setup(v => v.ArchiveCurrentVotesAsync(It.IsAny<string?>(), It.IsAny<Dictionary<int, int>?>()))
            .ReturnsAsync((12, 3));

        var archivedCalled = false;
        Dictionary<int, int>? capturedPositions = null;
        string? capturedNotes = null;

        _voteService
            .Setup(v => v.ArchiveCurrentVotesAsync(It.IsAny<string?>(), It.IsAny<Dictionary<int, int>?>()))
            .Callback<string?, Dictionary<int, int>?>((notes, positions) =>
            {
                capturedNotes = notes;
                capturedPositions = positions;
            })
            .ReturnsAsync((12, 3));

        var cut = Render<VoteArchiveModal>(p => p
            .Add(x => x.IsVisible, true)
            .Add(x => x.CurrentVotes, new List<CurrentVoteDto>
            {
                new() { GameTitle = "Game A", VoteCount = 10, GameId = 1 },
                new() { GameTitle = "Game B", VoteCount = 7, GameId = 2 }
            })
            .Add(x => x.OnArchived, EventCallback.Factory.Create(this, () => archivedCalled = true)));

        await cut.InvokeAsync(() => cut.Find("textarea").Change("  round notes  "));
        await cut.InvokeAsync(() => cut.Find(".cta-button").Click());

        await cut.WaitForAssertionAsync(() => Assert.True(archivedCalled));
        Assert.Equal("round notes", capturedNotes);
        Assert.Null(capturedPositions);

        _voteService.Verify(v => v.ArchiveCurrentVotesAsync(It.IsAny<string?>(), It.IsAny<Dictionary<int, int>?>()), Times.Once);
    }

    [Fact]
    public async Task VoteArchiveModal_WithTies_UsesManualPositionsWhenProvided()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();
        db.Games.AddRange(
            new GameDto { Id = 101, Title = "Tie A" },
            new GameDto { Id = 202, Title = "Tie B" });
        await db.SaveChangesAsync();

        Dictionary<int, int>? capturedPositions = null;

        _voteService
            .Setup(v => v.ArchiveCurrentVotesAsync(It.IsAny<string?>(), It.IsAny<Dictionary<int, int>?>()))
            .Callback<string?, Dictionary<int, int>?>((_, positions) => capturedPositions = positions)
            .ReturnsAsync((7, 2));

        var cut = Render<VoteArchiveModal>(p => p
            .Add(x => x.IsVisible, true)
            .Add(x => x.CurrentVotes, new List<CurrentVoteDto>
            {
                new() { GameTitle = "Tie A", VoteCount = 50, GameId = 1 },
                new() { GameTitle = "Tie B", VoteCount = 50, GameId = 2 }
            }));

        await cut.WaitForAssertionAsync(() => Assert.Contains("Tied Votes Detected", cut.Markup));

        await cut.InvokeAsync(() => cut.FindAll("select")[1].Change("2"));
        await cut.InvokeAsync(() => cut.Find(".cta-button").Click());

        await cut.WaitForAssertionAsync(() =>
        {
            Assert.NotNull(capturedPositions);
            Assert.NotEmpty(capturedPositions!);
            Assert.Contains(2, capturedPositions.Values);
        });
    }

    [Fact]
    public async Task VoteArchiveModal_CloseButton_InvokesOnClose()
    {
        _voteService
            .Setup(v => v.ArchiveCurrentVotesAsync(It.IsAny<string?>(), It.IsAny<Dictionary<int, int>?>()))
            .ReturnsAsync((1, 1));

        var closeCalled = false;

        var cut = Render<VoteArchiveModal>(p => p
            .Add(x => x.IsVisible, true)
            .Add(x => x.CurrentVotes, new List<CurrentVoteDto>())
            .Add(x => x.OnClose, EventCallback.Factory.Create(this, () => closeCalled = true)));

        await cut.InvokeAsync(() => cut.Find(".modal-close").Click());

        await cut.WaitForAssertionAsync(() => Assert.True(closeCalled));
    }
}
