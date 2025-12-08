# Model Consolidation Refactoring - Summary

## Overview
This document summarizes the refactoring performed to consolidate API request/response models from the `PS2Challenge.Main` project to the `PS2Challenge.Backend` project, following best practices for code organization.

## Problem
API models were initially created in `PS2Challenge.Main/Api/Models/` which led to:
- Code duplication (similar models existed in a non-existent `PS2Challenge.Api` project reference)
- Scattered model definitions across projects
- Potential maintenance issues with duplicate code
- Unclear separation of concerns

## Solution: Option A - Consolidate to Backend
We followed **Option A: Consolidate to Backend** which involves:
1. Creating a new `Api` subdirectory in `PS2Challenge.Backend/Models/`
2. Moving all API-specific request/response models there
3. Using namespace `PS2Challenge.Backend.Models.Api`
4. Removing duplicates from PS2Challenge.Main

## Changes Made

### 1. New Files Created in Backend

**`src/PS2Challenge.Backend/Models/Api/AlternateTitleModels.cs`**
```csharp
namespace PS2Challenge.Backend.Models.Api;

public class AddAlternateTitleRequest
{
    public required string Title { get; set; }
    public string? Notes { get; set; }
}
```

**`src/PS2Challenge.Backend/Models/Api/SerialNumberModels.cs`**
```csharp
namespace PS2Challenge.Backend.Models.Api;

public class AddSerialNumberRequest { ... }
public class AddSerialNumberResponse { ... }
public class SerialNumberConflictResponse { ... }
```

### 2. Updated Files

**`src/PS2Challenge.Main/Api/Controllers/GamesController.cs`**
- Updated using statement from:
  ```csharp
  using PS2Challenge.Main.Api.Models;
  ```
  To:
  ```csharp
  using PS2Challenge.Backend.Models.Api;
  ```
- Removed duplicate model class definitions at the end of the file
- Kept only controller-specific models (`UpdateExclusionRequest`, `UpdateOwnershipRequest`) as nested classes

### 3. Deleted Files

- ? `src/PS2Challenge.Main/Api/Models/AlternateTitleModels.cs` (removed)
- ? `src/PS2Challenge.Main/Api/Models/SerialNumberModels.cs` (removed)

## Benefits

### ? **Single Source of Truth**
- All API models are now in one centralized location
- No code duplication across projects

### ? **Better Organization**
- Clear separation: Domain models in `PS2Challenge.Backend/Models/`
- API-specific DTOs in `PS2Challenge.Backend/Models/Api/`

### ? **Easier Maintenance**
- Changes to API contracts only need to be made in one place
- Easier to find and update models

### ? **Proper Layering**
- PS2Challenge.Main already references PS2Challenge.Backend
- Backend project contains shared models accessible to all layers

### ? **Scalability**
- Easy to add more API models in the future
- Clear pattern established for where new models should go

## File Structure

```
PS2Challenge.Backend/
??? Models/
    ??? Api/                          # NEW: API-specific models
    ?   ??? AlternateTitleModels.cs
    ?   ??? SerialNumberModels.cs
    ??? GameDto.cs                    # Domain models
    ??? AlternateTitle.cs
    ??? GameSerialNumber.cs
    ??? ...other domain models

PS2Challenge.Main/
??? Api/
    ??? Controllers/
        ??? GamesController.cs        # Uses Backend.Models.Api
```

## Alternative Approaches Considered

### Option B: Keep API Models Separate
- Keep request/response models in `PS2Challenge.Main/Api/Models/`
- Pros: API layer controls its own contracts
- Cons: Still had duplication issues, less centralized

### Option C: Create Contracts Project
- Create new `PS2Challenge.Contracts` project
- Pros: Most enterprise-grade, clear contract boundaries
- Cons: Overkill for this project size, added complexity

## Migration Guide

If you need to add new API models in the future:

1. **Create the model file** in `src/PS2Challenge.Backend/Models/Api/`
2. **Use the namespace** `PS2Challenge.Backend.Models.Api`
3. **Import in controllers** with `using PS2Challenge.Backend.Models.Api;`
4. **Name conventions**:
   - Requests: `{Action}{Resource}Request` (e.g., `AddGameRequest`)
   - Responses: `{Action}{Resource}Response` (e.g., `AddGameResponse`)

## Verification

? Build successful
? No duplicate code
? All imports resolved correctly
? Namespaces consistent throughout project

## Related Documentation

- `ALTERNATE_TITLES_API_DOCUMENTATION.md` - API endpoint documentation
- `ALTERNATE_TITLES_FEATURE_SUMMARY.md` - Feature implementation summary

---

**Refactoring completed:** {{DATE}}
**Approach used:** Option A - Consolidate to Backend
**Status:** ? Complete and tested
