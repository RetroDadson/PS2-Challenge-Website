using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace PS2Challenge.Main.Frontend.Models;

public class DateOnlyJsonConverter : JsonConverter<DateOnly>
{
    public override DateOnly Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var dateString = reader.GetString();

        if (string.IsNullOrWhiteSpace(dateString))
            throw new JsonException("Date string is null or empty");

        // Parse ISO format from API (yyyy-MM-dd)
        return DateOnly.Parse(dateString, CultureInfo.InvariantCulture);
    }

    public override void Write(Utf8JsonWriter writer, DateOnly value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(value.ToString("yyyy-MM-dd"));
    }
}
