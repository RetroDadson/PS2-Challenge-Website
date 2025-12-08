<#
.SYNOPSIS
    Imports game serial numbers from GameIndex.json and posts them to the PS2 Challenge API.

.DESCRIPTION
    This script processes a GameIndex.json file, searches for matching games in the PS2 Challenge API,
    and adds serial numbers to each game. The game lookup strategy is:
    1. Try to match using "name_en" property (if available)
    2. Fall back to "name" property
    3. If no match, try removing colons from the name
    4. If still no match, try replacing " - " with ":"

.PARAMETER GameIndexPath
    Path to the GameIndex.json file containing the game data.

.PARAMETER ApiBaseUrl
    Base URL of the PS2 Challenge API (e.g., "http://localhost:5000")

.PARAMETER ApiKey
    API key for authentication. If not provided, will prompt for it.

.EXAMPLE
    .\Import-SerialNumbers.ps1 -GameIndexPath "C:\path\to\GameIndex.json" -ApiBaseUrl "http://localhost:5000" -ApiKey "your-api-key"

.EXAMPLE
    .\Import-SerialNumbers.ps1 -GameIndexPath "GameIndex.json" -ApiBaseUrl "https://api.ps2challenge.com"
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path $_ })]
    [string]$GameIndexPath,

    [Parameter(Mandatory = $true)]
    [ValidateScript({ $_ -match '^https?://' })]
    [string]$ApiBaseUrl,

    [string]$ApiKey
)

# ============================================================================
# INITIALIZATION
# ============================================================================

Write-Host "Starting Serial Numbers Import" -ForegroundColor Cyan
Write-Host "===============================" -ForegroundColor Cyan
Write-Verbose "GameIndex Path: $GameIndexPath"
Write-Verbose "API Base URL: $ApiBaseUrl"

# Prompt for API key if not provided
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    $ApiKeySecure = Read-Host "Enter API Key" -AsSecureString
    $ApiKey = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUnicode($ApiKeySecure))
}

# Load the GameIndex.json file
try {
    $gameIndexData = Get-Content -Path $GameIndexPath | ConvertFrom-Json
    Write-Host "✓ Loaded GameIndex.json with $($gameIndexData.Count) games" -ForegroundColor Green
}
catch {
    Write-Host "✗ Failed to load GameIndex.json: $_" -ForegroundColor Red
    exit 1
}

# ============================================================================
# API HELPER FUNCTIONS
# ============================================================================

function Get-GameByTitle {
    <#
    .SYNOPSIS
    Searches for a game by title in the API and returns the game ID if found.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title
    )

    try {
        $searchUrl = "$ApiBaseUrl/api/games?title=$([Uri]::EscapeDataString($Title))"
        Write-Verbose "Searching for game: $Title at $searchUrl"

        $response = Invoke-RestMethod -Uri $searchUrl -Method Get -ErrorAction Stop

        if ($response -and $response.Count -gt 0) {
            # Return the first exact match or the first result
            $exactMatch = $response | Where-Object { $_.title -eq $Title } | Select-Object -First 1
            if ($exactMatch) {
                Write-Verbose "Found exact match: $($exactMatch.title) (ID: $($exactMatch.id))"
                return $exactMatch.id
            }

            # Return first result if no exact match
            Write-Verbose "Found partial match: $($response[0].title) (ID: $($response[0].id))"
            return $response[0].id
        }

        return $null
    }
    catch {
        Write-Verbose "Error searching for game '$Title': $_"
        return $null
    }
}

function Add-SerialNumber {
    <#
    .SYNOPSIS
    Adds a serial number to a game via the API.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$GameTitle,

        [Parameter(Mandatory = $true)]
        [string]$SerialNumber,

        [string]$Region,

        [string]$Notes
    )

    try {
        $url = "$ApiBaseUrl/api/games/serial-numbers"

        $body = @{
            title = $GameTitle
            serialNumber = $SerialNumber
        }

        if ($Region) {
            $body.region = $Region
        }

        if ($Notes) {
            $body.notes = $Notes
        }

        $jsonBody = $body | ConvertTo-Json
        Write-Verbose "POSTing to $url with body: $jsonBody"

        $response = Invoke-RestMethod -Uri $url -Method Post -Body $jsonBody `
            -ContentType "application/json" -Headers @{ "X-API-Key" = $ApiKey } `
            -ErrorAction Stop

        Write-Verbose "Successfully added serial number to game"
        return @{
            Success = $true
            Response = $response
        }
    }
    catch {
        $errorMessage = $_.Exception.Message
        $statusCode = $null

        # Try to extract status code and error details
        if ($_.Exception.Response) {
            $statusCode = $_.Exception.Response.StatusCode.value__

            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $errorBody = $reader.ReadToEnd() | ConvertFrom-Json
                $reader.Close()

                # Handle conflict (409) - serial number already exists
                if ($statusCode -eq 409) {
                    Write-Verbose "Serial number already exists for another game"
                    return @{
                        Success = $false
                        Conflict = $true
                        ErrorDetails = $errorBody
                    }
                }
            }
            catch {
                # Couldn't parse error body
            }
        }

        Write-Verbose "Error adding serial number: $errorMessage"
        return @{
            Success = $false
            Conflict = $false
            ErrorMessage = $errorMessage
        }
    }
}

