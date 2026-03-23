using System.Text.Json.Serialization;

namespace PS2Challenge.Api.Api.Models;

public class AddGameOwnedRequest
{
    public string Title { get; set; } = string.Empty;

    [JsonRequired]
    public bool OwnPhysicalCopy { get; set; }

    public string TypeOwned { get; set; } = string.Empty; // Fixed nullable warning
}
