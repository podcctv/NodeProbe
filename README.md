[![Build & Publish Docker](https://github.com/podcctv/NodeProbe/actions/workflows/docker-build.yml/badge.svg)](https://github.com/podcctv/NodeProbe/actions/workflows/docker-build.yml)



[中文文档](README.zh.md)

## Features

- ICMP ping with latency measurement
- Traceroute with optional downloadable path report
- HTTP speed test with progress tracking, visual charts and a colour‑coded progress bar
- Automatic collection of client network information (IP, ASN, ISP and location)
- Admin registration, login and test management interface
- Persistent SQLite storage for test records
- Grouped test statistics by browser and IP with hourly aggregation
- Copy probe results as a Markdown summary table
- One‑click deployment via Docker Compose or a prebuilt image

## Development

- **Backend**: FastAPI with SQLite located in `backend/`
- **Frontend**: React + Vite + Tailwind CSS located in `frontend/`

### Quick start

```bash
./deploy.sh
```

The script installs dependencies and launches the FastAPI server together with the Vite development server.

## Docker deployment

This project supports one‑click Docker deployment bundling all required services:

- HTTP service for viewing and accessing probe results
- Database service for persistent test record storage
- Cron service for daily scheduled tasks

### Compose example

```bash
git clone https://github.com/podcctv/NodeProbe.git
cd NodeProbe
docker compose up -d
```

Default data will be stored under `/opt/NodeProbe/data/`.
The directory can be customised by setting the `DATA_DIR` environment variable
before running Docker Compose or `deploy.sh`.

Access example:

```
http://your-server-ip:8380
```

### Admin login

On first start the backend creates a default administrator account:

- Username: `NodeProbe`
- Password: `nodeprobe` followed by the last segment of your server's **public** IP address
  (e.g. public IP `203.0.113.5` -> password `nodeprobe5`)

If the server cannot determine its public IP, you can provide it via the `SERVER_IP`
environment variable.

### Using the deploy script

The repository provides a `deploy.sh` script for one‑click deployment or updates. The script automatically switches to its directory and can be executed from anywhere:

```bash
git clone https://github.com/podcctv/NodeProbe.git
chmod +x ./NodeProbe/deploy.sh
./NodeProbe/deploy.sh
```

The script sets up persistent directories, pulls the latest code and rebuilds/starts services via Docker Compose.

### Using the prebuilt image

If you only need to run the service, you can use the prebuilt image directly:

```bash
docker pull ghcr.io/podcctv/nodeprobe:latest
docker run -d --name nodeprobe -p 8380:8380 \
  -v /opt/NodeProbe/data:/app/data \
  ghcr.io/podcctv/nodeprobe:latest
```

Data will be saved to `/opt/NodeProbe/data/` by default.

### Windows one-click deployment

Windows users can deploy NodeProbe with the following PowerShell script. Run it in an elevated PowerShell session:

```powershell
# === NodeProbe one-click deployment (Docker Desktop / Windows) ===
$ErrorActionPreference = 'Stop'

# 1) Configurable variables
$Repo      = "https://github.com/podcctv/NodeProbe"
$Branch    = "main"
$WorkDir   = "$env:USERPROFILE\NodeProbe"
$ZipTmp    = "$env:TEMP\nodeprobe.zip"
$Image     = "nodeprobe:latest"
$Container = "nodeprobe"
$HostPort  = 8000        # Change if port is occupied
$AppPort   = 8000        # Service port inside container

# 2) Check Docker availability
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker command not found. Install and start Docker Desktop first."
}
try { docker version | Out-Null } catch { throw "Docker Desktop is not running or has no permission to access the Docker engine." }

# 3) Prepare working directory
if (Test-Path $WorkDir) {
  Write-Host "=> Directory exists: $WorkDir"
} else {
  New-Item -ItemType Directory -Path $WorkDir | Out-Null
  Write-Host "=> Created directory: $WorkDir"
}

# 4) Fetch source code (git preferred, ZIP fallback)
if (Get-Command git -ErrorAction SilentlyContinue) {
  if (Test-Path (Join-Path $WorkDir ".git")) {
    Write-Host "=> Git repository detected, pulling updates..."
    git -C $WorkDir fetch --all --prune
    git -C $WorkDir checkout $Branch
    git -C $WorkDir reset --hard origin/$Branch
  } else {
    Write-Host "=> Using git clone..."
    git clone --depth 1 --branch $Branch $Repo $WorkDir
  }
} else {
  Write-Host "=> Git not found, downloading ZIP..."
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest "$Repo/archive/refs/heads/$Branch.zip" -OutFile $ZipTmp
  if (Test-Path $WorkDir) { Remove-Item -Recurse -Force $WorkDir }
  Expand-Archive -LiteralPath $ZipTmp -DestinationPath (Split-Path $WorkDir) -Force
  Rename-Item -Path (Join-Path (Split-Path $WorkDir) ("NodeProbe-" + $Branch)) -NewName (Split-Path $WorkDir -Leaf)
}

# 5) Generate a generic Dockerfile if missing
$Dockerfile = Join-Path $WorkDir "Dockerfile"
if (-not (Test-Path $Dockerfile)) {
  Write-Host "=> Dockerfile not found, generating a generic version..."
  @"
FROM python:3.11-slim
WORKDIR /app
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# Base dependencies (add more system libs as needed)
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
COPY . .
RUN python -m pip install --upgrade pip && \
    if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
EXPOSE ${AppPort}
# Entry point: adjust if your project uses a different module
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "${AppPort}"]
"@ | Set-Content -Path $Dockerfile -Encoding UTF8
}

# 6) Build image
Write-Host "=> Building image: $Image"
docker build -t $Image $WorkDir

# 7) Replace existing container
if ((docker ps -a --format '{{.Names}}') -contains $Container) {
  Write-Host "=> Existing container found, removing: $Container"
  docker rm -f $Container | Out-Null
}

# 8) Run container
Write-Host "=> Starting container: $Container  mapping port $HostPort -> $AppPort"
docker run -d --name $Container -p $HostPort:$AppPort --restart unless-stopped $Image | Out-Null

# 9) Health check and access
Start-Sleep -Seconds 2
Write-Host "=> Recent logs (Ctrl+C to stop following):"
docker logs --tail 50 $Container
Write-Host "=> Open http://localhost:$HostPort in your browser"
try { Start-Process "http://localhost:$HostPort" } catch {}
Write-Host "=== Deployment complete ==="
```

## Changelog

For a list of notable changes, see [CHANGELOG](CHANGELOG.md) or the [Chinese version](CHANGELOG.zh.md).

