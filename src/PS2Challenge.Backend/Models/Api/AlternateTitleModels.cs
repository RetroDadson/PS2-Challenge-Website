namespace PS2Challenge.Backend.Models.Api;

/// <summary>
/// Request model for adding an alternate title to a game
/// </summary>
public class AddAlternateTitleRequest
{
    /// <summary>
    /// The alternate title for the game
    /// </summary>
    public required string Title { get; set; }

    /// <summary>
    /// Additional notes or description (optional)
    /// </summary>
    public string? Notes { get; set; }
}
