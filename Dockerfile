# Multi-stage build: build frontend and backend

# Stage 1: build frontend
FROM node:20 AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend .
RUN npm run build

# Stage 2: build backend
FROM python:3.11-slim
WORKDIR /app

# Use a virtual environment to avoid running pip as root
RUN python -m venv /venv
ENV PATH="/venv/bin:$PATH"

COPY backend/requirements.txt ./backend/requirements.txt
RUN apt-get update && apt-get install -y --no-install-recommends iputils-ping traceroute \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir -r backend/requirements.txt

# Copy application source
COPY backend ./backend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 8380
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8380"]
