using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PS2Challenge.Backend.Models;

[Table("progress")]
public class GameProgress
{
    [Key]
    [Column("progress_id")]
    public int ProgressId { get; set; }

    [Column("game_id")]
    public int GameId { get; set; }

    [Column("date_started")]
    public DateOnly DateStarted { get; set; }

    [Column("date_finished")]
    public DateOnly? DateFinished { get; set; }

    [Column("completion_time")]
    public TimeSpan? CompletionTime { get; set; }

    [Column("beaten_criteria")]
    public string? BeatenCriteria { get; set; }

    [Column("review")]
    public string? Review { get; set; }

    [Column("platform")]
    public string Platform { get; set; } = string.Empty;
}
