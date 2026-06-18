#!/bin/bash
# MaxCore Diffusion v4 API Server Startup Script
# Starts the UNetV4 FULL model server at port 8008 (Reserved VM deployment)
# Runs from workspace root; adjusts sys.path via the Python script.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SVC_DIR="$(dirname "$SCRIPT_DIR")"
WORKSPACE_ROOT="$(dirname "$(dirname "$SVC_DIR")")"

export MAXCORE_LITE=0
export PYTHONPATH="$SVC_DIR:$PYTHONPATH"
export VIDEO_DIFFUSION_PORT="${VIDEO_DIFFUSION_PORT:-8008}"
export VIDEO_DIFFUSION_HOST="${VIDEO_DIFFUSION_HOST:-0.0.0.0}"

# Reserved VM: 16 vCPU / 64 GiB — tell NumPy BLAS to use all cores
export OMP_NUM_THREADS=16
export MKL_NUM_THREADS=16
export OPENBLAS_NUM_THREADS=16
export VECLIB_MAXIMUM_THREADS=16
export NUMEXPR_NUM_THREADS=16

# Use the project .venv python if available (has fastapi/uvicorn/numpy),
# otherwise fall back to system python3.
PYTHON="$WORKSPACE_ROOT/.venv/bin/python"
if [ ! -x "$PYTHON" ]; then
  PYTHON="python3"
fi

echo "=== MaxCore Diffusion v4 FULL ==="
echo "  Model:   UNetV4 FULL (~300M params, DigitalGPU, Reserved VM)"
echo "  Port:    $VIDEO_DIFFUSION_PORT"
echo "  Python:  $PYTHON"
echo "  PYTHONPATH: $PYTHONPATH"
echo "  Working dir: $SCRIPT_DIR"
echo "=================================="

exec "$PYTHON" "$SCRIPT_DIR/api_server_v4.py"
