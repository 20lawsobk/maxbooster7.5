#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PYTHONPATH="$ROOT/external/maxcore/artifacts/ai-training-server"
export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
export POCKET_ACCEL_ENABLED=0
exec python3 -m ai_model.training.candidate_registry "$@"