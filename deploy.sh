#!/usr/bin/env bash
set -e

# Absolute path of script
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="/opt/nodeprobe/data"

mkdir -p "$DATA_DIR"
cd "$BASE_DIR"

git pull

docker compose up -d --build
