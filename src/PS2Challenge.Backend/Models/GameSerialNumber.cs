using System.ComponentModel.DataAnnotations;

namespace PS2Challenge.Backend.Models;

/// <summary>
/// Represents a serial number for a PS2 game.
/// Games can have multiple serial numbers due to releases across different regions.
/// </summary>
public class GameSerialNumber
{
    [Key]
    public int SerialId { get; set; }

    [Required]
    public int GameId { get; set; }

    [Required]
    [StringLength(50)]
    public string SerialNumber { get; set; } = string.Empty;

    [StringLength(50)]
    public string? Region { get; set; }

    [StringLength(500)]
    public string? Notes { get; set; }
}
