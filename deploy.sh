#!/usr/bin/env bash
set -e

# Absolute path of script
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"

# Use a persistent data directory that matches the project name.  This avoids
# wiping existing volumes when the repository is redeployed from a different
# location or under a different name.
PROJECT_NAME="$(basename "$BASE_DIR")"
DATA_DIR="/opt/${PROJECT_NAME}/data"

# Ensure the directory exists and expose it for docker-compose variable
# substitution.
mkdir -p "$DATA_DIR"
export DATA_DIR

cd "$BASE_DIR"

git pull

docker compose up -d --build
