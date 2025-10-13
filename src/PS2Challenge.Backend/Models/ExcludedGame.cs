namespace PS2Challenge.Backend.Models;

public class ExcludedGame
{
    public int ExclusionId { get; set; }
    public int GameId { get; set; }
    public string Reason { get; set; } = string.Empty;
}
