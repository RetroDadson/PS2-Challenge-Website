<#
.SYNOPSIS
    Imports serial numbers from a PCSX2 Wiki XML export and posts them to the PS2 Challenge APIs.

.DESCRIPTION
    This script parses the MediaWiki export file (PCSX2 Wiki) to extract wiki title, region, and serial
    numbers from the master table, then ingests them into the PS2 Challenge API serial-number endpoint.
    It uses the same title-matching strategies as the existing import scripts:
      1. Exact wiki title
      2. Removing colons
      3. Replacing " - " with ": "

.PARAMETER WikiXmlPath
    Path to the PCSX2 Wiki XML export file (e.g., PCSX2+Wiki-20251216001427.xml).

.PARAMETER ApiBaseUrl
    Base URL of the PS2 Challenge API (e.g., "http://localhost:5000").

.PARAMETER ApiKey
    API key for authentication. If not provided, will prompt for it.

.EXAMPLE
    .\Import-WikiSerials.ps1 -WikiXmlPath "C:\Users\me\Downloads\PCSX2+Wiki-20251216001427.xml" -ApiBaseUrl "http://localhost:5000" -ApiKey "your-api-key"
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path $_ })]
    [string]$WikiXmlPath,

    [Parameter(Mandatory = $true)]
    [ValidateScript({ $_ -match '^https?://' })]
    [string]$ApiBaseUrl,

    [string]$ApiKey
)

# ============================================================================
# INITIALIZATION
# ============================================================================

Write-Host "Starting PCSX2 Wiki Serial Import" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Verbose "Wiki XML Path: $WikiXmlPath"
Write-Verbose "API Base URL: $ApiBaseUrl"

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    $ApiKeySecure = Read-Host "Enter API Key" -AsSecureString
    $ApiKey = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUnicode($ApiKeySecure))
}

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

function Get-WikiText {
    param([string]$Path)
    try {
        $xml = [xml](Get-Content -Path $Path -Raw)
        # Take the first page's text block
        $textNode = $xml.mediawiki.page.revision.text | Select-Object -First 1
        return $textNode.'#text'
    }
    catch {
        Write-Host "✗ Failed to parse XML: $_" -ForegroundColor Red
        throw
    }
}

function Clean-WikiTitle {
    param([string]$Raw)
    if ([string]::IsNullOrWhiteSpace($Raw)) { return $null }
    $clean = $Raw
    # Remove HTML tags and wiki bold/italic markers
    $clean = $clean -replace '<[^>]+>', ''
    $clean = $clean -replace "'''", ''
    $clean = $clean -replace "''", ''
    # Replace wiki links [[Page|Display]] -> Display, [[Page]] -> Page
    $clean = [regex]::Replace($clean, '\[\[([^\]|]+)\|([^\]]+)\]\]', '$2')
    $clean = [regex]::Replace($clean, '\[\[([^\]]+)\]\]', '$1')
    return $clean.Trim()
}

function Clean-Region {
    param([string]$Raw)
    if ([string]::IsNullOrWhiteSpace($Raw)) { return $null }
    $clean = $Raw -replace '<[^>]+>', ''
    $clean = $clean -replace '\(.*?\)', ''
    $clean = $clean.Trim()
    return ($clean -split '[\s\(]')[0].Trim()
}

function Clean-Serials {
    param([string]$Raw)
    if ([string]::IsNullOrWhiteSpace($Raw)) { return @() }
    $clean = ($Raw -replace '<[^>]+>', '')
    $clean = ($clean -replace '\(.*?\)', '')
    $tokens = $clean -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    return $tokens
}

