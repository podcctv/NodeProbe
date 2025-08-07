# NodeProbe

[中文文档](README.zh.md)

NodeProbe is a lightweight self‑hosted probe service for testing global connectivity to a target server with real‑time network diagnostics and public result visualization.

## Features

- ICMP ping with latency measurement
- Traceroute with optional downloadable path report
- HTTP speed test with progress tracking and recorded results
- Automatic collection of client network information (IP, ASN, ISP and location)
- Admin registration, login and test management interface
- Persistent SQLite storage for test records
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

Access example:

```
http://your-server-ip:8380
```

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

## Changelog

For a list of notable changes, see [CHANGELOG](CHANGELOG.md).

