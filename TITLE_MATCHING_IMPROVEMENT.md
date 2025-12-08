# Title Matching Improvement - Case-Insensitive & Fuzzy Matching

## Summary
Implemented case-insensitive and fuzzy title matching throughout the application to improve game lookups. The system now handles variations in capitalization, special characters, and can also search alternate titles as a fallback.

## Changes Made

### 1. Created TitleMatchingHelper Class
**Location:** `src\PS2Challenge.Backend\Helpers\TitleMatchingHelper.cs`

This static helper class provides centralized title matching functionality:

- **NormalizeTitle(string? title)**: Normalizes titles by:
  - Converting to lowercase
  - Removing special characters (punctuation, symbols)
  - Replacing multiple spaces with single space
  - Trimming whitespace
  
  Example transformations:
  - `"Grand Theft Auto: San Andreas"` ? `"grand theft auto san andreas"`
  - `".hack//G.U."` ? `"hack g u"`
  - `"Ratchet & Clank"` ? `"ratchet clank"`

- **TitlesMatch(string? title1, string? title2)**: Compares two titles using:
  1. Exact match (case-insensitive)
  2. Normalized fuzzy match (removes special characters)
  
- **TitleContains(string? title, string? searchTerm)**: Case-insensitive substring search

- **CreateLikePattern(string searchTerm)**: Creates SQL LIKE patterns with proper escaping

### 2. Updated GameService
**Location:** `src\PS2Challenge.Backend\Services\GameService.cs`

Added a new private method `FindGameByTitleAsync` that implements a multi-tier search strategy:

1. **Exact match (case-insensitive)**: Uses `EF.Functions.Like` for database-level case-insensitive comparison
2. **Fuzzy match**: Normalizes both search term and database titles to match despite special characters
3. **Alternate titles (case-insensitive)**: Searches the alternate_titles table
4. **Alternate titles (fuzzy)**: Applies fuzzy matching to alternate titles

Updated methods to use fuzzy matching:
- `AddGameAsync`: Prevents duplicate games even with different capitalization/punctuation
- `AddExcludedGameAsync`: Finds games regardless of how the title is typed
- `AddGameOwnedAsync`: Matches games with case/special character variations
- `UpsertProgressAsync`: Allows progress tracking with flexible title matching
- `AddSerialNumberAsync`: Links serial numbers to games with fuzzy matching

### 3. Updated GameRepository
**Location:** `src\PS2Challenge.Backend\Data\Repositories\GameRepository.cs`

Modified `ExistsByTitleAsync` to use:
1. Case-insensitive exact match first
2. Fuzzy matching as fallback

### 4. Unit Tests
**Location:** `src\PS2Challenge.Backend.Tests\Helpers\TitleMatchingHelperTests.cs`

Created comprehensive tests covering:
- Title normalization with various special characters
- Case-insensitive matching
- Fuzzy matching scenarios
- Edge cases (null, empty, whitespace)
- SQL LIKE pattern generation
- Multiple spaces and trimming

All 36 tests pass successfully.

## Examples

### Before (Case-Sensitive)
```csharp
// Would NOT find the game
await AddGameOwnedAsync("grand theft auto", true, "PAL");
// Database has: "Grand Theft Auto"
```

### After (Case-Insensitive + Fuzzy)
```csharp
// All of these now work:
await AddGameOwnedAsync("grand theft auto", true, "PAL");
await AddGameOwnedAsync("GRAND THEFT AUTO", true, "PAL");
await AddGameOwnedAsync("Grand Theft Auto", true, "PAL");

// Even with special character variations:
await AddGameOwnedAsync("Grand Theft Auto: San Andreas", ...);
await AddGameOwnedAsync("Grand Theft Auto - San Andreas", ...); // Fuzzy match!
```

### Alternate Title Fallback
```csharp
// If database has:
// - Main title: "Ratchet & Clank"
// - Alternate title: "Ratchet and Clank"

// Both of these work:
await AddGameOwnedAsync("Ratchet & Clank", ...);
await AddGameOwnedAsync("Ratchet and Clank", ...);
```

## Performance Considerations

The fuzzy matching approach uses a tiered strategy:
1. Database-level operations first (fastest)
2. In-memory comparison only as fallback
3. Alternate title lookup only if main title not found

For most lookups, the exact case-insensitive match at the database level will succeed, avoiding expensive in-memory operations.

## Database Schema

The existing alternate_titles table is leveraged for fallback matching:
```sql
CREATE TABLE alternate_titles (
    alternate_title_id INT PRIMARY KEY,
    game_id INT NOT NULL,
    title VARCHAR(150) NOT NULL UNIQUE,
    notes VARCHAR(500),
    FOREIGN KEY (game_id) REFERENCES games(game_id)
);
```

## Future Enhancements

Potential improvements for even better performance:

1. **Add normalized_title column to games table** (indexed)
   - Store pre-normalized titles for faster fuzzy matching
   - Avoid in-memory normalization

2. **Full-text search**
   - PostgreSQL: Use `tsvector` for advanced text search
   - Would handle typos, stemming, etc.

3. **Caching**
   - Cache frequently searched titles
   - Reduce database hits for common lookups

## Breaking Changes

None. This is a backward-compatible enhancement. All existing code continues to work, but now with improved matching capabilities.

## Testing

Run the helper tests:
```bash
dotnet test --filter "FullyQualifiedName~TitleMatchingHelperTests"
```

Run all backend tests:
```bash
dotnet test src\PS2Challenge.Backend.Tests\PS2Challenge.Backend.Tests.csproj
```
