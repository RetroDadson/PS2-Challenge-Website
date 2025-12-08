# Alternate Titles Feature - Implementation Summary

## Overview
Added a new "AlternateTitles" feature to the PS2 Challenge application. This allows games to have multiple alternate titles associated with them, which is useful for games that were released with different names in different regions.

## Database Changes

### New Table: `alternate_titles`
- **Primary Key**: `alternate_title_id` (auto-increment)
- **Foreign Key**: `game_id` ? `games.game_id` (CASCADE on delete)
- **Columns**:
  - `title` (string, max 150 chars, required)
  - `notes` (string, max 500 chars, nullable)
- **Indexes**:
  - `idx_alternate_titles_game_id` on `game_id` for fast lookups

### Migration
Created migration file: `011_AddAlternateTitles.cs`

## Backend Changes

### 1. New Model: `AlternateTitle.cs`
Location: `src/PS2Challenge.Backend/Models/AlternateTitle.cs`

```csharp
public class AlternateTitle
{
    [Key]
    public int AlternateTitleId { get; set; }
    
    [Required]
    public int GameId { get; set; }
    
    [Required]
    [StringLength(150)]
    public string Title { get; set; } = string.Empty;
    
    [StringLength(500)]
    public string? Notes { get; set; }
}
```

### 2. DbContext Updates
Location: `src/PS2Challenge.Backend/Data/Ps2ChallengeDbContext.cs`

- Added `DbSet<AlternateTitle> AlternateTitles`
- Configured entity mapping with proper column names and foreign key relationship

### 3. GameService Updates
Location: `src/PS2Challenge.Backend/Services/GameService.cs`

Added new method:
```csharp
public virtual async Task<Dictionary<int, List<AlternateTitle>>> GetAlternateTitlesAsync()
```

This method returns a dictionary mapping game IDs to their list of alternate titles.

### 4. Test Coverage
Location: `src/PS2Challenge.Backend.Tests/Models/ModelTests.cs`

Added comprehensive tests:
- `AlternateTitleTests` class with multiple test cases:
  - Basic creation
  - Required fields only
  - Default values
  - Multiple alternate titles for same game
  - Titles in different regions

Location: `src/PS2Challenge.Backend.Tests/Helpers/TestDataBuilders.cs`

Added `AlternateTitleBuilder` for fluent test data generation.

## Frontend Changes

### 1. GameEditModal Component
Location: `src/PS2Challenge.Main/Frontend/Components/GameEditModal.razor`

**New Features**:
- Added "Alternate Titles" section in the modal (placed before Serial Numbers)
- UI to display existing alternate titles
- Form to add new alternate titles with title and notes fields
- Remove button for each alternate title
- Loading state while fetching data

**Code Changes**:
- Added `AlternateTitleEntry` class to track alternate titles (similar to `SerialNumberEntry`)
- Added fields for managing alternate titles:
  - `alternateTitles` list
  - `newAlternateTitle`, `newAlternateTitleNotes` form fields
- Added methods:
  - `LoadAlternateTitles()` - Loads existing alternate titles for a game
  - `AddAlternateTitle()` - Adds new alternate title to the list
  - `RemoveAlternateTitle()` - Marks alternate title for deletion or removes from list
  - `ClearAlternateTitleForm()` - Clears the add form fields
  - `SaveAlternateTitles()` - Saves alternate titles to database (inserts new, deletes marked)

**CSS Styles**:
Location: `src/PS2Challenge.Main/Frontend/Components/GameEditModal.razor.css`

Added styles for:
- `.alternate-titles-section` - Container styling
- `.alternate-titles-list` - List layout
- `.alternate-title-item` - Individual title item with hover effects
- `.alternate-title-display` - Title display
- `.alternate-title-text` - Title text styling
- `.alternate-notes` - Notes text styling
- `.add-alternate-title-form` - Add form styling with purple tint

### 2. Games Page
Location: `src/PS2Challenge.Main/Frontend/Pages/Games.razor`

**New Features**:
- Displays alternate titles in the game title column using a hover card
- Titles with alternate titles show a dotted underline to indicate additional information
- Search functionality now includes alternate titles
- Alternate titles display format: "Title, Title2, Title3"

**Code Changes**:
- Added `alternateTitles` dictionary field
- Added `LoadAlternateTitles()` method called on initialization
- Added `GetAlternateTitles()` method to format alternate titles for display
- Updated search filter to include alternate titles in search results
- Updated `HandleSave()` and `HandleDelete()` to reload alternate titles
- Modified title cell to show `HoverCard` when alternate titles exist
- Added `@using PS2Challenge.Backend.Models` to access AlternateTitle type

