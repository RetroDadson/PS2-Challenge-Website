using PS2Challenge.Api.Api.Models;

namespace PS2Challenge.Main.Tests.Models;

public class UpdateProgressRequestTests
{
    [Fact]
    public void UpdateProgressRequest_CanBeCreated()
    {
        // Act
        var request = new UpdateProgressRequest
        {
            Title = "Test Game",
            DateStarted = new DateOnly(2024, 1, 1),
            DateFinished = new DateOnly(2024, 1, 15),
            CompletionTime = "10:30:00",
            BeatenCriteria = "Beat final boss",
            Review = "Great game!",
            Platform = "PS2"
        };

        // Assert
        Assert.Equal("Test Game", request.Title);
        Assert.Equal(new DateOnly(2024, 1, 1), request.DateStarted);
        Assert.Equal(new DateOnly(2024, 1, 15), request.DateFinished);
        Assert.Equal("10:30:00", request.CompletionTime);
        Assert.Equal("Beat final boss", request.BeatenCriteria);
        Assert.Equal("Great game!", request.Review);
        Assert.Equal("PS2", request.Platform);
    }

    [Fact]
    public void UpdateProgressRequest_DefaultValues()
    {
        // Act
        var request = new UpdateProgressRequest();

        // Assert
        Assert.Equal(string.Empty, request.Title);
        Assert.Equal(string.Empty, request.Platform);
        Assert.Null(request.DateFinished);
        Assert.Null(request.CompletionTime);
        Assert.Null(request.BeatenCriteria);
        Assert.Null(request.Review);
    }
}

public class ExcludeGameRequestTests
{
    [Fact]
    public void ExcludeGameRequest_CanBeCreated()
    {
        // Act
        var request = new ExcludeGameRequest
        {
            Title = "Test Game",
            Reason = "Duplicate entry"
        };

        // Assert
        Assert.Equal("Test Game", request.Title);
        Assert.Equal("Duplicate entry", request.Reason);
    }

    [Fact]
    public void ExcludeGameRequest_DefaultValues()
    {
        // Act
        var request = new ExcludeGameRequest();

        // Assert
        Assert.Equal(string.Empty, request.Title);
        Assert.Equal(string.Empty, request.Reason);
    }
}

public class AddGameOwnedRequestTests
{
    [Fact]
    public void AddGameOwnedRequest_CanBeCreated()
    {
        // Act
        var request = new AddGameOwnedRequest
        {
            Title = "Test Game",
            OwnPhysicalCopy = true,
            TypeOwned = "PAL"
        };

        // Assert
        Assert.Equal("Test Game", request.Title);
        Assert.True(request.OwnPhysicalCopy);
        Assert.Equal("PAL", request.TypeOwned);
    }

    [Fact]
    public void AddGameOwnedRequest_DefaultValues()
    {
        // Act
        var request = new AddGameOwnedRequest();

        // Assert
        Assert.Equal(string.Empty, request.Title);
        Assert.False(request.OwnPhysicalCopy);
        Assert.Equal(string.Empty, request.TypeOwned);
    }
}
