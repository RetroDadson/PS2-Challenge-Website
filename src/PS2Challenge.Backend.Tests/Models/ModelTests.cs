using PS2Challenge.Backend.Models;

namespace PS2Challenge.Backend.Tests.Models;

public class GameDtoTests
{
    [Fact]
    public void GameDto_CanBeCreated()
    {
        // Act
        var game = new GameDto
        {
            Id = 1,
            Title = "Test Game",
            Developer = "Test Developer",
            Publisher = "Test Publisher",
            FirstReleased = new DateOnly(2000, 1, 1),
            RegionFirstReleasedIn = "NA",
            ReleasedInEuPalOrNa = true
        };

        // Assert
        Assert.Equal(1, game.Id);
        Assert.Equal("Test Game", game.Title);
        Assert.Equal("Test Developer", game.Developer);
        Assert.Equal("Test Publisher", game.Publisher);
        Assert.Equal(new DateOnly(2000, 1, 1), game.FirstReleased);
        Assert.Equal("NA", game.RegionFirstReleasedIn);
        Assert.True(game.ReleasedInEuPalOrNa);
    }

    [Fact]
    public void GameDto_DefaultValues()
    {
        // Act
        var game = new GameDto();

        // Assert
        Assert.False(game.IsExcluded);
        Assert.False(game.IsOwned);
        Assert.False(game.ReleasedInEuPalOrNa);
    }
}

public class GameProgressTests
{
    [Fact]
    public void GameProgress_CanBeCreated()
    {
        // Act
        var progress = new GameProgress
        {
            ProgressId = 1,
            GameId = 1,
            DateStarted = new DateOnly(2024, 1, 1),
            DateFinished = new DateOnly(2024, 1, 15),
            CompletionTime = new TimeSpan(10, 30, 0),
            BeatenCriteria = "100% completion",
            Review = "Great game!",
            Platform = "Physical"
        };

        // Assert
        Assert.Equal(1, progress.ProgressId);
        Assert.Equal(1, progress.GameId);
        Assert.Equal(new DateOnly(2024, 1, 1), progress.DateStarted);
        Assert.Equal(new DateOnly(2024, 1, 15), progress.DateFinished);
        Assert.Equal(new TimeSpan(10, 30, 0), progress.CompletionTime);
        Assert.Equal("100% completion", progress.BeatenCriteria);
        Assert.Equal("Great game!", progress.Review);
        Assert.Equal("Physical", progress.Platform);
    }

    [Fact]
    public void GameProgress_NullableFields()
    {
        // Act
        var progress = new GameProgress
        {
            GameId = 1,
            DateStarted = DateOnly.FromDateTime(DateTime.UtcNow),
            Platform = "Digital"
        };

        // Assert
        Assert.Null(progress.DateFinished);
        Assert.Null(progress.CompletionTime);
        Assert.Null(progress.BeatenCriteria);
        Assert.Null(progress.Review);
    }
}

public class GameProgressDtoTests
{
    [Fact]
    public void GameProgressDto_CanBeCreated()
    {
        // Act
        var dto = new GameProgressDto
        {
            ProgressId = 1,
            GameTitle = "Test Game",
            DateStarted = new DateOnly(2024, 1, 1),
            DateFinished = new DateOnly(2024, 1, 15),
            CompletionTime = new TimeSpan(10, 30, 0),
            BeatenCriteria = "Beat final boss",
            Review = "Amazing!",
            Platform = "Physical"
        };

        // Assert
        Assert.Equal("Test Game", dto.GameTitle);
        Assert.Equal(new DateOnly(2024, 1, 15), dto.DateFinished);
    }
}

public class ApplicationUserTests
{
    [Fact]
    public void ApplicationUser_CanBeCreated()
    {
        // Act
        var user = new ApplicationUser
        {
            Id = 1,
            TwitchId = "12345",
            TwitchUsername = "testuser",
            RoleId = 2,
            CreatedAt = DateTime.UtcNow,
            LastLoginAt = DateTime.UtcNow
        };

        // Assert
        Assert.Equal("12345", user.TwitchId);
        Assert.Equal("testuser", user.TwitchUsername);
        Assert.Equal(2, user.RoleId);
    }