## User Experience

### Adding/Editing Alternate Titles
1. Admin users can click "Edit" on any game or "Add New Game"
2. In the modal, scroll to the "Alternate Titles" section
3. Click "+ Add Alternate Title" after filling in:
   - **Alternate Title** (required): The alternate name
   - **Notes** (optional): Additional context
4. Added titles appear in the list
5. Click × to remove an alternate title
6. Click "Update" or "Create" to save changes

### Viewing Alternate Titles
1. On the Games page, titles with alternate titles show a dotted underline
2. Hover over the title to see all alternate titles in a tooltip
3. Format: "Ratchet & Clank 2, Ratchet & Clank 2: Going Commando"

### Searching
Users can now search for games by their alternate titles. For example:
- Searching for "Commando" will find "Ratchet & Clank: Going Commando" even if the main title is different

## Database Relationships

```
games (1) ?? (many) alternate_titles
   ?                    ?
game_id ? FK ? game_id
```

**Cascade Delete**: When a game is deleted, all its alternate titles are automatically deleted.

## Examples

### Example 1: Ratchet & Clank Series
- Main Title: "Ratchet & Clank: Locked and Loaded"
- Alternate Titles:
  - "Ratchet & Clank 2" (Notes: European release title)
  - "Ratchet & Clank 2: Going Commando" (Notes: North American release)
  - "Ratchet & Clank 2: Gagaga! Ginga no Commando" (Notes: Japanese title)

### Example 2: Gran Turismo
- Main Title: "Gran Turismo 4"
- Alternate Titles:
  - "????????4" (Notes: Japanese title)
  - "Gran Turismo 4: Prologue" (Notes: Early release version)

## Files Created/Modified

### Created Files
1. `src/PS2Challenge.Backend/Models/AlternateTitle.cs`
2. `src/PS2Challenge.Backend/Data/Migrations/011_AddAlternateTitles.cs`
3. `ALTERNATE_TITLES_FEATURE_SUMMARY.md` (this file)

### Modified Files
1. `src/PS2Challenge.Backend/Data/Ps2ChallengeDbContext.cs`
2. `src/PS2Challenge.Backend/Services/GameService.cs`
3. `src/PS2Challenge.Main/Frontend/Components/GameEditModal.razor`
4. `src/PS2Challenge.Main/Frontend/Components/GameEditModal.razor.css`
5. `src/PS2Challenge.Main/Frontend/Pages/Games.razor`
6. `src/PS2Challenge.Backend.Tests/Models/ModelTests.cs`
7. `src/PS2Challenge.Backend.Tests/Helpers/TestDataBuilders.cs`

## Next Steps

To apply these changes to your database:

1. **Run the migration**:
   - The migration will run automatically when the application starts
   - Or manually run the migration runner if you have a separate process

2. **Test the feature**:
   - Start the application
   - Log in as an admin
   - Edit an existing game or add a new one
   - Add alternate titles and verify they appear in the modal
   - Save and verify titles appear with hover tooltips on the Games page
   - Test the search functionality with alternate titles

3. **Hot Reload** (if debugging):
   - Since you're currently debugging, you can use hot reload to apply the changes
   - The database migration will need to be applied separately

## Design Decisions

1. **Similar to Serial Numbers**: The implementation follows the same pattern as GameSerialNumber for consistency
2. **Many-to-One Relationship**: Multiple alternate titles can belong to one game
3. **Cascade Delete**: Alternate titles are automatically deleted when a game is deleted
4. **No Region Field**: Region information removed to simplify the model - users can add region info in the notes field if needed
5. **Search Integration**: Alternate titles are included in search to improve discoverability
6. **Visual Indicator**: Dotted underline shows which games have alternate titles
7. **Color Coding**: Purple theme for alternate titles (secondary color) vs pink for serial numbers (primary color)
8. **Placement**: Alternate titles section appears before serial numbers in the edit modal as titles are more prominently used than technical serial numbers

## Benefits

1. **Better Game Discovery**: Users can find games by any of their regional names
2. **Regional Context**: Shows how games were marketed in different regions (via notes field)
3. **Data Richness**: Provides more complete information about game releases
4. **User-Friendly**: Clear visual indicators and tooltips make the feature intuitive
5. **Admin Control**: Only admins can add/edit alternate titles, maintaining data quality
6. **Simplified Model**: No separate region field keeps the data model simple and flexible
