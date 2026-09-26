param(
  [switch]$StaticOnly
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path $PSScriptRoot
Set-Location $repoRoot

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )

  Write-Host ""
  Write-Host ("=" * 72) -ForegroundColor DarkCyan
  Write-Host $Label -ForegroundColor Cyan
  Write-Host ("=" * 72) -ForegroundColor DarkCyan

  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

if (-not (Test-Path ".\package.json")) {
  throw "package.json not found. Run this script from the extracted V15 project root."
}

if (-not (Test-Path ".\node_modules\.bin\tsc.cmd")) {
  Invoke-Checked "INSTALL PROJECT DEPENDENCIES" {
    npm.cmd install
  }
}

if ($StaticOnly) {
  Invoke-Checked "V15 TYPESCRIPT GATE" {
    npm.cmd run check
  }

  Invoke-Checked "V15 FULL V04 TEST GATE" {
    npx.cmd vitest run tests/v04
  }

  Invoke-Checked "V15 BUILD GATE" {
    npm.cmd run build --if-present
  }

  Invoke-Checked "V15 SECRET SCAN" {
    node .\scripts\v04\verify-v15-no-secrets.mjs
  }

  Write-Host ""
  Write-Host "STATIC_INTEGRATION_GATE=GREEN" -ForegroundColor Green
  Write-Host "Smoke4 and Sentinel10 were intentionally not run because -StaticOnly was supplied."
  exit 0
}

$geminiKey = $env:GEMINI_AUTH_KEY
if ([string]::IsNullOrWhiteSpace($geminiKey)) {
  $geminiKey = $env:GEMINI_API_KEY
}

if ([string]::IsNullOrWhiteSpace($geminiKey)) {
  throw "Gemini credential is not configured. Set GEMINI_AUTH_KEY or GEMINI_API_KEY before the live final gate, or rerun with -StaticOnly."
}

function Save-V15FailureEvidence {
  $acceptanceRoot = Join-Path $repoRoot ".camintel\acceptance\v15"

  if (-not (Test-Path $acceptanceRoot)) {
    Write-Host "V15_FAILURE_EVIDENCE=NONE" -ForegroundColor Yellow
    return
  }

  $downloads = Join-Path $HOME "Downloads"
  New-Item -ItemType Directory -Force -Path $downloads | Out-Null

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $evidenceDir = Join-Path $downloads ("V15_FAILURE_EVIDENCE_" + $stamp)
  $evidenceZip = $evidenceDir + ".zip"

  Copy-Item -Recurse -Force $acceptanceRoot $evidenceDir
  Compress-Archive -Path (Join-Path $evidenceDir "*") -DestinationPath $evidenceZip -Force

  Write-Host ""
  Write-Host "V15_FAILURE_EVIDENCE=$evidenceZip" -ForegroundColor Yellow
}

try {
  & .\scripts\v04\run-v15-final-gate.ps1

  if ($LASTEXITCODE -ne 0) {
    throw "V15 final gate failed with exit code $LASTEXITCODE"
  }
}
catch {
  Save-V15FailureEvidence
  throw
}
