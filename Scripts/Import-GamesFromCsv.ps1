param(
    [Parameter(Mandatory=$false)]
    [string]$CsvPath = "d:\repos\ps2-challenge-website\csv\allgames.csv",

    [Parameter(Mandatory=$false)]
    [string]$ApiBaseUrl = "http://localhost:5001",

    [Parameter(Mandatory=$false)]
    [int]$BatchSize = 10,

    [Parameter(Mandatory=$false)]
    [switch]$DryRun
)

# Function to convert CSV date format to ISO 8601
function ConvertTo-IsoDate {
    param([string]$DateString)

    if ([string]::IsNullOrWhiteSpace($DateString)) {
        return $null
    }

    try {
        # Try parsing DD/MM/YYYY format
        if ($DateString -match '^\d{2}/\d{2}/\d{4}$') {
            $date = [DateTime]::ParseExact($DateString, 'dd/MM/yyyy', $null)
            return $date.ToString('yyyy-MM-dd')
        }
        # Try parsing YYYY-MM-DD format
        elseif ($DateString -match '^\d{4}-\d{2}-\d{2}$') {
            return $DateString
        }
        else {
            return $null
        }
    }
    catch {
        Write-Warning "Failed to parse date: $DateString"
        return $null
    }
}

# Function to convert string boolean to actual boolean
function ConvertTo-Boolean {
    param([string]$Value)

    return $Value -eq "TRUE" -or $Value -eq "True" -or $Value -eq "true" -or $Value -eq "1"
}

# Main script
Write-Host "PS2 Challenge Game Import Script" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Validate CSV file exists
if (-not (Test-Path $CsvPath)) {
    Write-Error "CSV file not found: $CsvPath"
    exit 1
}

Write-Host "Reading CSV file: $CsvPath" -ForegroundColor Green

# Read CSV file
$games = Import-Csv -Path $CsvPath

Write-Host "Found $($games.Count) games in CSV" -ForegroundColor Green
Write-Host ""

if ($DryRun) {
    Write-Host "DRY RUN MODE - No data will be sent to the API" -ForegroundColor Yellow
    Write-Host ""
}

# Counters
$successCount = 0
$failCount = 0
$skippedCount = 0

# Process games
$currentBatch = 0
foreach ($game in $games) {
    $currentBatch++

    # Validate required fields
    if ([string]::IsNullOrWhiteSpace($game.title) -or
        [string]::IsNullOrWhiteSpace($game.developer) -or
        [string]::IsNullOrWhiteSpace($game.publisher) -or
        [string]::IsNullOrWhiteSpace($game.region_first_released_in)) {

        Write-Host "[$currentBatch/$($games.Count)] SKIPPED: $($game.title) (Missing required fields)" -ForegroundColor Yellow
        $skippedCount++
        continue
    }

    # Build game object
    $isReleasedInRegion = ConvertTo-Boolean $game.released_in_eu_pal_or_na

    $gameObject = @{
        title = $game.title
        developer = $game.developer
        publisher = $game.publisher
        firstReleased = ConvertTo-IsoDate $game.first_released
        regionFirstReleasedIn = $game.region_first_released_in
        releasedInEuPalOrNa = $isReleasedInRegion
    }

    if ($DryRun) {
        Write-Host "[$currentBatch/$($games.Count)] WOULD ADD: $($game.title)" -ForegroundColor Cyan
        $successCount++
    }
    else {
        try {
            # Send POST request
            $json = $gameObject | ConvertTo-Json
            $response = Invoke-RestMethod -Uri "$ApiBaseUrl/api/Games" `
                                         -Method Post `
                                         -Body $json `
                                         -ContentType "application/json" `
                                         -ErrorAction Stop

            Write-Host "[$currentBatch/$($games.Count)] SUCCESS: $($game.title)" -ForegroundColor Green
            $successCount++
        }
        catch {
            $errorMessage = $_.Exception.Message
            if ($_.ErrorDetails.Message) {
                try {
                    $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
                    $errorMessage = ($errorDetails.errors -join ", ")
                }
                catch {
                    $errorMessage = $_.ErrorDetails.Message
                }
            }

            Write-Host "[$currentBatch/$($games.Count)] FAILED: $($game.title) - $errorMessage" -ForegroundColor Red
            $failCount++
        }
    }

    # Add delay between batches to avoid overwhelming the API
    if ($currentBatch % $BatchSize -eq 0) {
        Start-Sleep -Milliseconds 500
    }
}

# Summary
Write-Host ""
Write-Host "Import Summary" -ForegroundColor Cyan
Write-Host "==============" -ForegroundColor Cyan
Write-Host "Total games in CSV: $($games.Count)"
Write-Host "Successfully imported: $successCount" -ForegroundColor Green
Write-Host "Failed: $failCount" -ForegroundColor Red
Write-Host "Skipped: $skippedCount" -ForegroundColor Yellow
Write-Host ""

if ($DryRun) {
    Write-Host "This was a dry run. Re-run without -DryRun to actually import the data." -ForegroundColor Yellow
}