function Clean-Aliases {
    param([string]$Raw)
    if ([string]::IsNullOrWhiteSpace($Raw)) { return @() }
    $clean = $Raw
    # Strip leading table attribute fragments followed by a pipe (e.g., rowspan/colspan/style)
    $clean = $clean -replace '^\s*(?:rowspan|colspan)\s*=\s*"?\d+"?\s*\|\s*', ''
    $clean = $clean -replace '^\s*style\s*=\s*"[^"]*"\s*\|\s*', ''
    # Remove HTML tags and wiki bold/italic markers
    $clean = $clean -replace '<[^>]+>', ''
    $clean = $clean -replace "'''", ''
    $clean = $clean -replace "''", ''
    # Replace wiki links [[Page|Display]] -> Display, [[Page]] -> Page
    $clean = [regex]::Replace($clean, '\[\[([^\]|]+)\|([^\]]+)\]\]', '$2')
    $clean = [regex]::Replace($clean, '\[\[([^\]]+)\]\]', '$1')
    # Remove parenthetical annotations
    $clean = [regex]::Replace($clean, '\(.*?\)', '')
    # Split into tokens
    $tokens = $clean -split '[,;]+' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    # Filter serial-like tokens and region codes
    $tokens = $tokens | Where-Object { $_ -and -not (Test-SerialLike $_) -and -not (Test-RegionCode $_) }
    return ($tokens | Select-Object -Unique)
}

function Test-SerialLike {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
    $v = $Value.Trim()
    # Match PS2 serial formats: 2-5 uppercase letters, optional hyphen/space, 3-6 digits, optional suffix
    # Examples: SLES-51260, SLUS 21200, SCES-50001-P, VW043-J1, SCED-51074, SLES-53439P
    $pattern = '^[A-Z]{2,5}[- ]?\d{3,6}(?:[-/]?[A-Z0-9]{1,3})?$'
    return [bool]([regex]::IsMatch($v, $pattern))
}

function Test-RegionCode {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
    $v = $Value.Trim()
    return ($v -cmatch '^[A-Z]{1,3}$')
}

function Parse-WikiTable {
    param([string]$WikiText)
    $results = @()
    $currentTitle = $null

    # Rows are separated by "|-"
    foreach ($row in ($WikiText -split "`n\|-")) {
        $lines = $row -split "`n" | Where-Object { $_ -match '^\|' }
        if (-not $lines) { continue }

        $fields = $lines | ForEach-Object { ($_ -replace '^\|\s*', '').Trim() }
        # Strip any leading table attribute fragments (e.g., rowspan="1" |, colspan="2" |, style="..." |)
        $fields = $fields | ForEach-Object {
            $c = $_
            $c = $c -replace '^\s*(?:rowspan|colspan)\s*=\s*"?\d+"?\s*\|\s*', ''
            $c = $c -replace '^\s*style\s*=\s*"[^"]*"\s*\|\s*', ''
            $c
        }
        if ($fields.Count -eq 0) { continue }

        # Update title when present
        if ($fields[0] -match '\[\[') {
            $currentTitle = Clean-WikiTitle $fields[0]
        }

        if (-not $currentTitle) { continue }

        # Serial and region are typically the last two meaningful columns
        if ($fields.Count -lt 2) { continue }

        $alsoKnownRaw = if ($fields.Count -ge 2) { $fields[1] } else { $null }
        $serialRaw    = $fields[$fields.Count - 2]
        $regionRaw    = $fields[$fields.Count - 3]

        $region = Clean-Region $regionRaw
        $serials = Clean-Serials $serialRaw
        $aliases = Clean-Aliases $alsoKnownRaw

        foreach ($serial in $serials) {
            $results += [pscustomobject]@{
                Title     = $currentTitle
                Region    = $region
                Serial    = $serial
                Aliases   = $aliases
            }
        }
    }

    return $results
}

function Get-GameByTitle {
    param([string]$Title)
    try {
        $searchUrl = "$ApiBaseUrl/api/games?title=$([Uri]::EscapeDataString($Title))"
        Write-Verbose "Searching for game: $Title"
        $response = Invoke-RestMethod -Uri $searchUrl -Method Get -ErrorAction Stop

        if ($response -and $response.Count -gt 0) {
            $exact = $response | Where-Object { $_.title -eq $Title } | Select-Object -First 1
            if ($exact) { return $exact }
            return $response[0]
        }
        return $null
    }
    catch {
        Write-Verbose "Search error for '$Title': $_"
        return $null
    }
}

function Find-GameMatch {
    param([string]$Title)

    $candidates = @($Title)
    if ($Title -like "*:*") { $candidates += ($Title -replace ':', '') }
    if ($Title -like "* - *") { $candidates += ($Title -replace ' - ', ': ') }

    foreach ($candidate in $candidates | Select-Object -Unique) {
        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        $game = Get-GameByTitle -Title $candidate
        if ($game) {
            return [pscustomobject]@{
                GameId = $game.id
                Title  = $candidate
            }
        }
    }

    return $null
}

