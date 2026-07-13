#!/bin/bash
set -e

# Post-merge setup script — runs after every task merge.
# Must be idempotent, non-interactive, and fast.

echo "[post-merge] Installing dependencies..."
pnpm install --prefer-offline 2>&1

echo "[post-merge] Done."
