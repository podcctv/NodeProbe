# NodeProbe

Lightweight self-hosted probe service for testing global connectivity to a target VPS — with real-time network diagnostics and public result visualization.

## Development

- **Backend**: FastAPI with SQLite located in `backend/`
- **Frontend**: React + Vite + Tailwind CSS located in `frontend/`

### Quick start

```bash
./deploy.sh
```

The script installs dependencies and launches the FastAPI server together with the Vite development server.