# ============================================================================
# GAME NAME MATCHING STRATEGIES
# ============================================================================

function Find-GameId {
    <#
    .SYNOPSIS
    Attempts to find a game ID using multiple matching strategies.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [PSCustomObject]$GameIndexEntry
    )

    $searchStrategies = @()

    # Strategy 1: Try name_en if available
    if (![string]::IsNullOrWhiteSpace($GameIndexEntry.name_en)) {
        $searchStrategies += @{
            Name = "name_en"
            Value = $GameIndexEntry.name_en
        }
    }

    # Strategy 2: Try name property
    if (![string]::IsNullOrWhiteSpace($GameIndexEntry.name)) {
        $searchStrategies += @{
            Name = "name"
            Value = $GameIndexEntry.name
        }
    }

    # Try each strategy
    foreach ($strategy in $searchStrategies) {
        $gameId = Get-GameByTitle -Title $strategy.Value
        if ($gameId) {
            Write-Verbose "Found game using strategy '$($strategy.Name)': $($strategy.Value) -> ID $gameId"
            return @{
                GameId = $gameId
                Title = $strategy.Value
            }
        }
    }

    # Strategy 3: Try removing colons
    $nameToTry = if (![string]::IsNullOrWhiteSpace($GameIndexEntry.name_en)) {
        $GameIndexEntry.name_en
    }
    else {
        $GameIndexEntry.name
    }

    if ($nameToTry -and $nameToTry -like "*:*") {
        $modified = $nameToTry -replace ":", ""
        Write-Verbose "Trying modified name (colons removed): $modified"
        $gameId = Get-GameByTitle -Title $modified
        if ($gameId) {
            Write-Verbose "Found game using colon removal: $modified -> ID $gameId"
            return @{
                GameId = $gameId
                Title = $modified
            }
        }
    }

    # Strategy 4: Try replacing " - " with ":"
    if ($nameToTry -and $nameToTry -like "* - *") {
        $modified = $nameToTry -replace " - ", ": "
        Write-Verbose "Trying modified name (' - ' replaced with ': '): $modified"
        $gameId = Get-GameByTitle -Title $modified
        if ($gameId) {
            Write-Verbose "Found game using dash replacement: $modified -> ID $gameId"
            return @{
                GameId = $gameId
                Title = $modified
            }
        }
    }

    Write-Verbose "Could not find game for: $($GameIndexEntry.name)"
    return $null
}

# ============================================================================
# MAIN PROCESSING LOOP
# ============================================================================

$stats = @{
    Total = 0
    Processed = 0
    Matched = 0
    SerialNumbersAdded = 0
    Skipped = 0
    Conflicts = 0
    Failed = 0
    Unmatched = @()
    SkippedNoSerial = @()
    ConflictDetails = @()
}

$gameIndex = 0
foreach ($game in $gameIndexData) {
    $stats.Total++
    $gameIndex++

    Write-Progress -Activity "Processing Games" `
        -Status "Game $gameIndex of $($gameIndexData.Count)" `
        -PercentComplete (($gameIndex / $gameIndexData.Count) * 100) `
        -CurrentOperation $($game.name)

    Write-Verbose "Processing game $($stats.Total)/$($gameIndexData.Count): $($game.name)"

    # Skip if there's no serial number
    if ([string]::IsNullOrWhiteSpace($game.serial)) {
        $stats.SkippedNoSerial += $game
        Write-Verbose "No serial number available, skipping"
        continue
    }

    $stats.Processed++

    # Find the game
    $gameMatch = Find-GameId -GameIndexEntry $game

    if (-not $gameMatch) {
        $stats.Failed++
        $stats.Unmatched += $game
        Write-Verbose "No match found for game"
        continue
    }

    $stats.Matched++

    # Add the serial number
    $notes = "Imported from PCSX2 GameIndex"

    $result = Add-SerialNumber -GameTitle $gameMatch.Title `
        -SerialNumber $game.serial `
        -Region $game.region `
        -Notes $notes

    if ($result.Success) {
        $stats.SerialNumbersAdded++
        Write-Host "✓ Added: '$($game.serial)' for game ID $($gameMatch.GameId) - $($gameMatch.Title)" -ForegroundColor Green
    }
    elseif ($result.Conflict) {
        $stats.Conflicts++
        $conflictInfo = @{
            Serial = $game.serial
            AttemptedGame = $gameMatch.Title
            AttemptedGameId = $gameMatch.GameId
            ExistingGame = $result.ErrorDetails.existingGameTitle
            ExistingGameId = $result.ErrorDetails.existingGameId
        }
        $stats.ConflictDetails += $conflictInfo
        Write-Host "⚠ Conflict: Serial '$($game.serial)' already exists for '$($result.ErrorDetails.existingGameTitle)' (ID: $($result.ErrorDetails.existingGameId))" -ForegroundColor Yellow
    }
    else {
        $stats.Failed++
        Write-Host "✗ Failed to add serial number for game ID $($gameMatch.GameId): $($result.ErrorMessage)" -ForegroundColor Red
    }
}

