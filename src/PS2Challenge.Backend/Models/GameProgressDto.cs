namespace PS2Challenge.Backend.Models;

public class GameProgressDto
{
    public int ProgressId { get; set; }
    public int GameId { get; set; }
    public string GameTitle { get; set; } = string.Empty;
    public string? ImageUrl { get; set; }
    public DateOnly DateStarted { get; set; }
    public DateOnly? DateFinished { get; set; }
    public TimeSpan? CompletionTime { get; set; }
    public string? BeatenCriteria { get; set; }
    public string? Review { get; set; }
    public string Platform { get; set; } = string.Empty;
}
