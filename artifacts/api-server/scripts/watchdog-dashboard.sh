#!/usr/bin/env bash
# watchdog-dashboard.sh
#
# Same watchdog pattern for the dashboard proxy artifact.
# DISABLE_PYTHON_SPAWN=1 ensures this instance never tries to own the
# Python model server — only the api-server artifact does that.

set -eo pipefail

RESTART_DELAY=5

while true; do
  echo "[Watchdog:dashboard] Starting server…"
  DISABLE_PYTHON_SPAWN=1 NODE_CLUSTER_WORKERS=1 pnpm --filter @workspace/api-server run serve || true
  EXIT_CODE=$?
  echo "[Watchdog:dashboard] Process exited (code=${EXIT_CODE}) — restarting in ${RESTART_DELAY}s"
  sleep "${RESTART_DELAY}"
done
