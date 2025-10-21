using PS2Challenge.Backend.Models;

namespace PS2Challenge.Backend.Tests.Helpers;

/// <summary>
/// Builder class for creating test GameDto objects with fluent API
/// </summary>
public class GameDtoBuilder
{
    private int _id = 1;
    private string _title = "Test Game";
    private string? _developer = "Test Developer";
    private string? _publisher = "Test Publisher";
    private DateOnly? _firstReleased = new DateOnly(2000, 1, 1);
    private string? _regionFirstReleasedIn = "NA";
    private bool _releasedInEuPalOrNa = true;
    private bool _isExcluded = false;
    private bool _isOwned = false;

    public GameDtoBuilder WithId(int id)
    {
        _id = id;
        return this;
    }

    public GameDtoBuilder WithTitle(string title)
    {
        _title = title;
        return this;
    }

    public GameDtoBuilder WithDeveloper(string? developer)
    {
        _developer = developer;
        return this;
    }

    public GameDtoBuilder WithPublisher(string? publisher)
    {
        _publisher = publisher;
        return this;
    }

    public GameDtoBuilder WithFirstReleased(DateOnly? firstReleased)
    {
        _firstReleased = firstReleased;
        return this;
    }

    public GameDtoBuilder WithRegionFirstReleasedIn(string? region)
    {
        _regionFirstReleasedIn = region;
        return this;
    }

    public GameDtoBuilder WithReleasedInEuPalOrNa(bool released)
    {
        _releasedInEuPalOrNa = released;
        return this;
    }

    public GameDtoBuilder IsExcluded(bool excluded = true)
    {
        _isExcluded = excluded;
        return this;
    }

    public GameDtoBuilder IsOwned(bool owned = true)
    {
        _isOwned = owned;
        return this;
    }

    public GameDto Build()
    {
        return new GameDto
        {
            Id = _id,
            Title = _title,
            Developer = _developer,
            Publisher = _publisher,
            FirstReleased = _firstReleased,
            RegionFirstReleasedIn = _regionFirstReleasedIn,
            ReleasedInEuPalOrNa = _releasedInEuPalOrNa,
            IsExcluded = _isExcluded,
            IsOwned = _isOwned
        };
    }
}

/// <summary>
/// Builder class for creating test GameProgress objects with fluent API
/// </summary>
public class GameProgressBuilder
{
    private int _progressId = 1;
    private int _gameId = 1;
    private DateOnly _dateStarted = DateOnly.FromDateTime(DateTime.UtcNow);
    private DateOnly? _dateFinished;
    private TimeSpan? _completionTime;
    private string? _beatenCriteria;
    private string? _review;
    private string _platform = "Physical";

    public GameProgressBuilder WithProgressId(int id)
    {
        _progressId = id;
        return this;
    }

    public GameProgressBuilder WithGameId(int gameId)
    {
        _gameId = gameId;
        return this;
    }

    public GameProgressBuilder WithDateStarted(DateOnly dateStarted)
    {
        _dateStarted = dateStarted;
        return this;
    }

    public GameProgressBuilder WithDateFinished(DateOnly? dateFinished)
    {
        _dateFinished = dateFinished;
        return this;
    }

    public GameProgressBuilder WithCompletionTime(TimeSpan? completionTime)
    {
        _completionTime = completionTime;
        return this;
    }

    public GameProgressBuilder WithBeatenCriteria(string? criteria)
    {
        _beatenCriteria = criteria;
        return this;
    }

    public GameProgressBuilder WithReview(string? review)
    {
        _review = review;
        return this;
    }

    public GameProgressBuilder WithPlatform(string platform)
    {
        _platform = platform;
        return this;
    }

    public GameProgress Build()
    {
        return new GameProgress
        {
            ProgressId = _progressId,
            GameId = _gameId,
            DateStarted = _dateStarted,
            DateFinished = _dateFinished,
            CompletionTime = _completionTime,
            BeatenCriteria = _beatenCriteria,
            Review = _review,
            Platform = _platform
        };
    }
}

/// <summary>
/// Builder class for creating test ApplicationUser objects with fluent API
/// </summary>
public class ApplicationUserBuilder
{
    private int _id = 1;
    private string _twitchId = "12345";
    private string _twitchUsername = "testuser";
    private int _roleId = 2;
    private Role? _role;
    private DateTime _createdAt = DateTime.UtcNow;
    private DateTime _lastLoginAt = DateTime.UtcNow;
    private string? _profileImageUrl;

    public ApplicationUserBuilder WithId(int id)
    {
        _id = id;
        return this;
    }

    public ApplicationUserBuilder WithTwitchId(string twitchId)
    {
        _twitchId = twitchId;
        return this;
    }

    public ApplicationUserBuilder WithTwitchUsername(string username)
    {
        _twitchUsername = username;
        return this;
    }

    public ApplicationUserBuilder WithRoleId(int roleId)
    {
        _roleId = roleId;
        return this;
    }

    public ApplicationUserBuilder WithRole(Role role)
    {
        _role = role;
        _roleId = role.Id;
        return this;
    }

    public ApplicationUserBuilder WithCreatedAt(DateTime createdAt)
    {
        _createdAt = createdAt;
        return this;
    }

    public ApplicationUserBuilder WithLastLoginAt(DateTime lastLoginAt)
    {
        _lastLoginAt = lastLoginAt;
        return this;
    }

    public ApplicationUserBuilder WithProfileImageUrl(string? profileImageUrl)
    {
        _profileImageUrl = profileImageUrl;
        return this;
    }

    public ApplicationUser Build()
    {
        return new ApplicationUser
        {
            Id = _id,
            TwitchId = _twitchId,
            TwitchUsername = _twitchUsername,
            RoleId = _roleId,
            Role = _role,
            CreatedAt = _createdAt,
            LastLoginAt = _lastLoginAt,
            ProfileImageUrl = _profileImageUrl
        };
    }
}
