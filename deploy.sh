#!/usr/bin/env bash
set -e

pip install -r backend/requirements.txt
npm --prefix frontend install

uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
npm --prefix frontend run dev
