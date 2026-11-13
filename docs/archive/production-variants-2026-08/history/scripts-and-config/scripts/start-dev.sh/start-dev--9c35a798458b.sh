#!/usr/bin/env bash
set -euo pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${_SCRIPT_DIR}/port-contract.sh"

# Cross-check the shell/runtime port contract above against .replit's own
# [[ports]] table, catching drift between the two before the app boots.
if ! npx tsx "${_SCRIPT_DIR}/check-port-contract.ts"; then
  echo "[Ports] FATAL: port contract check failed; aborting startup" >&2
  exit 1
fi

_BOOSTER_PID=""
cleanup() {
  if [ -n "$_BOOSTER_PID" ] && kill -0 "$_BOOSTER_PID" 2>/dev/null; then
    kill -TERM "$_BOOSTER_PID" 2>/dev/null || true
    wait "$_BOOSTER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [ -x "./boosterstate/target/debug/boosterstate" ]; then
  BOOSTERSTATE_PORT="${BOOSTERSTATE_SIDECAR_PORT}" \
    ./boosterstate/target/debug/boosterstate &
  _BOOSTER_PID=$!
  # Surface a bind failure before starting the app. A short check is enough:
  # BoosterState binds its socket before entering its serve loop.
  sleep 0.25
  if ! kill -0 "$_BOOSTER_PID" 2>/dev/null; then
    wait "$_BOOSTER_PID"
    echo "[Ports] FATAL: BoosterState did not remain running on ${BOOSTERSTATE_SIDECAR_PORT}" >&2
    exit 1
  fi
fi

set +e
NODE_ENV=development npx tsx server/index.ts &
_APP_PID=$!
wait "$_APP_PID"
_APP_STATUS=$?
set -e
exit "$_APP_STATUS"