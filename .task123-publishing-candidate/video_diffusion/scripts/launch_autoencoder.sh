#!/usr/bin/env bash
# Launch distributed autoencoder training.
# Usage: bash scripts/launch_autoencoder.sh [--config configs/train_autoencoder.yaml] [--gpus 4]

set -euo pipefail

CONFIG="${1:-configs/train_autoencoder.yaml}"
GPUS="${2:-1}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Starting autoencoder training"
echo "  Config : $CONFIG"
echo "  GPUs   : $GPUS"
echo "  Root   : $ROOT"

cd "$ROOT"

if [ "$GPUS" -gt 1 ]; then
    torchrun \
        --nproc_per_node="$GPUS" \
        --master_port=29500 \
        train/train_autoencoder.py \
        --config "$CONFIG"
else
    python train/train_autoencoder.py --config "$CONFIG"
fi
