$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$Root =
    Split-Path -Parent $MyInvocation.MyCommand.Path

$Downloads =
    Join-Path $env:USERPROFILE "Downloads"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " CAMERA INTELLIGENCE" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------
# USER INPUT
#
# The ONLY user-facing input is the website URL.
# Example:
#
# https://vjshop.vn
#
# No flags.
# No product URL list.
# No mode selection.
# ------------------------------------------------------------

$Url =
    Read-Host "Website URL"

$Url =
    ([string]$Url).Trim()

if ([string]::IsNullOrWhiteSpace($Url)) {
    throw "Website URL is required."
}

$Uri = $null

if (
    -not [Uri]::TryCreate(
        $Url,
        [UriKind]::Absolute,
        [ref]$Uri
    )
) {
    throw "Invalid website URL: $Url"
}

if (
    $Uri.Scheme -ne "http" -and
    $Uri.Scheme -ne "https"
) {
    throw "Website URL must use http:// or https://"
}

# ------------------------------------------------------------
# AUTH
#
# Credentials remain configuration, not user workflow.
# ------------------------------------------------------------

$HasGeminiKey = (
    -not [string]::IsNullOrWhiteSpace(
        $env:GEMINI_AUTH_KEY
    )
) -or (
    -not [string]::IsNullOrWhiteSpace(
        $env:GEMINI_API_KEY
    )
)

if (-not $HasGeminiKey) {

    throw @"
Gemini credential is not configured.

Set GEMINI_AUTH_KEY or GEMINI_API_KEY once in the environment,
then users only need to paste the website URL.
"@
}

# ------------------------------------------------------------
# RUN PATHS
# ------------------------------------------------------------

$Stamp =
    Get-Date -Format "yyyyMMdd-HHmmss"

$RunId =
    "discover-" + $Stamp

$InputRoot =
    Join-Path `
        $Root `
        ".camintel\root-inputs"

$CaptureRoot =
    Join-Path `
        $Root `
        ".camintel\v15-runs"

New-Item `
    -ItemType Directory `
    -Force `
    -Path $InputRoot,$CaptureRoot |
Out-Null

$InputFile =
    Join-Path `
        $InputRoot `
        ($RunId + ".txt")

[IO.File]::WriteAllText(
    $InputFile,
    $Url,
    (
        New-Object `
            Text.UTF8Encoding($false)
    )
)

# ------------------------------------------------------------
# OUTPUT
#
# Exactly one final Excel workbook in Downloads.
# ------------------------------------------------------------

$Output =
    Join-Path `
        $Downloads `
        (
            "Camera_Intelligence_" +
            $Stamp +
            ".xlsx"
        )

$Report =
    $Output +
    ".run-report.json"

Write-Host ""
Write-Host "Website :" $Url -ForegroundColor White
Write-Host "Output  :" $Output -ForegroundColor White
Write-Host ""
Write-Host "[START] Automatic discovery started." -ForegroundColor Green
Write-Host "[INFO]  Core progress will appear below." -ForegroundColor DarkGray
Write-Host ""

# ------------------------------------------------------------
# CANONICAL FIX13 CLI
#
# IMPORTANT:
# Synchronous invocation.
#
# stdout/stderr from the real collector flows directly into
# this PowerShell window.
#
# No observer.
# No state polling.
# No second UI architecture.
# ------------------------------------------------------------

$Npm =
    (
        Get-Command `
            npm.cmd `
            -ErrorAction Stop
    ).Source

$ExitCode = 1

Push-Location $Root

try {

    & $Npm `
        "run" `
        "smart-batch:minimal" `
        "--" `
        $InputFile `
        "--discover" `
        "--output" `
        $Output `
        "--capture-root" `
        $CaptureRoot `
        "--run-id" `
        $RunId `
        "--retention" `
        "LEAN_DELETE_SUCCESS"

    $ExitCode =
        $LASTEXITCODE
}
finally {

    Pop-Location
}

Write-Host ""

# ------------------------------------------------------------
# TRUST CANONICAL PROCESS EXIT CODE
# ------------------------------------------------------------

if ($ExitCode -ne 0) {

    Write-Host "============================================================" -ForegroundColor Red
    Write-Host " CAMERA INTELLIGENCE - FAILED" -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Exit code: $ExitCode" -ForegroundColor Red

    exit $ExitCode
}

# ------------------------------------------------------------
# VERIFY FINAL ARTIFACT
# ------------------------------------------------------------

if (-not (Test-Path -LiteralPath $Output)) {

    Write-Host "============================================================" -ForegroundColor Red
    Write-Host " EXCEL NOT CREATED" -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Red

    exit 1
}

Write-Host "============================================================" -ForegroundColor Green
Write-Host " CAMERA INTELLIGENCE - COMPLETE" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Excel:" -ForegroundColor Cyan
Write-Host $Output
Write-Host ""

# Report is produced by canonical core.
# We do not parse or observe it during execution.

if (Test-Path -LiteralPath $Report) {

    Write-Host "Run report:" -ForegroundColor DarkGray
    Write-Host $Report -ForegroundColor DarkGray
    Write-Host ""
}

exit 0