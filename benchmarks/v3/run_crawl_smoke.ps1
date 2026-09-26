param(
  [Parameter(Mandatory = $true)]
  [string]$Site,

  [Parameter(Mandatory = $true)]
  [string]$InputFile,

  [string]$OutputPath = ".\.camintel\benchmarks\v3\crawl-smoke.xlsx",

  [int]$Cap = 15
)

$ErrorActionPreference = "Stop"

function Assert-ExitCode {
  param([string]$Step)

  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE"
  }
}

$packageJson = Get-Content ".\package.json" -Raw | ConvertFrom-Json
$scriptNames = @($packageJson.scripts.PSObject.Properties.Name)

if ($scriptNames -notcontains "smart-batch:v2") {
  throw "Dev0 integration is not ready: package.json does not define smart-batch:v2 yet."
}

$safeSite = $Site.Replace(".", "-")
$cappedInput = ".\.camintel\benchmarks\v3\$safeSite-smoke-input.txt"

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $cappedInput) | Out-Null

npx.cmd tsx ".\tests\live\v3\buildCrawlSmokeInput.ts" $Site $InputFile $cappedInput $Cap
Assert-ExitCode "Build capped crawl input"

npm.cmd run smart-batch:v2 -- $cappedInput --output $OutputPath
Assert-ExitCode "Vision-First crawl smoke"

npx.cmd tsx ".\tests\live\v3\runCrawlSmoke.ts" $Site $OutputPath $Cap
Assert-ExitCode "Dev6 crawl smoke validation"

Write-Host ""
Write-Host "Dev6 crawl smoke PASS"
Write-Host "Site: $Site"
Write-Host "Input: $cappedInput"
Write-Host "Workbook: $OutputPath"