function Add-SerialNumber {
    param(
        [Parameter(Mandatory = $true)][string]$GameTitle,
        [Parameter(Mandatory = $true)][string]$SerialNumber,
        [string]$Region,
        [string]$Notes
    )

    try {
        $url = "$ApiBaseUrl/api/games/serial-numbers"
        $body = @{ title = $GameTitle; serialNumber = $SerialNumber }
        if ($Region) { $body.region = $Region }
        if ($Notes) { $body.notes = $Notes }

        $jsonBody = $body | ConvertTo-Json
        Invoke-RestMethod -Uri $url -Method Post -Body $jsonBody -ContentType "application/json" -Headers @{ "X-API-Key" = $ApiKey } -ErrorAction Stop
        return @{ Success = $true }
    }
    catch {
        $status = $_.Exception.Response.StatusCode.value__ 2>$null
        $details = $null
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $details = $reader.ReadToEnd() | ConvertFrom-Json
            $reader.Close()
        }
        catch {}

        if ($status -eq 409) {
            return @{ Success = $false; Conflict = $true; Details = $details }
        }

        return @{ Success = $false; Conflict = $false; Error = $_.Exception.Message }
    }
}

function Add-AlternateTitle {
    param(
        [Parameter(Mandatory = $true)][int]$GameId,
        [Parameter(Mandatory = $true)][string]$Title,
        [string]$Notes
    )

    try {
        $url = "$ApiBaseUrl/api/games/$GameId/alternate-titles"
        $body = @{ title = $Title }
        if ($Notes) { $body.notes = $Notes }

        $jsonBody = $body | ConvertTo-Json
        Invoke-RestMethod -Uri $url -Method Post -Body $jsonBody -ContentType "application/json" -Headers @{ "X-API-Key" = $ApiKey } -ErrorAction Stop
        return $true
    }
    catch {
        Write-Verbose "Error adding alternate title '$Title' to game $($GameId): $_"
        return $false
    }
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

$wikiText = Get-WikiText -Path $WikiXmlPath
$rows = Parse-WikiTable -WikiText $wikiText

$stats = @{
    Total = $rows.Count
    Processed = 0
    Added = 0
    Conflicts = 0
    Unmatched = @()
    ConflictDetails = @()
    Failed = 0
    AltAdded = 0
    AltFailed = 0
}

$seenSerials = @{}
$seenAltTitles = @{}
$index = 0

foreach ($row in $rows) {
    $index++
    $percentComplete = ($index / $rows.Count) * 100
    $currentOp = "$($row.Title) | $($row.Serial)"
    Write-Progress -Activity "Processing Wiki Rows" -Status "Row $index of $($rows.Count)" -PercentComplete $percentComplete -CurrentOperation $currentOp

    $aliasCount = if ($row.PSObject.Properties.Name -contains 'Aliases' -and $row.Aliases) { $row.Aliases.Count } else { 0 }
    Write-Information "Row $index parsed | Title='$($row.Title)' | Serial='$($row.Serial)' | Region='$($row.Region)' | Aliases=$aliasCount" -InformationAction Continue

    # Deduplicate serials in the source
    if ($seenSerials.ContainsKey($row.Serial)) { continue }
    $seenSerials[$row.Serial] = $true

    $stats.Processed++

    $match = Find-GameMatch -Title $row.Title
    if (-not $match) {
        $stats.Unmatched += $row
        continue
    }

    # Update progress bar with resolved game title once matched
    $currentOp = "$($row.Title) → $($match.Title) | $($row.Serial)"
    Write-Progress -Activity "Processing Wiki Rows" -Status "Row $index of $($rows.Count)" -PercentComplete $percentComplete -CurrentOperation $currentOp

    $notes = "Imported from PCSX2 Wiki"
    $result = Add-SerialNumber -GameTitle $match.Title -SerialNumber $row.Serial -Region $row.Region -Notes $notes

    if ($result.Success) {
        $stats.Added++
        Write-Host "✓ Added serial '$($row.Serial)' for '$($match.Title)' (ID: $($match.GameId))" -ForegroundColor Green
    }
    elseif ($result.Conflict) {
        $stats.Conflicts++
        $stats.ConflictDetails += @{
            Serial = $row.Serial
            Region = $row.Region
            WikiTitle = $row.Title
            AttemptedGame = $match.Title
            AttemptedGameId = $match.GameId
            ExistingGameId = $result.Details.existingGameId
            ExistingGameTitle = $result.Details.existingGameTitle
        }
        Write-Host "⚠ Conflict: serial '$($row.Serial)' already exists for '$($result.Details.existingGameTitle)' (ID: $($result.Details.existingGameId))" -ForegroundColor Yellow
    }
    else {
        $stats.Failed++
        Write-Host "✗ Failed to add serial '$($row.Serial)' for '$($match.Title)': $($result.Error)" -ForegroundColor Red
    }

    # Add alternate titles from "Also known as" column
    if ($row.Aliases -and $row.Aliases.Count -gt 0) {
        foreach ($alias in $row.Aliases) {
            if ([string]::IsNullOrWhiteSpace($alias)) { continue }
            # Skip if same as matched title
            if ($alias -eq $match.Title) { continue }
            # Skip if alias looks like a serial number or lacks letters; enforce reasonable length
            if (Test-SerialLike $alias) { continue }
            if ($alias -notmatch '[A-Za-z]') { continue }
            if ($alias.Length -lt 2 -or $alias.Length -gt 150) { continue }

            $altKey = "$($match.GameId)|$alias"
            if ($seenAltTitles.ContainsKey($altKey)) { continue }
            $seenAltTitles[$altKey] = $true

            $altNotes = "Imported from PCSX2 Wiki 'Also known as'"
            $altSuccess = Add-AlternateTitle -GameId $match.GameId -Title $alias -Notes $altNotes
            if ($altSuccess) {
                $stats.AltAdded++
                Write-Information "Added alternate title '$alias' to game $($match.GameId)" -InformationAction Continue
            }
            else {
                $stats.AltFailed++
                Write-Verbose "Failed to add alternate title '$alias' for game $($match.GameId)"
            }
        }
    }
}

Write-Progress -Activity "Processing Wiki Rows" -Completed

# ============================================================================
# REPORTING
# ============================================================================

Write-Host ""; Write-Host "Import Complete!" -ForegroundColor Cyan
Write-Host "================" -ForegroundColor Cyan
Write-Host "Total wiki rows parsed:        $($stats.Total)"
Write-Host "Unique serials processed:      $($stats.Processed)"
Write-Host "Serials added:                 $($stats.Added)"
Write-Host "Alternate titles added:       $($stats.AltAdded)"
Write-Host "Alternate titles failed:      $($stats.AltFailed)"
Write-Host "Conflicts (already exists):    $($stats.Conflicts)"
Write-Host "Unmatched titles:              $($stats.Unmatched.Count)"
Write-Host "Failures:                      $($stats.Failed)"

$outputDir = Split-Path -Path $WikiXmlPath -Parent

if ($stats.Unmatched.Count -gt 0) {
    $unmatchedPath = Join-Path -Path $outputDir -ChildPath "wiki-serials-unmatched.json"
    try {
        $stats.Unmatched | ConvertTo-Json | Set-Content -Path $unmatchedPath
        Write-Host "✓ Unmatched exported to: $unmatchedPath" -ForegroundColor Yellow
    }
    catch {
        Write-Host "✗ Failed to export unmatched: $_" -ForegroundColor Red
    }
}

if ($stats.ConflictDetails.Count -gt 0) {
    $conflictPath = Join-Path -Path $outputDir -ChildPath "wiki-serials-conflicts.json"
    try {
        $stats.ConflictDetails | ConvertTo-Json | Set-Content -Path $conflictPath
        Write-Host "✓ Conflicts exported to: $conflictPath" -ForegroundColor Yellow
    }
    catch {
        Write-Host "✗ Failed to export conflicts: $_" -ForegroundColor Red
    }
}

$successRate = if ($stats.Processed -gt 0) {
    [math]::Round(($stats.Added / $stats.Processed) * 100, 2)
} else { 0 }
Write-Host "Success Rate: $successRate%" -ForegroundColor $(if ($successRate -ge 90) { "Green" } else { "Yellow" })
