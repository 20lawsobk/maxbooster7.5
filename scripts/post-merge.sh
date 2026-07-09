#!/usr/bin/env bash
# Max Booster — post-merge setup
# Runs automatically after every task merge.
# Must be: idempotent, non-interactive, fast.
set -euo pipefail

echo "==> Installing dependencies..."
npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline 2>&1 | tail -5

echo "==> Post-merge setup complete."