Write-Progress -Activity "Processing Games" -Completed

# ============================================================================
# FINAL REPORT
# ============================================================================

Write-Host ""
Write-Host "Import Complete!" -ForegroundColor Cyan
Write-Host "================" -ForegroundColor Cyan
Write-Host "Total games in index:           $($stats.Total)"
Write-Host "Games with serial numbers:      $($stats.Processed)"
Write-Host "Games without serial numbers:   $($stats.SkippedNoSerial.Count)"
Write-Host "Games matched:                  $($stats.Matched)"
Write-Host "Serial numbers added:           $($stats.SerialNumbersAdded)"
Write-Host "Conflicts (already exists):     $($stats.Conflicts)"
Write-Host "Games unmatched:                $($stats.Failed)"

# Export unmatched games
if ($stats.Unmatched.Count -gt 0) {
    Write-Host ""
    Write-Host "Unmatched Games:" -ForegroundColor Yellow
    foreach ($unmatched in $stats.Unmatched | Select-Object -First 10) {
        $displayName = if (![string]::IsNullOrWhiteSpace($unmatched.name_en)) { $unmatched.name_en } else { $unmatched.name }
        Write-Host "  - $displayName (Serial: $($unmatched.serial))"
    }
    if ($stats.Unmatched.Count -gt 10) {
        Write-Host "  ... and $($stats.Unmatched.Count - 10) more" -ForegroundColor Yellow
    }

    # Export unmatched games to JSON file
    $outputDir = Split-Path -Path $GameIndexPath -Parent
    $outputPath = Join-Path -Path $outputDir -ChildPath "serial-to-reprocess.json"

    try {
        $stats.Unmatched | ConvertTo-Json | Set-Content -Path $outputPath
        Write-Host ""
        Write-Host "✓ Unmatched games exported to: $outputPath" -ForegroundColor Green
    }
    catch {
        Write-Host "✗ Failed to export unmatched games to JSON: $_" -ForegroundColor Red
    }
}

# Export conflict details
if ($stats.ConflictDetails.Count -gt 0) {
    Write-Host ""
    Write-Host "Conflict Details:" -ForegroundColor Yellow
    foreach ($conflict in $stats.ConflictDetails | Select-Object -First 5) {
        Write-Host "  - Serial: $($conflict.Serial)"
        Write-Host "    Attempted: $($conflict.AttemptedGame) (ID: $($conflict.AttemptedGameId))"
        Write-Host "    Exists on: $($conflict.ExistingGame) (ID: $($conflict.ExistingGameId))"
    }
    if ($stats.ConflictDetails.Count -gt 5) {
        Write-Host "  ... and $($stats.ConflictDetails.Count - 5) more" -ForegroundColor Yellow
    }

    # Export conflicts to JSON file
    $outputDir = Split-Path -Path $GameIndexPath -Parent
    $conflictPath = Join-Path -Path $outputDir -ChildPath "serial-conflicts.json"

    try {
        $stats.ConflictDetails | ConvertTo-Json | Set-Content -Path $conflictPath
        Write-Host ""
        Write-Host "✓ Conflicts exported to: $conflictPath" -ForegroundColor Green
    }
    catch {
        Write-Host "✗ Failed to export conflicts to JSON: $_" -ForegroundColor Red
    }
}

$successRate = if ($stats.Processed -gt 0) {
    [math]::Round(($stats.SerialNumbersAdded / $stats.Processed) * 100, 2)
}
else {
    0
}

Write-Host ""
Write-Host "Success Rate: $successRate%" -ForegroundColor $(if ($successRate -ge 90) { "Green" } else { "Yellow" })
