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

# Prefer the prebuilt binary (produced by build.sh; present even without a
# Rust toolchain in this environment), same order start.sh uses in
# production, then fall back to a local debug/release cargo build if one
# happens to exist. Without this fallback chain, dev environments that only
# ever ran build.sh (no `cargo build`) would silently skip BoosterState even
# though a working binary is sitting right there.
_BOOSTER_BIN=""
if [ -x "./bin/boosterstate" ]; then
  _BOOSTER_BIN="./bin/boosterstate"
elif [ -x "./boosterstate/target/release/boosterstate" ]; then
  _BOOSTER_BIN="./boosterstate/target/release/boosterstate"
elif [ -x "./boosterstate/target/debug/boosterstate" ]; then
  _BOOSTER_BIN="./boosterstate/target/debug/boosterstate"
fi

if [ -n "$_BOOSTER_BIN" ]; then
  if pgrep -x boosterstate >/dev/null 2>&1; then
    echo "[start-dev] boosterstate already running — skipping"
  else
    BOOSTERSTATE_PORT="${BOOSTERSTATE_SIDECAR_PORT}" "$_BOOSTER_BIN" &
    _BOOSTER_PID=$!
    # Surface a bind failure before starting the app. A short check is enough:
    # BoosterState binds its socket before entering its serve loop.
    sleep 0.25
    if ! kill -0 "$_BOOSTER_PID" 2>/dev/null; then
      wait "$_BOOSTER_PID"
      echo "[Ports] FATAL: BoosterState did not remain running on ${BOOSTERSTATE_SIDECAR_PORT}" >&2
      exit 1
    fi
    echo "[start-dev] boosterstate started (pid ${_BOOSTER_PID}) on internal port ${BOOSTERSTATE_SIDECAR_PORT} via ${_BOOSTER_BIN}"
  fi
else
  echo "[start-dev] boosterstate binary not found (bin/boosterstate or boosterstate/target/{release,debug}) — skipping sidecar"
fi

set +e
NODE_ENV=development npx tsx server/index.ts &
_APP_PID=$!
wait "$_APP_PID"
_APP_STATUS=$?
set -e
exit "$_APP_STATUS"