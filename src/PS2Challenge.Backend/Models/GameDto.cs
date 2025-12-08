using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PS2Challenge.Backend.Models;

public class GameDto
{
    [Key]
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Developer { get; set; }
    public string? Publisher { get; set; }
    public DateOnly? FirstReleased { get; set; }
    public string? RegionFirstReleasedIn { get; set; }
    public bool ReleasedInEuPalOrNa { get; set; }
    
    /// <summary>
    /// Cached cover image URL from the ps2-covers repository.
    /// Updated periodically by background service.
    /// </summary>
    public string? ImageUrl { get; set; }

    [NotMapped]
    public bool IsExcluded { get; set; }
    [NotMapped]
    public bool IsOwned { get; set; }
}
