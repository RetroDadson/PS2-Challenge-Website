using System.ComponentModel.DataAnnotations;

namespace PS2Challenge.Backend.Models;

/// <summary>
/// Represents an alternate title for a PS2 game.
/// Games can have multiple alternate titles due to regional differences or re-releases.
/// </summary>
public class AlternateTitle
{
    [Key]
    public int AlternateTitleId { get; set; }

    [Required]
    public int GameId { get; set; }

    [Required]
    [StringLength(150)]
    public string Title { get; set; } = string.Empty;

    [StringLength(500)]
    public string? Notes { get; set; }
}
