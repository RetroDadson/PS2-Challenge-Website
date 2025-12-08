using PS2Challenge.Backend.Helpers;

namespace PS2Challenge.Backend.Tests.Helpers;

public class TitleMatchingHelperTests
{
    [Theory]
    [InlineData("Grand Theft Auto", "grand theft auto")]
    [InlineData("Grand Theft Auto: San Andreas", "grand theft auto san andreas")]
    [InlineData(".hack//G.U.", "hack g u")]
    [InlineData("Ratchet & Clank", "ratchet clank")]
    [InlineData("Tony Hawk's Pro Skater 3", "tony hawk s pro skater 3")]
    [InlineData("Metal Gear Solid 2: Sons of Liberty", "metal gear solid 2 sons of liberty")]
    [InlineData("The Lord of the Rings: The Two Towers", "the lord of the rings the two towers")]
    public void NormalizeTitle_RemovesSpecialCharactersAndLowercase(string input, string expected)
    {
        // Act
        var result = TitleMatchingHelper.NormalizeTitle(input);

        // Assert
        Assert.Equal(expected, result);
    }

    [Theory]
    [InlineData("Grand Theft Auto", "grand theft auto", true)]
    [InlineData("Grand Theft Auto", "Grand Theft Auto", true)]
    [InlineData("Grand Theft Auto", "GRAND THEFT AUTO", true)]
    [InlineData("Grand Theft Auto: San Andreas", "Grand Theft Auto - San Andreas", true)]
    [InlineData("Ratchet & Clank", "Ratchet and Clank", false)] // Different words, shouldn't match
    [InlineData(".hack//G.U.", "hack G.U.", true)]
    [InlineData("Metal Gear Solid 2", "Metal Gear Solid 2: Sons of Liberty", false)] // Different lengths
    [InlineData("", "", false)] // Empty strings
    [InlineData(null, null, false)] // Null strings
    [InlineData("Test", null, false)]
    [InlineData(null, "Test", false)]
    public void TitlesMatch_ComparesCorrectly(string? title1, string? title2, bool expectedMatch)
    {
        // Act
        var result = TitleMatchingHelper.TitlesMatch(title1, title2);

        // Assert
        Assert.Equal(expectedMatch, result);
    }

    [Theory]
    [InlineData("Grand Theft Auto", true)]
    [InlineData("GRAND THEFT AUTO", true)]
    [InlineData("grand theft auto", true)]
    [InlineData("theft", true)]
    [InlineData("", true)]
    [InlineData(null, true)]
    [InlineData("Not There", false)]
    public void TitleContains_FindsSubstring(string? searchTerm, bool expectedResult)
    {
        // Arrange
        var title = "Grand Theft Auto: San Andreas";

        // Act
        var result = TitleMatchingHelper.TitleContains(title, searchTerm);

        // Assert
        Assert.Equal(expectedResult, result);
    }

    [Fact]
    public void TitleContains_HandlesNullTitle()
    {
        // Act
        var result = TitleMatchingHelper.TitleContains(null, "test");

        // Assert
        Assert.False(result);
    }

    [Theory]
    [InlineData("test%value", "%test\\%value%")]
    [InlineData("test_value", "%test\\_value%")]
    [InlineData("test[value", "%test\\[value%")]
    [InlineData("test\\value", "%test\\\\value%")]
    [InlineData("normal", "%normal%")]
    public void CreateLikePattern_EscapesSpecialCharacters(string input, string expected)
    {
        // Act
        var result = TitleMatchingHelper.CreateLikePattern(input);

        // Assert
        Assert.Equal(expected, result);
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("   ")]
    public void NormalizeTitle_HandlesEmptyInput(string? input)
    {
        // Act
        var result = TitleMatchingHelper.NormalizeTitle(input);

        // Assert
        Assert.Equal(string.Empty, result);
    }

    [Fact]
    public void NormalizeTitle_HandlesMultipleSpaces()
    {
        // Arrange
        var input = "Grand    Theft     Auto";

        // Act
        var result = TitleMatchingHelper.NormalizeTitle(input);

        // Assert
        Assert.Equal("grand theft auto", result);
    }

    [Fact]
    public void NormalizeTitle_TrimsWhitespace()
    {
        // Arrange
        var input = "  Grand Theft Auto  ";

        // Act
        var result = TitleMatchingHelper.NormalizeTitle(input);

        // Assert
        Assert.Equal("grand theft auto", result);
    }
}
