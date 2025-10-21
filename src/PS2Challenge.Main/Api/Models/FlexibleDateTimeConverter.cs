using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace PS2Challenge.Api.Api.Models;

public class FlexibleDateTimeConverter : JsonConverter<DateTime>
{
    // Only accept ISO formats for Api requests - removes ambiguity
    private readonly string[] _formats = new[]
    {
        "yyyy-MM-ddTHH:mm:ss",  // ISO format with time
        "yyyy-MM-dd"            // ISO format date only
    };

    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var dateString = reader.GetString();

        if (string.IsNullOrWhiteSpace(dateString))
            throw new JsonException("Date string is null or empty");

        // Try ISO formats with invariant culture to avoid US/UK confusion
        foreach (var format in _formats)
        {
            if (DateTime.TryParseExact(dateString, format, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            {
                return date;
            }
        }

        throw new JsonException($"Unable to parse date: {dateString}. Expected yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss format.");
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        // Write as ISO format for JSON - standard format
        writer.WriteStringValue(value.ToString("yyyy-MM-ddTHH:mm:ss"));
    }
}
