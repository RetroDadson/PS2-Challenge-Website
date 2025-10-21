using System.Text.Json;
using System.Text.Json.Serialization;

namespace PS2Challenge.Api.Api.Models;

public class TimeSpanConverter : JsonConverter<TimeSpan?>
{
    public override TimeSpan? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var value = reader.GetString();

        if (string.IsNullOrWhiteSpace(value))
            return null;

        // Parse format like "30:15:45" or "1.06:15:45" (days.hours:minutes:seconds)
        if (TimeSpan.TryParse(value, out var timeSpan))
        {
            return timeSpan;
        }

        throw new JsonException($"Unable to parse TimeSpan: {value}");
    }

    public override void Write(Utf8JsonWriter writer, TimeSpan? value, JsonSerializerOptions options)
    {
        if (value.HasValue)
        {
            // Format as hours:minutes:seconds (e.g., "30:15:45" for 30 hours, 15 minutes, 45 seconds)
            var totalHours = (int)value.Value.TotalHours;
            var minutes = value.Value.Minutes;
            var seconds = value.Value.Seconds;
            writer.WriteStringValue($"{totalHours:D2}:{minutes:D2}:{seconds:D2}");
        }
        else
        {
            writer.WriteNullValue();
        }
    }
}
