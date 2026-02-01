Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Go to repo root (script location)
Set-Location -Path $PSScriptRoot

Write-Host "Starting dev servers (backend + frontend)..." -ForegroundColor Cyan
npm run dev

if ($LASTEXITCODE -ne 0) {
  Write-Host "Dev server exited with error." -ForegroundColor Red
  exit $LASTEXITCODE
}
