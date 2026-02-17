namespace PS2Challenge.Backend.Models;

/// <summary>
/// DTO containing all data needed for the Games page in a single response
/// </summary>
public class GamesPageDataDto
{
    public List<GameDto> Games { get; set; } = new();
    public Dictionary<int, string> OwnedTypes { get; set; } = new();
    public Dictionary<int, string> ExclusionReasons { get; set; } = new();
    public Dictionary<int, string> CompletionStatus { get; set; } = new();
    public Dictionary<int, List<AlternateTitle>> AlternateTitles { get; set; } = new();
}
