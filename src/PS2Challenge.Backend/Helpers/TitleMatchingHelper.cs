using System.Text;
using System.Text.RegularExpressions;

namespace PS2Challenge.Backend.Helpers;

/// <summary>
/// Helper class for fuzzy title matching with case-insensitive and special character normalization support.
/// </summary>
public static class TitleMatchingHelper
{
    /// <summary>
    /// Normalizes a title by removing special characters and converting to lowercase.
    /// This creates a normalized version suitable for fuzzy matching.
    /// </summary>
    /// <param name="title">The title to normalize</param>
    /// <returns>Normalized title string</returns>
    public static string NormalizeTitle(string? title)
    {
        if (string.IsNullOrWhiteSpace(title))
            return string.Empty;

        // Convert to lowercase
        var normalized = title.ToLowerInvariant();

        // Remove common special characters, but keep spaces
        // This handles cases like "Grand Theft Auto: San Andreas" -> "grand theft auto san andreas"
        normalized = Regex.Replace(normalized, @"[^\w\s]", " ");

        // Replace multiple spaces with single space
        normalized = Regex.Replace(normalized, @"\s+", " ");

        // Trim
        return normalized.Trim();
    }

    /// <summary>
    /// Checks if two titles match, using both exact (case-insensitive) and normalized (fuzzy) comparison.
    /// </summary>
    /// <param name="title1">First title to compare</param>
    /// <param name="title2">Second title to compare</param>
    /// <returns>True if titles match, false otherwise</returns>
    public static bool TitlesMatch(string? title1, string? title2)
    {
        if (string.IsNullOrWhiteSpace(title1) || string.IsNullOrWhiteSpace(title2))
            return false;

        var trimmed1 = title1.Trim();
        var trimmed2 = title2.Trim();

        // Try exact match first (case-insensitive)
        if (string.Equals(trimmed1, trimmed2, StringComparison.OrdinalIgnoreCase))
            return true;

        // Try normalized match (fuzzy)
        var normalized1 = NormalizeTitle(trimmed1);
        var normalized2 = NormalizeTitle(trimmed2);

        return string.Equals(normalized1, normalized2, StringComparison.Ordinal);
    }

    /// <summary>
    /// Creates a SQL LIKE pattern for case-insensitive partial matching.
    /// Escapes special SQL LIKE characters.
    /// </summary>
    /// <param name="searchTerm">The search term</param>
    /// <returns>SQL LIKE pattern with wildcards</returns>
    public static string CreateLikePattern(string searchTerm)
    {
        if (string.IsNullOrWhiteSpace(searchTerm))
            return "%";

        // Escape special LIKE characters
        var escaped = searchTerm
            .Replace("\\", "\\\\")
            .Replace("%", "\\%")
            .Replace("_", "\\_")
            .Replace("[", "\\[");

        return $"%{escaped}%";
    }

    /// <summary>
    /// Checks if a title contains a search term (case-insensitive).
    /// </summary>
    /// <param name="title">The title to search in</param>
    /// <param name="searchTerm">The term to search for</param>
    /// <returns>True if the title contains the search term, false otherwise</returns>
    public static bool TitleContains(string? title, string? searchTerm)
    {
        if (string.IsNullOrWhiteSpace(title))
            return false;

        if (string.IsNullOrWhiteSpace(searchTerm))
            return true;

        return title.Contains(searchTerm, StringComparison.OrdinalIgnoreCase);
    }
}
