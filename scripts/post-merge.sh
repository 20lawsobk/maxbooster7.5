#!/bin/bash
# Post-merge setup — runs automatically after every task merge.
# Must be idempotent, non-interactive, and fast.
set -e

echo "[post-merge] Installing dependencies..."
SKIP_POSTINSTALL=1 pnpm install --no-frozen-lockfile 2>&1

echo "[post-merge] Done ✅"
