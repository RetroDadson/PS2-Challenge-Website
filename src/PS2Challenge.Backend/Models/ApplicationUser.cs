namespace PS2Challenge.Backend.Models;

public class ApplicationUser
{
    public int Id { get; set; }
    public required string TwitchId { get; set; }
    public required string TwitchUsername { get; set; }
    public string? ProfileImageUrl { get; set; }
    public int RoleId { get; set; }
    public Role? Role { get; set; } // Navigation property
    public DateTime CreatedAt { get; set; }
    public DateTime LastLoginAt { get; set; }
    public string? ApiKey { get; set; }
}