    [Fact]
    public void ApplicationUser_ProfileImageUrl_IsNullable()
    {
        // Act
        var user = new ApplicationUser
        {
            TwitchId = "12345",
            TwitchUsername = "testuser",
            RoleId = 2
        };

        // Assert
        Assert.Null(user.ProfileImageUrl);
    }

    [Fact]
    public void ApplicationUser_RoleNavigationProperty_CanBeSet()
    {
        // Act
        var role = new Role { Id = 1, Name = "Admin" };
        var user = new ApplicationUser
        {
            TwitchId = "12345",
            TwitchUsername = "testuser",
            RoleId = 1,
            Role = role
        };

        // Assert
        Assert.NotNull(user.Role);
        Assert.Equal("Admin", user.Role.Name);
        Assert.Equal(1, user.Role.Id);
    }

    [Fact]
    public void ApplicationUser_ApiKey_IsNullable()
    {
        // Act
        var user = new ApplicationUser
        {
            TwitchId = "12345",
            TwitchUsername = "testuser",
            RoleId = 2
        };

        // Assert
        Assert.Null(user.ApiKey);
    }

    [Fact]
    public void ApplicationUser_CreatedAt_CanBeSet()
    {
        // Arrange
        var createdAt = new DateTime(2024, 1, 1, 12, 0, 0, DateTimeKind.Utc);

        // Act
        var user = new ApplicationUser
        {
            TwitchId = "12345",
            TwitchUsername = "testuser",
            RoleId = 2,
            CreatedAt = createdAt,
            LastLoginAt = createdAt
        };

        // Assert
        Assert.Equal(createdAt, user.CreatedAt);
        Assert.Equal(createdAt, user.LastLoginAt);
    }
}

public class RoleTests
{
    [Fact]
    public void Role_CanBeCreated()
    {
        // Act
        var role = new Role
        {
            Id = 1,
            Name = "Admin"
        };

        // Assert
        Assert.Equal(1, role.Id);
        Assert.Equal("Admin", role.Name);
    }
}

public class ExcludedGameTests
{
    [Fact]
    public void ExcludedGame_CanBeCreated()
    {
        // Act
        var excluded = new ExcludedGame
        {
            ExclusionId = 1,
            GameId = 1,
            Reason = "Duplicate entry"
        };

        // Assert
        Assert.Equal(1, excluded.ExclusionId);
        Assert.Equal(1, excluded.GameId);
        Assert.Equal("Duplicate entry", excluded.Reason);
    }
}

public class GameOwnedTests
{
    [Fact]
    public void GameOwned_CanBeCreated()
    {
        // Act
        var owned = new GameOwned
        {
            OwnershipId = 1,
            GameId = 1,
            OwnPhysicalCopy = true,
            TypeOwned = "Physical"
        };

        // Assert
        Assert.Equal(1, owned.OwnershipId);
        Assert.True(owned.OwnPhysicalCopy);
        Assert.Equal("Physical", owned.TypeOwned);
    }
}

public class VoteHistoryTests
{
    [Fact]
    public void VoteHistory_CanBeCreated()
    {
        // Act
        var vote = new VoteHistory
        {
            HistoryId = 1,
            GameId = 1,
            VoteRound = 5,
            VoteCount = 100,
            Notes = "Special round"
        };

        // Assert
        Assert.Equal(1, vote.HistoryId);
        Assert.Equal(1, vote.GameId);
        Assert.Equal(5, vote.VoteRound);
        Assert.Equal(100, vote.VoteCount);
        Assert.Equal("Special round", vote.Notes);
    }
}

public class CurrentVoteTests
{
    [Fact]
    public void CurrentVote_CanBeCreated()
    {
        // Act
        var vote = new CurrentVote
        {
            VoteId = 1,
            GameId = 1,
            VoteCount = 50,
            GameNumber = 1
        };

        // Assert
        Assert.Equal(1, vote.VoteId);
        Assert.Equal(1, vote.GameId);
        Assert.Equal(50, vote.VoteCount);
        Assert.Equal(1, vote.GameNumber);
    }
}

