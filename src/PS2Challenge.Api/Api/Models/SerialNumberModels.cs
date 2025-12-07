namespace PS2Challenge.Api.Api.Models;

/// <summary>
/// Request model for adding a serial number to a game
/// </summary>
public class AddSerialNumberRequest
{
    /// <summary>
    /// The title of the game to add the serial number to
    /// </summary>
    public required string Title { get; set; }

    /// <summary>
    /// The serial number (e.g., "SLUS-20062", "SCES-50326")
    /// </summary>
    public required string SerialNumber { get; set; }

    /// <summary>
    /// Optional region code (e.g., "NTSC-U", "PAL", "NTSC-J")
    /// </summary>
    public string? Region { get; set; }

    /// <summary>
    /// Optional notes about this serial number
    /// </summary>
    public string? Notes { get; set; }
}

/// <summary>
/// Response model for adding a serial number to a game
/// </summary>
public class AddSerialNumberResponse
{
    /// <summary>
    /// The ID of the created serial number record
    /// </summary>
    public int SerialId { get; set; }

    /// <summary>
    /// The ID of the game the serial number belongs to
    /// </summary>
    public int GameId { get; set; }

    /// <summary>
    /// The title of the game
    /// </summary>
    public required string GameTitle { get; set; }

    /// <summary>
    /// The serial number that was added
    /// </summary>
    public required string SerialNumber { get; set; }

    /// <summary>
    /// The region code
    /// </summary>
    public string? Region { get; set; }

    /// <summary>
    /// Notes about the serial number
    /// </summary>
    public string? Notes { get; set; }

    /// <summary>
    /// Success message
    /// </summary>
    public required string Message { get; set; }
}

/// <summary>
/// Response model when a serial number already exists
/// </summary>
public class SerialNumberConflictResponse
{
    /// <summary>
    /// Error message
    /// </summary>
    public required string Error { get; set; }

    /// <summary>
    /// The game ID that already has this serial number
    /// </summary>
    public int ExistingGameId { get; set; }

    /// <summary>
    /// The title of the game that already has this serial number
    /// </summary>
    public required string ExistingGameTitle { get; set; }

    /// <summary>
    /// The serial number that conflicts
    /// </summary>
    public required string SerialNumber { get; set; }
}
