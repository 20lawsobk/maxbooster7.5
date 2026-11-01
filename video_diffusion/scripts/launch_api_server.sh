#!/usr/bin/env bash
# Start the FastAPI inference server.
# Usage: bash scripts/launch_api_server.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export VIDEO_DIFFUSION_CONFIG="${VIDEO_DIFFUSION_CONFIG:-configs/diffusion_base.yaml}"
export VIDEO_DIFFUSION_PORT="${VIDEO_DIFFUSION_PORT:-8010}"
export VIDEO_DIFFUSION_HOST="${VIDEO_DIFFUSION_HOST:-0.0.0.0}"

echo "Starting Video Diffusion API server on $VIDEO_DIFFUSION_HOST:$VIDEO_DIFFUSION_PORT"
echo "Config: $VIDEO_DIFFUSION_CONFIG"

python -m uvicorn infer.api_server:app \
    --host "$VIDEO_DIFFUSION_HOST" \
    --port "$VIDEO_DIFFUSION_PORT" \
    --workers 1 \
    --loop uvloop \
    --log-level info
