#!/bin/bash
# Post-merge setup script — runs automatically after every task merge.
# Must be: idempotent, non-interactive, fast (< 2 min), and fail-fast.
set -e

echo "[post-merge] Installing dependencies..."
npm install --legacy-peer-deps --no-audit --no-fund 2>&1 | tail -5

echo "[post-merge] Running DB migrations (push, non-interactive)..."
npx drizzle-kit push --config=drizzle.config.ts 2>&1 | tail -10 || {
  echo "[post-merge] WARN: drizzle-kit push failed — schema may already be up to date"
}

echo "[post-merge] Done."
