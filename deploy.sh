#!/usr/bin/env bash
set -e

# Absolute path of script
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
# Use a persistent data directory that matches the project name
DATA_DIR="/opt/NodeProbe/data"

mkdir -p "$DATA_DIR"
cd "$BASE_DIR"

git pull

docker compose up -d --build
