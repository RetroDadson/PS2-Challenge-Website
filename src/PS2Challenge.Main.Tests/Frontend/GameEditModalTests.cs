using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using PS2Challenge.Backend.Data;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Services;
using PS2Challenge.Main.Api.Hubs;
using PS2Challenge.Main.Frontend.Components;

namespace PS2Challenge.Main.Tests.Frontend;

public class GameEditModalTests : BunitContext
{
    private readonly Mock<GameService> _mockGameService;

    public GameEditModalTests()
    {
        _mockGameService = new Mock<GameService>(Mock.Of<IServiceScopeFactory>());
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    [Fact]
    public void GameEditModal_SaveWithoutTitle_ShowsValidationMessage()
    {
        _mockGameService.Setup(s => s.GetAllOwnershipTypesAsync())
            .ReturnsAsync(new List<OwnershipType>());

        Services.AddSingleton(_mockGameService.Object);
        Services.AddSingleton(Mock.Of<IServiceScopeFactory>());
        Services.AddSingleton(new HttpClient());
        Services.AddMockHubContext<GamesHub>();

        var cut = Render<GameEditModal>(parameters => parameters
            .Add(p => p.IsVisible, true)
            .Add(p => p.IsEditMode, false));

        cut.Find(".modal-footer .cta-button").Click();

        Assert.Contains("Title is required", cut.Markup);
    }

    [Fact]
    public async Task GameEditModal_SaveWithoutExclusionReason_ShowsValidationMessage()
    {
        _mockGameService.Setup(s => s.GetAllOwnershipTypesAsync())
            .ReturnsAsync(new List<OwnershipType>());

        Services.AddSingleton(_mockGameService.Object);
        Services.AddSingleton(Mock.Of<IServiceScopeFactory>());
        Services.AddSingleton(new HttpClient());
        Services.AddMockHubContext<GamesHub>();

        var cut = Render<GameEditModal>(parameters => parameters
            .Add(p => p.IsVisible, true)
            .Add(p => p.IsEditMode, false));

        await FillRequiredFieldsAsync(cut);

        await cut.InvokeAsync(() => cut.FindAll("input[type='checkbox']")[^1].ChangeAsync(true));

        await cut.InvokeAsync(() => cut.Find(".modal-footer .cta-button").ClickAsync());

        Assert.Contains("Exclusion reason is required", cut.Markup);
    }

    [Fact]
    public async Task GameEditModal_SaveValidNewGame_CallsCreateAndOnSave()
    {
        var db = CreateInMemoryDbContext();

        _mockGameService.Setup(s => s.GetAllOwnershipTypesAsync())
            .ReturnsAsync(new List<OwnershipType>());
        _mockGameService.Setup(s => s.AddGameAsync(It.IsAny<GameDto>()))
            .ReturnsAsync(new GameDto { Id = 42, Title = "Created" });
        _mockGameService.Setup(s => s.UpdateOwnershipAsync(42, It.IsAny<bool>(), It.IsAny<string>()))
            .Returns(Task.CompletedTask);

        var onSaveCalled = false;

        Services.AddSingleton(_mockGameService.Object);
        Services.AddSingleton(db);
        Services.AddSingleton(new HttpClient());
        Services.AddMockHubContext<GamesHub>();

        var cut = Render<GameEditModal>(parameters => parameters
            .Add(p => p.IsVisible, true)
            .Add(p => p.IsEditMode, false)
            .Add(p => p.OnSave, EventCallback.Factory.Create(this, () => onSaveCalled = true)));

        await FillRequiredFieldsAsync(cut);

        await cut.InvokeAsync(() => cut.Find(".modal-footer .cta-button").ClickAsync());

        await cut.WaitForAssertionAsync(() => Assert.True(onSaveCalled));

        _mockGameService.Verify(s => s.AddGameAsync(It.IsAny<GameDto>()), Times.Once);
        _mockGameService.Verify(s => s.UpdateOwnershipAsync(42, It.IsAny<bool>(), It.IsAny<string>()), Times.Once);
    }

    [Fact]
    public async Task GameEditModal_SaveWithoutDeveloper_ShowsValidationMessage()
    {
        _mockGameService.Setup(s => s.GetAllOwnershipTypesAsync())
            .ReturnsAsync(new List<OwnershipType>());

        Services.AddSingleton(_mockGameService.Object);
        Services.AddSingleton(Mock.Of<IServiceScopeFactory>());
        Services.AddSingleton(new HttpClient());
        Services.AddMockHubContext<GamesHub>();

        var cut = Render<GameEditModal>(parameters => parameters
            .Add(p => p.IsVisible, true)
            .Add(p => p.IsEditMode, false));

        await cut.InvokeAsync(() => cut.Find("input[maxlength='150']:not([placeholder])").Change("Test Title"));
        await cut.InvokeAsync(() => cut.FindAll("input[maxlength='100']:not([placeholder])")[1].Change("Test Publisher"));
        await cut.InvokeAsync(() => cut.Find("input[placeholder='e.g., NA, EU, JP']").Change("NA"));

        await cut.InvokeAsync(() => cut.Find(".modal-footer .cta-button").ClickAsync());

        Assert.Contains("Developer is required", cut.Markup);
    }

    [Fact]
    public async Task GameEditModal_AddDuplicateSerial_ShowsValidationError()
    {
        _mockGameService.Setup(s => s.GetAllOwnershipTypesAsync())
            .ReturnsAsync(new List<OwnershipType>());

        Services.AddSingleton(_mockGameService.Object);
        Services.AddSingleton(CreateInMemoryDbContext());
        Services.AddSingleton(new HttpClient());
        Services.AddMockHubContext<GamesHub>();

        var cut = Render<GameEditModal>(parameters => parameters
            .Add(p => p.IsVisible, true)
            .Add(p => p.IsEditMode, false));

        await cut.InvokeAsync(() => cut.Find("input[placeholder='e.g., SLUS-20062']").Change("SLUS-12345"));
        await cut.InvokeAsync(() => cut.Find("button.btn.btn-secondary").Click());

        await cut.InvokeAsync(() => cut.Find("input[placeholder='e.g., SLUS-20062']").Change("SLUS-12345"));
        await cut.InvokeAsync(() => cut.Find("button.btn.btn-secondary").Click());

        Assert.Contains("already in the list", cut.Markup);
    }

    [Fact]
    public async Task GameEditModal_EditMode_SaveCallsUpdateFlow()
    {
        var db = CreateInMemoryDbContext();
        db.GamesOwned.Add(new GameOwned { GameId = 7, OwnPhysicalCopy = true, TypeOwned = "Disc" });
        await db.SaveChangesAsync();

        _mockGameService.Setup(s => s.GetAllOwnershipTypesAsync())
            .ReturnsAsync(new List<OwnershipType> { new() { TypeOwned = "Disc" } });
        _mockGameService.Setup(s => s.UpdateGameAsync(7, It.IsAny<GameDto>())).ReturnsAsync(new GameDto { Id = 7, Title = "Updated Title" });
        _mockGameService.Setup(s => s.UpdateOwnershipAsync(7, It.IsAny<bool>(), It.IsAny<string>())).Returns(Task.CompletedTask);
        _mockGameService.Setup(s => s.UpdateExclusionAsync(7, It.IsAny<bool>(), It.IsAny<string?>())).Returns(Task.CompletedTask);

        var onSaveCalled = false;

        Services.AddSingleton(_mockGameService.Object);
        Services.AddSingleton(db);
        Services.AddSingleton(new HttpClient());
        Services.AddMockHubContext<GamesHub>();

        var cut = Render<GameEditModal>(parameters => parameters
            .Add(p => p.IsVisible, true)
            .Add(p => p.IsEditMode, true)
            .Add(p => p.Game, new GameDto
            {
                Id = 7,
                Title = "Existing",
                Developer = "Dev",
                Publisher = "Pub",
                RegionFirstReleasedIn = "NA"
            })
            .Add(p => p.OnSave, EventCallback.Factory.Create(this, () => onSaveCalled = true)));

        await cut.InvokeAsync(() => cut.Find("input[maxlength='150']:not([placeholder])").Change("Updated Title"));
        await cut.InvokeAsync(() => cut.FindAll("input[maxlength='100']:not([placeholder])")[0].Change("Updated Dev"));
        await cut.InvokeAsync(() => cut.FindAll("input[maxlength='100']:not([placeholder])")[1].Change("Updated Pub"));
        await cut.InvokeAsync(() => cut.Find("input[placeholder='e.g., NA, EU, JP']").Change("EU"));

        await cut.InvokeAsync(() => cut.Find(".modal-footer .cta-button").ClickAsync());

        await cut.WaitForAssertionAsync(() => Assert.True(onSaveCalled));
        _mockGameService.Verify(s => s.UpdateGameAsync(7, It.IsAny<GameDto>()), Times.Once);
        _mockGameService.Verify(s => s.UpdateOwnershipAsync(7, It.IsAny<bool>(), It.IsAny<string>()), Times.Once);
        _mockGameService.Verify(s => s.UpdateExclusionAsync(7, It.IsAny<bool>(), It.IsAny<string?>()), Times.Once);
    }

    [Fact]
    public async Task GameEditModal_DeleteConfirmed_InvokesDeleteAndOnDelete()
    {
        _mockGameService.Setup(s => s.GetAllOwnershipTypesAsync())
            .ReturnsAsync(new List<OwnershipType>());
        _mockGameService.Setup(s => s.DeleteGameAsync(9)).ReturnsAsync(true);
        JSInterop.Setup<bool>("confirm", _ => true).SetResult(true);

        var deletedId = -1;

        Services.AddSingleton(_mockGameService.Object);
        Services.AddSingleton(CreateInMemoryDbContext());
        Services.AddSingleton(new HttpClient());
        Services.AddMockHubContext<GamesHub>();

        var cut = Render<GameEditModal>(parameters => parameters
            .Add(p => p.IsVisible, true)
            .Add(p => p.IsEditMode, true)
            .Add(p => p.Game, new GameDto { Id = 9, Title = "Delete Me", Developer = "Dev", Publisher = "Pub", RegionFirstReleasedIn = "NA" })
            .Add(p => p.OnDelete, EventCallback.Factory.Create<int>(this, id => deletedId = id)));

        await cut.InvokeAsync(() => cut.Find("button.btn.btn-danger").Click());

        await cut.WaitForAssertionAsync(() => Assert.Equal(9, deletedId));
        _mockGameService.Verify(s => s.DeleteGameAsync(9), Times.Once);
    }

    private static async Task FillRequiredFieldsAsync(IRenderedComponent<GameEditModal> cut)
    {
        await cut.InvokeAsync(() => cut.Find("input[maxlength='150']:not([placeholder])").Change("Test Title"));
        await cut.InvokeAsync(() => cut.FindAll("input[maxlength='100']:not([placeholder])")[0].Change("Test Developer"));
        await cut.InvokeAsync(() => cut.FindAll("input[maxlength='100']:not([placeholder])")[1].Change("Test Publisher"));
        await cut.InvokeAsync(() => cut.Find("input[placeholder='e.g., NA, EU, JP']").Change("NA"));
    }

    private static Ps2ChallengeDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<Ps2ChallengeDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new Ps2ChallengeDbContext(options);
    }

}
