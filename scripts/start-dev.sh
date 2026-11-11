#!/usr/bin/env bash
set -euo pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${_SCRIPT_DIR}/port-contract.sh"
source "${_SCRIPT_DIR}/redis-supervisor.sh"

# Cross-check the shell/runtime port contract above against .replit's own
# [[ports]] table, catching drift between the two before the app boots.
if ! npx tsx "${_SCRIPT_DIR}/check-port-contract.ts"; then
  echo "[Ports] FATAL: port contract check failed; aborting startup" >&2
  exit 1
fi

_BOOSTER_PID=""
_APP_PID=""
_DIFFUSION_PID=""
_AI_SIDECAR_PID=""
_stop_owned() {
  local pid="$1"
  [ -n "$pid" ] || return 0
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
}
cleanup() {
  _stop_owned "$_APP_PID"
  _stop_owned "$_AI_SIDECAR_PID"
  _stop_owned "$_DIFFUSION_PID"
  _stop_owned "$_BOOSTER_PID"
  redis_supervisor_cleanup
}
trap cleanup EXIT INT TERM

_http_responds() {
  node --input-type=module -e '
    try {
      await fetch(`http://127.0.0.1:${process.argv[1]}/health`, {
        signal: AbortSignal.timeout(500),
      });
      process.exit(0);
    } catch { process.exit(1); }
  ' "$1" >/dev/null 2>&1
}

_wait_http() {
  local name="$1" port="$2" attempt
  for attempt in $(seq 1 80); do
    _http_responds "$port" && return 0
    sleep 0.25
  done
  echo "[start-dev] FATAL: ${name} did not open HTTP on port ${port}" >&2
  return 1
}

if ! redis_supervisor_start "$(command -v node)" "$(cd "${_SCRIPT_DIR}/.." && pwd)"; then
  echo "[start-dev] FATAL: configured loopback Redis is unavailable" >&2
  exit 1
fi

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

# Mirror production: these internal services are real MaxCore proxies, not
# placeholder listeners. They bind loopback and are never the public web port.
if ! _http_responds "$VIDEO_DIFFUSION_PORT"; then
  VIDEO_DIFFUSION_PORT="$VIDEO_DIFFUSION_PORT" NODE_ENV=development \
    ./node_modules/.bin/tsx server/diffusion-gateway/index.ts \
    >> /tmp/diffusion_gateway_dev.log 2>&1 &
  _DIFFUSION_PID=$!
  echo "[start-dev] MaxCore diffusion gateway starting on ${VIDEO_DIFFUSION_PORT}"
  _wait_http "MaxCore diffusion gateway" "$VIDEO_DIFFUSION_PORT"
fi

if ! _http_responds "$PYTHON_AI_PORT"; then
  _PY_BIN=""
  for _candidate in ./python_runtime/bin/python3 ./.venv/bin/python3; do
    if [ -x "$_candidate" ] && "$_candidate" --version >/dev/null 2>&1; then
      _PY_BIN="$_candidate"
      break
    fi
  done
  if [ -z "$_PY_BIN" ] && command -v python3 >/dev/null 2>&1; then
    _PY_BIN="$(command -v python3)"
  fi
  if [ -z "$_PY_BIN" ]; then
    echo "[start-dev] FATAL: Python runtime required for configured MaxCore proxy port ${PYTHON_AI_PORT} is unavailable" >&2
    exit 1
  fi
  ENABLE_LEGACY_AI_SIDECAR=1 PYTHON_AI_PORT="$PYTHON_AI_PORT" \
    "$_PY_BIN" server/services/ai_content_sidecar.py \
    >> /tmp/ai_content_sidecar_dev.log 2>&1 &
  _AI_SIDECAR_PID=$!
  echo "[start-dev] MaxCore proxy sidecar starting on ${PYTHON_AI_PORT}"
  _wait_http "MaxCore proxy sidecar" "$PYTHON_AI_PORT"
fi

set +e
NODE_ENV=development npx tsx server/index.ts &
_APP_PID=$!
set -e

if ! node scripts/wait-configured-ports.mjs --timeout-ms=300000; then
  echo "[start-dev] FATAL: configured listeners did not become ready" >&2
  exit 1
fi

set +e
wait "$_APP_PID"
_APP_STATUS=$?
set -e
exit "$_APP_STATUS"