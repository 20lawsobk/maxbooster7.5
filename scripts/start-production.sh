#!/usr/bin/env bash
# Max Booster — production start script
# Called by the deployment container after the build completes.
set -euo pipefail

# Prefer the clustered entry point (multi-worker); fall back to single-process
if [ -f "dist/cluster.cjs" ]; then
  echo "[start] Launching Max Booster via cluster (dist/cluster.cjs)"
  exec node dist/cluster.cjs
elif [ -f "dist/index.cjs" ]; then
  echo "[start] Launching Max Booster via server (dist/index.cjs)"
  exec node dist/index.cjs
else
  echo "[start] ERROR: No built server found. Run 'npm run build' first." >&2
  exit 1
fi
