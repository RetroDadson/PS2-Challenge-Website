using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace PS2Challenge.Api.Api.Models;

public class NullableFlexibleDateOnlyConverter : JsonConverter<DateOnly?>
{
    // Only accept ISO format for Api requests - removes ambiguity
    private readonly string[] _formats = new[]
    {
        "yyyy-MM-dd"     // ISO format only
    };

    public override DateOnly? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var dateString = reader.GetString();

        if (string.IsNullOrWhiteSpace(dateString))
            return null;

        // Try ISO format with invariant culture to avoid US/UK confusion
        if (DateTime.TryParseExact(dateString, _formats[0], CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
        {
            return DateOnly.FromDateTime(date);
        }

        throw new JsonException($"Unable to parse date: {dateString}. Expected yyyy-MM-dd format.");
    }

    public override void Write(Utf8JsonWriter writer, DateOnly? value, JsonSerializerOptions options)
    {
        if (value.HasValue)
        {
            // Write as ISO format (yyyy-MM-dd) for JSON - standard format
            writer.WriteStringValue(value.Value.ToString("yyyy-MM-dd"));
        }
        else
        {
            writer.WriteNullValue();
        }
    }
}
