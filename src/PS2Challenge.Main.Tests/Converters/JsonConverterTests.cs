using PS2Challenge.Api.Api.Models;
using System.Text.Json;

namespace PS2Challenge.Main.Tests.Converters;

public class FlexibleDateOnlyConverterTests
{
    private readonly JsonSerializerOptions _options;

    public FlexibleDateOnlyConverterTests()
    {
        _options = new JsonSerializerOptions();
        _options.Converters.Add(new FlexibleDateOnlyConverter());
    }

    [Fact]
    public void Read_ParsesIsoFormatCorrectly()
    {
        // Arrange
        var json = "\"2024-01-15\"";

        // Act
        var result = JsonSerializer.Deserialize<DateOnly>(json, _options);

        // Assert
        Assert.Equal(new DateOnly(2024, 1, 15), result);
    }

    [Fact]
    public void Read_ThrowsOnEmptyString()
    {
        // Arrange
        var json = "\"\"";

        // Act & Assert
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<DateOnly>(json, _options));
    }

    [Fact]
    public void Read_ThrowsOnWhitespaceString()
    {
        // Arrange
        var json = "\"   \"";

        // Act & Assert
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<DateOnly>(json, _options));
    }

    [Fact]
    public void Read_ThrowsOnInvalidFormat()
    {
        // Arrange
        var json = "\"15/01/2024\""; // UK format, not supported

        // Act & Assert
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<DateOnly>(json, _options));
    }

    [Fact]
    public void Read_ThrowsOnUSFormat()
    {
        // Arrange
        var json = "\"01/15/2024\""; // US format, not supported

        // Act & Assert
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<DateOnly>(json, _options));
    }

    [Fact]
    public void Read_ThrowsOnInvalidDate()
    {
        // Arrange
        var json = "\"2024-13-45\""; // Invalid month and day

        // Act & Assert
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<DateOnly>(json, _options));
    }

    [Fact]
    public void Write_OutputsIsoFormat()
    {
        // Arrange
        var date = new DateOnly(2024, 1, 15);

        // Act
        var json = JsonSerializer.Serialize(date, _options);

        // Assert
        Assert.Equal("\"2024-01-15\"", json);
    }

    [Fact]
    public void Write_OutputsIsoFormat_WithSingleDigitMonth()
    {
        // Arrange
        var date = new DateOnly(2024, 3, 5);

        // Act
        var json = JsonSerializer.Serialize(date, _options);

        // Assert
        Assert.Equal("\"2024-03-05\"", json);
    }
}

public class NullableFlexibleDateOnlyConverterTests
{
    private readonly JsonSerializerOptions _options;

    public NullableFlexibleDateOnlyConverterTests()
    {
        _options = new JsonSerializerOptions();
        _options.Converters.Add(new NullableFlexibleDateOnlyConverter());
    }

    [Fact]
    public void Read_ParsesIsoFormatCorrectly()
    {
        // Arrange
        var json = "\"2024-01-15\"";

        // Act
        var result = JsonSerializer.Deserialize<DateOnly?>(json, _options);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(new DateOnly(2024, 1, 15), result.Value);
    }

