namespace PS2Challenge.Api.Api.Models;

public class UserProfileDto
{
    public bool IsAuthenticated { get; set; }
    public string? Username { get; set; }
    public string? TwitchId { get; set; }
    public string? Role { get; set; }
    public string? ProfileImageUrl { get; set; }
    public string? ApiKey { get; set; }
}

public class ApiKeyResponseDto
{
    public string? ApiKey { get; set; }
}
