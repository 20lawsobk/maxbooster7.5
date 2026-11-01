#!/usr/bin/env bash
# Launch distributed diffusion model training.
# Usage: bash scripts/launch_diffusion.sh [--config configs/train_diffusion.yaml] [--gpus 8]

set -euo pipefail

CONFIG="${1:-configs/train_diffusion.yaml}"
GPUS="${2:-1}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Starting diffusion training"
echo "  Config : $CONFIG"
echo "  GPUs   : $GPUS"
echo "  Root   : $ROOT"

cd "$ROOT"

if [ "$GPUS" -gt 1 ]; then
    torchrun \
        --nproc_per_node="$GPUS" \
        --master_port=29501 \
        train/train_diffusion.py \
        --config "$CONFIG"
else
    python train/train_diffusion.py --config "$CONFIG"
fi