    [Fact]
    public void Read_ReturnsNullForEmptyString()
    {
        // Arrange
        var json = "\"\"";

        // Act
        var result = JsonSerializer.Deserialize<DateOnly?>(json, _options);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Read_ReturnsNullForWhitespaceString()
    {
        // Arrange
        var json = "\"   \"";

        // Act
        var result = JsonSerializer.Deserialize<DateOnly?>(json, _options);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Read_ReturnsNullForNull()
    {
        // Arrange
        var json = "null";

        // Act
        var result = JsonSerializer.Deserialize<DateOnly?>(json, _options);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Read_ThrowsOnInvalidFormat()
    {
        // Arrange
        var json = "\"15/01/2024\""; // UK format, not supported

        // Act & Assert
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<DateOnly?>(json, _options));
    }

    [Fact]
    public void Read_ThrowsOnUSFormat()
    {
        // Arrange
        var json = "\"01/15/2024\""; // US format, not supported

        // Act & Assert
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<DateOnly?>(json, _options));
    }

    [Fact]
    public void Write_OutputsIsoFormat()
    {
        // Arrange
        DateOnly? date = new DateOnly(2024, 1, 15);

        // Act
        var json = JsonSerializer.Serialize(date, _options);

        // Assert
        Assert.Equal("\"2024-01-15\"", json);
    }

    [Fact]
    public void Write_OutputsNullForNull()
    {
        // Arrange
        DateOnly? date = null;

        // Act
        var json = JsonSerializer.Serialize(date, _options);

        // Assert
        Assert.Equal("null", json);
    }
}

public class TimeSpanConverterTests
{
    private readonly JsonSerializerOptions _options;

    public TimeSpanConverterTests()
    {
        _options = new JsonSerializerOptions();
        _options.Converters.Add(new TimeSpanConverter());
    }

    [Theory]
    [InlineData("10:30:45", 10, 30, 45)]
    [InlineData("05:00:00", 5, 0, 0)]
    [InlineData("00:15:30", 0, 15, 30)]
    [InlineData("4.04:00:00", 100, 0, 0)] // Over 24 hours
    public void Read_ParsesTimeSpanCorrectly(string input, int hours, int minutes, int seconds)
    {
        // Arrange
        var json = $"\"{input}\"";

        // Act
        var result = JsonSerializer.Deserialize<TimeSpan?>(json, _options);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(new TimeSpan(hours, minutes, seconds), result.Value);
    }

    [Fact]
    public void Read_ReturnsNullForEmptyString()
    {
        // Arrange
        var json = "\"\"";

        // Act
        var result = JsonSerializer.Deserialize<TimeSpan?>(json, _options);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Read_ReturnsNullForWhitespaceString()
    {
        // Arrange
        var json = "\"   \"";

        // Act
        var result = JsonSerializer.Deserialize<TimeSpan?>(json, _options);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Read_ReturnsNullForNull()
    {
        // Arrange
        var json = "null";

        // Act
        var result = JsonSerializer.Deserialize<TimeSpan?>(json, _options);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Read_ThrowsOnInvalidFormat()
    {
        // Arrange
        var json = "\"invalid\"";

        // Act & Assert
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<TimeSpan?>(json, _options));
    }

    [Fact]
    public void Read_ThrowsOnInvalidTimeFormat()
    {
        // Arrange
        var json = "\"25:99:99\""; // Invalid time

        // Act & Assert
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<TimeSpan?>(json, _options));
    }

    [Fact]
    public void Write_OutputsCorrectFormat()
    {
        // Arrange
        TimeSpan? timeSpan = new TimeSpan(10, 30, 45);

        // Act
        var json = JsonSerializer.Serialize(timeSpan, _options);

        // Assert
        Assert.Equal("\"10:30:45\"", json);
    }

    [Fact]
    public void Write_HandlesHoursOver24()
    {
        // Arrange
        TimeSpan? timeSpan = new TimeSpan(100, 30, 45);

        // Act
        var json = JsonSerializer.Serialize(timeSpan, _options);

        // Assert
        Assert.Equal("\"100:30:45\"", json);
    }

    [Fact]
    public void Write_OutputsNullForNull()
    {
        // Arrange
        TimeSpan? timeSpan = null;

        // Act
        var json = JsonSerializer.Serialize(timeSpan, _options);

        // Assert
        Assert.Equal("null", json);
    }

    [Fact]
    public void Write_HandlesSingleDigitValues()
    {
        // Arrange
        TimeSpan? timeSpan = new TimeSpan(1, 5, 9);

        // Act
        var json = JsonSerializer.Serialize(timeSpan, _options);

        // Assert
        Assert.Equal("\"01:05:09\"", json);
    }
}
