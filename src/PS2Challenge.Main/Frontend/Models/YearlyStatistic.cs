namespace PS2Challenge.Main.Frontend.Models;

/// <summary>
/// Represents statistics for games started and completed in a specific year
/// </summary>
public record YearlyStatistic
{
    /// <summary>
    /// The year for which statistics are calculated
    /// </summary>
    public int Year { get; init; }

    /// <summary>
    /// Number of games started in this year
    /// </summary>
    public int GamesStarted { get; init; }

    /// <summary>
    /// Number of games completed in this year
    /// </summary>
    public int GamesCompleted { get; init; }

    /// <summary>
    /// Percentage of total challenge games (not excluded) that were completed in this year
    /// </summary>
    public double CompletionPercentage { get; init; }
}
