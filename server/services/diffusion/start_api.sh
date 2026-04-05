#!/bin/bash
# MaxCore Diffusion v4 LITE API Server Startup Script
# Starts the NumPy UNetV4 LITE model server at port 8010
# Runs from workspace root; adjusts sys.path via the Python script.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SVC_DIR="$(dirname "$SCRIPT_DIR")"

export MAXCORE_LITE=1
export PYTHONPATH="$SVC_DIR:$PYTHONPATH"
export VIDEO_DIFFUSION_PORT="${VIDEO_DIFFUSION_PORT:-8010}"
export VIDEO_DIFFUSION_HOST="${VIDEO_DIFFUSION_HOST:-0.0.0.0}"

echo "=== MaxCore Diffusion v4 LITE ==="
echo "  Model:   UNetV4 LITE (~6M params, NumPy, CPU)"
echo "  Port:    $VIDEO_DIFFUSION_PORT"
echo "  PYTHONPATH: $PYTHONPATH"
echo "  Working dir: $SCRIPT_DIR"
echo "=================================="

exec python3 "$SCRIPT_DIR/api_server_v4.py"
