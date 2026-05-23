Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RepoRoot

$NodePackageId = "OpenJS.NodeJS.LTS"
$DockerPackageId = "Docker.DockerDesktop"
$PnpmVersion = "9.15.4"

Write-Host ""
Write-Host "WorldWideView Windows launcher" -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot"
Write-Host ""

function Test-Command($Name) {
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Install-WithWinget($PackageId, $Label) {
    if (-not (Test-Command "winget")) {
        Write-Host "winget is not available, so $Label cannot be installed automatically." -ForegroundColor Red
        Write-Host "Install $Label manually, then run this script again."
        return $false
    }

    Write-Host "Installing $Label with winget..." -ForegroundColor Cyan
    winget install --id $PackageId --exact --source winget --accept-package-agreements --accept-source-agreements
    return $LASTEXITCODE -eq 0
}

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Ensure-Node {
    if (Test-Command "node") {
        $major = [int]((& node -v).TrimStart("v").Split(".")[0])
        if ($major -ge 20) {
            Write-Host "Node.js found: $(& node -v)" -ForegroundColor Green
            return
        }
        Write-Host "Node.js 20+ is required. Found $(& node -v)." -ForegroundColor Yellow
    }

    if (-not (Install-WithWinget $NodePackageId "Node.js LTS")) {
        exit 1
    }
    Refresh-Path

    if (-not (Test-Command "node")) {
        Write-Host "Node.js was installed, but is not available in this terminal yet." -ForegroundColor Yellow
        Write-Host "Close this window, open a new one, and run run-windows.cmd again."
        exit 1
    }
}

function Ensure-Pnpm {
    if (Test-Command "pnpm") {
        Write-Host "pnpm found: $(& pnpm --version)" -ForegroundColor Green
        return
    }

    Write-Host "pnpm is missing. Trying Corepack..." -ForegroundColor Yellow
    if (Test-Command "corepack") {
        corepack enable
        corepack prepare "pnpm@$PnpmVersion" --activate
        Refresh-Path
    }

    if (-not (Test-Command "pnpm")) {
        Write-Host "Installing pnpm globally with npm..." -ForegroundColor Cyan
        npm install -g "pnpm@$PnpmVersion"
        Refresh-Path
    }

    if (-not (Test-Command "pnpm")) {
        Write-Host "pnpm could not be installed automatically." -ForegroundColor Red
        Write-Host "Install it manually with: npm install -g pnpm@$PnpmVersion"
        exit 1
    }
}

function Ensure-Docker {
    if (Test-Command "docker") {
        Write-Host "Docker found: $(& docker --version)" -ForegroundColor Green
    } else {
        if (-not (Install-WithWinget $DockerPackageId "Docker Desktop")) {
            exit 1
        }
        Refresh-Path
    }

    if (-not (Test-Command "docker")) {
        Write-Host "Docker Desktop was installed, but Docker is not available in this terminal yet." -ForegroundColor Yellow
        Write-Host "Restart Windows or open Docker Desktop once, then run run-windows.cmd again."
        exit 1
    }

    try {
        docker info *> $null
    } catch {
        Write-Host "Docker Desktop is installed but not running. Starting it now..." -ForegroundColor Yellow
        $dockerDesktop = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
        if (Test-Path $dockerDesktop) {
            Start-Process $dockerDesktop
        }

        $ready = $false
        for ($i = 0; $i -lt 60; $i++) {
            Start-Sleep -Seconds 2
            try {
                docker info *> $null
                $ready = $true
                break
            } catch {
                Write-Host "." -NoNewline
            }
        }
        Write-Host ""

        if (-not $ready) {
            Write-Host "Docker Desktop did not become ready in time." -ForegroundColor Red
            Write-Host "Open Docker Desktop manually, finish any setup prompts, then run this script again."
            exit 1
        }
    }
}

function Ensure-Env {
    if (-not (Test-Path ".env")) {
        Write-Host "Creating .env with local defaults..." -ForegroundColor Cyan
        node scripts/setup.mjs
    }

    $envText = Get-Content ".env" -Raw
    if ($envText -notmatch "(?m)^WWV_DISABLE_AUTH=") {
        Add-Content ".env" "`n# Added by run-windows.ps1 for one-click local startup`nWWV_DISABLE_AUTH=true"
    } else {
        $envText = $envText -replace "(?m)^WWV_DISABLE_AUTH=.*$", "WWV_DISABLE_AUTH=true"
        Set-Content ".env" $envText -NoNewline
    }

    if ($envText -notmatch "(?m)^NEXT_PUBLIC_WWV_EDITION=") {
        Add-Content ".env" "`nNEXT_PUBLIC_WWV_EDITION=local"
    }
}

function Ensure-Dependencies {
    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing dependencies. This can take a few minutes on first run..." -ForegroundColor Cyan
        pnpm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Dependency installation failed." -ForegroundColor Red
            exit 1
        }
        return
    }

    Write-Host "Dependencies already installed." -ForegroundColor Green
}

function Test-PortAvailable($Port) {
    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        return $true
    } catch {
        return $false
    } finally {
        if ($null -ne $listener) {
            $listener.Stop()
        }
    }
}

function Select-Port {
    foreach ($port in 3000..3010) {
        if (Test-PortAvailable $port) {
            return $port
        }
    }
    Write-Host "No free port found between 3000 and 3010." -ForegroundColor Red
    exit 1
}

function Start-BrowserWhenReady($Url) {
    Start-Job -ScriptBlock {
        param($ReadyUrl)
        for ($i = 0; $i -lt 180; $i++) {
            try {
                $response = Invoke-WebRequest -Uri $ReadyUrl -UseBasicParsing -TimeoutSec 2
                if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                    Start-Process $ReadyUrl
                    return
                }
            } catch {
                Start-Sleep -Seconds 1
            }
        }
    } -ArgumentList $Url | Out-Null
}

Ensure-Node
Ensure-Pnpm
Ensure-Docker
Ensure-Env
Ensure-Dependencies

$port = Select-Port
$url = "http://localhost:$port"
$env:PORT = "$port"

Write-Host ""
Write-Host "Starting WorldWideView at $url" -ForegroundColor Green
Write-Host "The browser will open automatically when the server is ready."
Write-Host "Press Ctrl+C in this window to stop the app."
Write-Host ""

Start-BrowserWhenReady $url
pnpm run dev
