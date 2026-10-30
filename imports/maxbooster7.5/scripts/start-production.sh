#!/usr/bin/env bash
# Max Booster — production start script
# Called by the deployment container after the build completes.
set -euo pipefail

# Prefer the clustered entry point (multi-worker); fall back to single-process
if [ -f "dist/cluster.mjs" ]; then
  echo "[start] Launching Max Booster via cluster (dist/cluster.mjs)"
  exec node dist/cluster.mjs
elif [ -f "dist/index.mjs" ]; then
  echo "[start] Launching Max Booster via server (dist/index.mjs)"
  exec node dist/index.mjs
else
  echo "[start] ERROR: No built server found. Run 'npm run build' first." >&2
  exit 1
fi
