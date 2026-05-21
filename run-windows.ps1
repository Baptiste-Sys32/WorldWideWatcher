Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RepoRoot

Write-Host ""
Write-Host "WorldWideView local server" -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot"
Write-Host ""

function Test-Command($Name) {
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

if (-not (Test-Command "node")) {
    Write-Host "Node.js is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Install Node.js 20+ or 24+ from https://nodejs.org/ and run this script again."
    exit 1
}

if (-not (Test-Command "pnpm")) {
    Write-Host "pnpm is not installed. Trying Corepack..." -ForegroundColor Yellow
    if (Test-Command "corepack") {
        corepack enable
        corepack prepare pnpm@9.15.4 --activate
    }
}

if (-not (Test-Command "pnpm")) {
    Write-Host "pnpm is still not available." -ForegroundColor Red
    Write-Host "Run: npm install -g pnpm@9.15.4"
    exit 1
}

if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "Created .env from .env.example. Check DATABASE_URL before continuing." -ForegroundColor Yellow
    } else {
        Write-Host ".env is missing and .env.example was not found." -ForegroundColor Red
        exit 1
    }
}

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Cyan
    pnpm install
}

Write-Host ""
Write-Host "Starting WorldWideView at http://localhost:3000" -ForegroundColor Green
Write-Host "Press Ctrl+C in this window to stop it."
Write-Host ""

pnpm run dev
