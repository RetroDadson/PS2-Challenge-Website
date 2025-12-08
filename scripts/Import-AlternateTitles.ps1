<#
.SYNOPSIS
    Imports alternate game titles from GameIndex.json and posts them to the PS2 Challenge API.

.DESCRIPTION
    This script processes a GameIndex.json file, searches for matching games in the PS2 Challenge API,
    and adds alternate titles to each game. The game lookup strategy is:
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

.PARAMETER AlternateNameProperty
    The property name to use as the alternate title (default: "name_en")

.PARAMETER Verbose
    Display detailed logging of the import process.

.EXAMPLE
    .\Import-AlternateTitles.ps1 -GameIndexPath "C:\path\to\GameIndex.json" -ApiBaseUrl "http://localhost:5000" -ApiKey "your-api-key"

.EXAMPLE
    .\Import-AlternateTitles.ps1 -GameIndexPath "GameIndex.json" -ApiBaseUrl "https://api.ps2challenge.com" -Verbose
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path $_ })]
    [string]$GameIndexPath,

    [Parameter(Mandatory = $true)]
    [ValidateScript({ $_ -match '^https?://' })]
    [string]$ApiBaseUrl,

    [string]$ApiKey,

    [string]$AlternateNameProperty = "name_en"
)

# Enable verbose output if requested
$VerbosePreference = if ($Verbose) { "Continue" } else { "SilentlyContinue" }

# ============================================================================
# INITIALIZATION
# ============================================================================

Write-Host "Starting Alternate Titles Import" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
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

function Add-AlternateTitle {
    <#
    .SYNOPSIS
    Adds an alternate title to a game via the API.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [int]$GameId,

        [Parameter(Mandatory = $true)]
        [string]$Title,

        [string]$Notes
    )

    try {
        $url = "$ApiBaseUrl/api/games/$GameId/alternate-titles"

        $body = @{
            title = $Title
        }

        if ($Notes) {
            $body.notes = $Notes
        }

        $jsonBody = $body | ConvertTo-Json
        Write-Verbose "POSTing to $url with body: $jsonBody"

        $response = Invoke-RestMethod -Uri $url -Method Post -Body $jsonBody `
            -ContentType "application/json" -Headers @{ "X-API-Key" = $ApiKey } `
            -ErrorAction Stop

        Write-Verbose "Successfully added alternate title to game ID $GameId"
        return $true
    }
    catch {
        Write-Verbose "Error adding alternate title to game ID $GameId`: $_"
        return $false
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
            return $gameId
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
            return $gameId
        }
    }

    # Strategy 4: Try replacing " - " with ":"
    if ($nameToTry -and $nameToTry -like "* - *") {
        $modified = $nameToTry -replace " - ", ": "
        Write-Verbose "Trying modified name (' - ' replaced with ': '): $modified"
        $gameId = Get-GameByTitle -Title $modified
        if ($gameId) {
            Write-Verbose "Found game using dash replacement: $modified -> ID $gameId"
            return $gameId
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
    Matched = 0
    AlternateTitlesAdded = 0
    Failed = 0
    Unmatched = @()
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

    # Find the game ID
    $gameId = Find-GameId -GameIndexEntry $game

    if (-not $gameId) {
        $stats.Failed++
        $stats.Unmatched += $game
        Write-Verbose "No match found for game"
        continue
    }

    $stats.Matched++

    # Determine which property to use as the alternate title
    $alternateTitle = if (![string]::IsNullOrWhiteSpace($game.name_en)) {
        $game.name
    }
    else {
        $game.name_en
    }

    # Skip if there's no alternate title to add
    if ([string]::IsNullOrWhiteSpace($alternateTitle) -or $alternateTitle -eq "") {
        Write-Verbose "No alternate title to add for game ID $gameId"
        continue
    }

    # Add the alternate title
    $notes = if (![string]::IsNullOrWhiteSpace($game.region)) {
        "Region: $($game.region)"
    }
    else {
        ""
    }

    $success = Add-AlternateTitle -GameId $gameId -Title $alternateTitle -Notes $notes

    if ($success) {
        $stats.AlternateTitlesAdded++
        Write-Host "✓ Added: '$alternateTitle' for game ID $gameId" -ForegroundColor Green
    }
    else {
        Write-Host "✗ Failed to add alternate title for game ID $gameId" -ForegroundColor Red
    }
}

# ============================================================================
# FINAL REPORT
# ============================================================================

Write-Host ""
Write-Host "Import Complete!" -ForegroundColor Cyan
Write-Host "================" -ForegroundColor Cyan
Write-Host "Total games processed:      $($stats.Total)"
Write-Host "Games matched:              $($stats.Matched)"
Write-Host "Alternate titles added:     $($stats.AlternateTitlesAdded)"
Write-Host "Games unmatched:            $($stats.Failed)"

if ($stats.Unmatched.Count -gt 0) {
    Write-Host ""
    Write-Host "Unmatched Games:" -ForegroundColor Yellow
    foreach ($unmatched in $stats.Unmatched | Select-Object -First 10) {
        Write-Host "  - $($unmatched.Name)"
    }
    if ($stats.Unmatched.Count -gt 10) {
        Write-Host "  ... and $($stats.Unmatched.Count - 10) more" -ForegroundColor Yellow
    }

    # Export unmatched games to JSON file
    $outputDir = Split-Path -Path $GameIndexPath -Parent
    $outputPath = Join-Path -Path $outputDir -ChildPath "to-reprocess.json"

    try {
        $stats.Unmatched | ConvertTo-Json | Set-Content -Path $outputPath
        Write-Host ""
        Write-Host "✓ Unmatched games exported to: $outputPath" -ForegroundColor Green
    }
    catch {
        Write-Host "✗ Failed to export unmatched games to JSON: $_" -ForegroundColor Red
    }
}

$successRate = if ($stats.Total -gt 0) {
    [math]::Round(($stats.Matched / $stats.Total) * 100, 2)
}
else {
    0
}

Write-Host ""
Write-Host "Success Rate: $successRate%" -ForegroundColor $(if ($successRate -ge 90) { "Green" } else { "Yellow" })
