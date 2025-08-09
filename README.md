
[中文文档](README.zh.md)


## Screenshots

<img width="2259" height="1379" alt="image" src="https://github.com/user-attachments/assets/0d5da999-97d6-4209-8ba2-1803f32b0f53" />

<img width="3797" height="5348" alt="image" src="https://github.com/user-attachments/assets/c563a821-57ba-42e3-8dcd-035b9b492a23" />


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

## Tech Stack

### Backend

- Python 3
- FastAPI
- Uvicorn
- SQLAlchemy & Pydantic
- Jinja2 templates
- SQLite

### Frontend

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Chart.js

### Deployment

- Docker
- Docker Compose

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

## Changelog

For a list of notable changes, see [CHANGELOG](CHANGELOG.md) or the [Chinese version](CHANGELOG.zh.md).

