using System.Text.Json.Serialization;

namespace PS2Challenge.Api.Api.Models;

public class UpdateProgressRequest
{
    public string Title { get; set; } = string.Empty;

    [JsonRequired]
    [JsonConverter(typeof(FlexibleDateOnlyConverter))]
    public DateOnly DateStarted { get; set; }

    [JsonConverter(typeof(NullableFlexibleDateOnlyConverter))]
    public DateOnly? DateFinished { get; set; }

    public string? CompletionTime { get; set; }

    public string? BeatenCriteria { get; set; }
    public string? Review { get; set; }
    public string Platform { get; set; } = string.Empty;
}
