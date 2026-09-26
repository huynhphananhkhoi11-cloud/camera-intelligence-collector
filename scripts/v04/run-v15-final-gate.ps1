$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )

    Write-Host ""
    Write-Host "========================================================"
    Write-Host " $Label"
    Write-Host "========================================================"
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

Invoke-Checked "V15 TYPESCRIPT GATE" {
    npm.cmd run check
}

Invoke-Checked "V15 FULL V04 TEST GATE" {
    npx.cmd vitest run tests/v04
}

Invoke-Checked "V15 BUILD GATE" {
    npm.cmd run build --if-present
}

if (Test-Path ".git") {
    Invoke-Checked "V15 DIFF WHITESPACE GATE" {
        git diff --check
    }
}

Invoke-Checked "V15 UNTRACKED-AWARE SECRET SCAN" {
    node .\scripts\v04\verify-v15-no-secrets.mjs
}

if (Test-Path ".git") {
    Invoke-Checked "V15 TRACKED SECRET SCAN" {
        node .\scripts\release\verify-no-secrets.mjs
    }
}

Invoke-Checked "V15 FRESH SMOKE4" {
    node .\scripts\v04\run-v15-smoke4.mjs
}

Invoke-Checked "V15 FRESH SENTINEL10" {
    node .\scripts\v04\run-v15-sentinel10.mjs
}

$sentinelWorkbook = Join-Path $repoRoot ".camintel\acceptance\v15\sentinel10\sentinel10.xlsx"
if (-not (Test-Path $sentinelWorkbook)) {
    throw "Sentinel10 workbook missing after green acceptance: $sentinelWorkbook"
}

$downloads = Join-Path $HOME "Downloads"
New-Item -ItemType Directory -Force -Path $downloads | Out-Null
$downloadWorkbook = Join-Path $downloads "CameraIntelligence_V15.xlsx"
Copy-Item -Force $sentinelWorkbook $downloadWorkbook

Write-Host ""
Write-Host "FINAL_RELEASE_GATE=GREEN"
Write-Host "DOWNLOAD_WORKBOOK=$downloadWorkbook"
