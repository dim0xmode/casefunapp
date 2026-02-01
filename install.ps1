Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Go to repo root (script location)
Set-Location -Path $PSScriptRoot

Write-Host "Installing dependencies (root, backend, frontend)..." -ForegroundColor Cyan
npm run install:all

if ($LASTEXITCODE -ne 0) {
  Write-Host "Install failed." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "Install completed." -ForegroundColor Green
