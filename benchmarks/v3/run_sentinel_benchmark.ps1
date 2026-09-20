param(
  [string]$OutputPath = ".\.camintel\benchmarks\v3\CameraIntelligence_V3_RC.xlsx",
  [string]$ReportPrefix = ".\.camintel\benchmarks\v3\dev6-live",
  [switch]$SkipCheck
)

$ErrorActionPreference = "Stop"

function Assert-ExitCode {
  param(
    [string]$Step
  )

  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE"
  }
}

$packageJson = Get-Content ".\package.json" -Raw | ConvertFrom-Json
$scriptNames = @($packageJson.scripts.PSObject.Properties.Name)

if ($scriptNames -notcontains "smart-batch:v2") {
  throw "Dev0 integration is not ready: package.json does not define smart-batch:v2 yet."
}

$outputDirectory = Split-Path -Parent $OutputPath
$reportDirectory = Split-Path -Parent $ReportPrefix

if ($outputDirectory) {
  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}

if ($reportDirectory) {
  New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null
}

if (-not $SkipCheck) {
  npm.cmd run check
  Assert-ExitCode "TypeScript check"
}

npm.cmd run smart-batch:v2 -- ".\benchmarks\v3\sentinel_10_urls.txt" --output $OutputPath
Assert-ExitCode "10-URL Vision-First benchmark"

npx.cmd tsx ".\tests\live\v3\runBenchmarkReport.ts" $OutputPath $ReportPrefix
Assert-ExitCode "Dev6 benchmark comparison"

Write-Host ""
Write-Host "Dev6 sentinel benchmark PASS"
Write-Host "Workbook: $OutputPath"
Write-Host "Markdown: $ReportPrefix.md"
Write-Host "JSON: $ReportPrefix.json"