public class VoteTests
{
    [Fact]
    public void Vote_CanBeCreated()
    {
        // Act
        var vote = new Vote
        {
            VoteId = 1,
            VoteRound = 5,
            GameId = 100,
            CreatedAt = DateTime.UtcNow
        };

        // Assert
        Assert.Equal(1, vote.VoteId);
        Assert.Equal(5, vote.VoteRound);
        Assert.Equal(100, vote.GameId);
        Assert.NotEqual(default(DateTime), vote.CreatedAt);
    }
}

public class OwnershipTypeTests
{
    [Fact]
    public void OwnershipType_CanBeCreated()
    {
        // Act
        var ownershipType = new OwnershipType
        {
            TypeOwned = "PAL"
        };

        // Assert
        Assert.Equal("PAL", ownershipType.TypeOwned);
    }

    [Fact]
    public void OwnershipType_DefaultValue()
    {
        // Act
        var ownershipType = new OwnershipType();

        // Assert
        Assert.Equal(string.Empty, ownershipType.TypeOwned);
    }
}

public class GameSerialNumberTests
{
    [Fact]
    public void GameSerialNumber_CanBeCreated()
    {
        // Act
        var serialNumber = new GameSerialNumber
        {
            SerialId = 1,
            GameId = 1,
            SerialNumber = "SLUS-20062",
            Region = "NTSC-U",
            Notes = "North American release"
        };

        // Assert
        Assert.Equal(1, serialNumber.SerialId);
        Assert.Equal(1, serialNumber.GameId);
        Assert.Equal("SLUS-20062", serialNumber.SerialNumber);
        Assert.Equal("NTSC-U", serialNumber.Region);
        Assert.Equal("North American release", serialNumber.Notes);
    }

    [Fact]
    public void GameSerialNumber_RequiredFieldsOnly()
    {
        // Act
        var serialNumber = new GameSerialNumber
        {
            GameId = 1,
            SerialNumber = "SCES-50326"
        };

        // Assert
        Assert.Equal(1, serialNumber.GameId);
        Assert.Equal("SCES-50326", serialNumber.SerialNumber);
        Assert.Null(serialNumber.Region);
        Assert.Null(serialNumber.Notes);
    }

    [Fact]
    public void GameSerialNumber_DefaultValues()
    {
        // Act
        var serialNumber = new GameSerialNumber();

        // Assert
        Assert.Equal(0, serialNumber.GameId);
        Assert.Equal(string.Empty, serialNumber.SerialNumber);
        Assert.Null(serialNumber.Region);
        Assert.Null(serialNumber.Notes);
    }

    [Fact]
    public void GameSerialNumber_MultipleSerialNumbersForSameGame()
    {
        // Arrange - Simulating a game released in different regions
        var serialNumbers = new List<GameSerialNumber>
        {
            new() { GameId = 1, SerialNumber = "SLUS-20062", Region = "NTSC-U" },
            new() { GameId = 1, SerialNumber = "SCES-50326", Region = "PAL" },
            new() { GameId = 1, SerialNumber = "SLPS-25006", Region = "NTSC-J" }
        };

        // Assert - All serial numbers share the same GameId
        Assert.All(serialNumbers, sn => Assert.Equal(1, sn.GameId));
        Assert.Equal(3, serialNumbers.Count);
        Assert.Equal(3, serialNumbers.Select(sn => sn.SerialNumber).Distinct().Count());
    }

    [Fact]
    public void GameSerialNumber_EachSerialNumberMustBeUnique()
    {
        // Arrange - Multiple games cannot share the same serial number
        var serialNumbers = new List<GameSerialNumber>
        {
            new() { GameId = 1, SerialNumber = "SLUS-20062", Region = "NTSC-U" },
            new() { GameId = 2, SerialNumber = "SLUS-20063", Region = "NTSC-U" },
            new() { GameId = 3, SerialNumber = "SLUS-20064", Region = "NTSC-U" }
        };

        // Assert - Each serial number must be unique
        Assert.Equal(3, serialNumbers.Select(sn => sn.SerialNumber).Distinct().Count());
        
        // Assert - Different games should have different serial numbers
        var groupedBySerial = serialNumbers.GroupBy(sn => sn.SerialNumber);
        Assert.All(groupedBySerial, group => Assert.Single(group));
    }
}
