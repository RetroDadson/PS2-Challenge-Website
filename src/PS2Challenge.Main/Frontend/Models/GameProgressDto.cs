namespace PS2Challenge.Main.Frontend.Models;

public class GameProgressDto
{
    public int ProgressId { get; set; }
    public string GameTitle { get; set; } = string.Empty;
    public DateOnly DateStarted { get; set; }
    public DateOnly? DateFinished { get; set; }
    public TimeSpan? CompletionTime { get; set; }
    public string? BeatenCriteria { get; set; }
    public string? Review { get; set; }
    public string Platform { get; set; } = string.Empty;
}
