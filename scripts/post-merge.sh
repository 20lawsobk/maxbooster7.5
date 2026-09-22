#!/bin/bash
# Post-merge setup script — runs automatically after every task merge.
# Must be: idempotent, non-interactive, fast (< 2 min), and fail-fast.
set -euo pipefail

echo "[post-merge] Installing dependencies..."
npm install --legacy-peer-deps --no-audit --no-fund 2>&1 | tail -5

echo "[post-merge] Database changes require an explicit reviewed migration release; no shared database mutation during merge."

echo "[post-merge] Done."
