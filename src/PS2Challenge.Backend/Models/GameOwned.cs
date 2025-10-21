namespace PS2Challenge.Backend.Models;

public class GameOwned
{
    public int OwnershipId { get; set; }
    public int GameId { get; set; }
    public bool OwnPhysicalCopy { get; set; }
    public string TypeOwned { get; set; } = string.Empty;
}
