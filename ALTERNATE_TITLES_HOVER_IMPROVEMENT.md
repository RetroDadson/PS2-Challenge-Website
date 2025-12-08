# Alternate Titles Hover Tooltip Improvement

## Summary
Updated the alternate titles hover tooltip on the Games page to display titles on separate lines instead of comma-separated for better readability.

## Change Made

### File Modified
- **`src/PS2Challenge.Main/Frontend/Pages/Games.razor`**

### Code Change
Changed the `GetAlternateTitles` method from:
```csharp
private string GetAlternateTitles(int gameId)
{
    if (alternateTitles.TryGetValue(gameId, out var titles) && titles.Any())
    {
        return string.Join(", ", titles.Select(t => t.Title));  // OLD: comma-separated
    }
    return "No alternate titles";
}
```

To:
```csharp
private string GetAlternateTitles(int gameId)
{
    if (alternateTitles.TryGetValue(gameId, out var titles) && titles.Any())
    {
        return string.Join("<br />", titles.Select(t => t.Title));  // NEW: line breaks
    }
    return "No alternate titles";
}
```

## How It Works

The `HoverCard` component (used on line ~175 in Games.razor) renders content as `MarkupString`, which allows HTML to be rendered:

```razor
<HoverCard Content="@GetAlternateTitles(game.Id)">
    <span style="border-bottom: 1px dotted var(--primary-color);">@game.Title</span>
</HoverCard>
```

The `HoverCard.razor` component uses:
```razor
<div class="hover-card" role="tooltip" aria-hidden="true">
    @((MarkupString)Content)  <!-- Renders HTML -->
</div>
```

## Visual Impact

### Before
```
Hover tooltip shows:
Title 1, Title 2, Title 3
```

### After
```
Hover tooltip shows:
Title 1
Title 2
Title 3
```

## Benefits

1. **Better Readability**: Each alternate title is on its own line, making it easier to distinguish between multiple titles
2. **Cleaner Presentation**: Especially helpful when games have 3+ alternate titles
3. **Consistent with UI Pattern**: Matches the vertical list pattern used elsewhere in the application

## Testing Recommendations

1. Navigate to `/games` page
2. Find a game with alternate titles (indicated by dotted underline on title)
3. Hover over the game title to see the tooltip
4. Verify alternate titles are displayed on separate lines

## Related Files

- **Hover Component**: `src/PS2Challenge.Main/Frontend/Shared/HoverCard.razor`
- **Styles**: `src/PS2Challenge.Main/Frontend/Shared/HoverCard.razor.css`
- **Backend Support**: `src/PS2Challenge.Backend/Services/GameService.cs` (GetAlternateTitlesAsync method)

## Build Status
? **Build Successful** - All projects compile without errors

---

**Date**: {{TODAY}}  
**Issue**: Alternate titles displayed with commas instead of newlines in hover tooltip  
**Solution**: Changed `string.Join` separator from `", "` to `"<br />"`  
**Status**: ? Complete
