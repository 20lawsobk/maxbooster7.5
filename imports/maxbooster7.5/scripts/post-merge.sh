#!/bin/bash
# Post-merge setup script — runs automatically after every task merge.
# Must be: idempotent, non-interactive, fast (< 2 min), and fail-fast.
set -euo pipefail

echo "[post-merge] Replaying verified legacy dependency updates if the retained copy exists..."
node scripts/apply-legacy-security-update.mjs --apply --if-present

echo "[post-merge] Installing dependencies..."
npm install --legacy-peer-deps --no-audit --no-fund 2>&1 | tail -5
node scripts/patch-electron-builder-transport.mjs

echo "[post-merge] Reconciling locked MaxCore and PDIM dependencies..."
node scripts/reconcile-nested-dependencies.mjs --apply --online

echo "[post-merge] Installing locked DNS and TLS workspace dependencies..."
for workspace in dns-os tls-proxy; do
  npm ci --prefix "$workspace" --ignore-scripts --no-audit --no-fund
done

echo "[post-merge] Verifying shipped dependency versions..."
node scripts/verify-runtime-artifacts.mjs deployment-dependencies

echo "[post-merge] Database changes require an explicit reviewed migration release; no shared database mutation during merge."

echo "[post-merge] Done."
