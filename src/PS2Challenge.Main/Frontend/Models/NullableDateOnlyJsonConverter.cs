using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace PS2Challenge.Main.Frontend.Models;

public class NullableDateOnlyJsonConverter : JsonConverter<DateOnly?>
{
    public override DateOnly? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var dateString = reader.GetString();

        if (string.IsNullOrWhiteSpace(dateString)) return null;

        // Parse ISO format from API (yyyy-MM-dd)
        return DateOnly.Parse(dateString, CultureInfo.InvariantCulture);
    }

    public override void Write(Utf8JsonWriter writer, DateOnly? value, JsonSerializerOptions options)
    {
        if (value.HasValue)
            writer.WriteStringValue(value.Value.ToString("yyyy-MM-dd"));
        else
            writer.WriteNullValue();
    }
}
