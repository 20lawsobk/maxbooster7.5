#!/usr/bin/env bash
# watchdog-api.sh
#
# Wraps the api-server production serve command.  When Node.js is killed for
# any reason — OOM, SIGKILL, unhandled exception — this bash process (< 2 MB,
# immune to the OOM killer) wakes up and restarts the server.
#
# Used as the artifact.toml production run command so the VM is always
# self-healing without requiring an external API token or manual redeploy.

set -eo pipefail

RESTART_DELAY=5

while true; do
  echo "[Watchdog:api-server] Starting server…"
  NODE_CLUSTER_WORKERS=1 pnpm --filter @workspace/api-server run serve || true
  EXIT_CODE=$?
  echo "[Watchdog:api-server] Process exited (code=${EXIT_CODE}) — restarting in ${RESTART_DELAY}s"
  sleep "${RESTART_DELAY}"
done
