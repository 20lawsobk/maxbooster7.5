#!/bin/bash
# Production startup script — used as the deployment run command.
#
# KEY: The deployment container uses ztoc lazy-loading for container layers.
# [ -x /path/to/node ] calls stat() and sees NOTHING for lazily-loaded paths.
# exec /path/to/node triggers the ztoc fetch and the binary becomes available.
# We MUST verify node by actually running it, not by checking file existence.
export STARTUP_STARTED_AT_MS="$(date +%s%3N)"
_STARTUP_SECONDS=$SECONDS
_startup_mark() {
  echo "[deployment-timing] startup-$1: $((SECONDS - _STARTUP_SECONDS))s elapsed"
}
_GW_PID=""
_READINESS_PID=""
_BOOSTER_PID=""
_LEGACY_PID=""
_RESTORE_PID=""
_startup_aux_cleanup() {
  local pid
  for pid in "$_GW_PID" "$_READINESS_PID" "${_STUB_PID:-}" "$_BOOSTER_PID" "$_LEGACY_PID" "$_RESTORE_PID"; do
    if [ -n "$pid" ] && jobs -pr | grep -qx "$pid"; then
      kill -TERM "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
}
trap _startup_aux_cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# ── 1. Locate node ────────────────────────────────────────────────────────────
# _try_node: attempt to run a candidate binary; sets _NODE_BIN on success.
_try_node() {
  local _bin="$1"
  [ -z "$_bin" ] && return 1
  if [ "$("$_bin" -p 'process.versions.node.split(".")[0]' 2>/dev/null)" = "22" ]; then
    _NODE_BIN="$_bin"
    return 0
  fi
  return 1
}

_NODE_BIN=""

# Resolve the directory containing start.sh so we can find .node_bin/
# even if start.sh is called from a different working directory.
_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$_SCRIPT_DIR" || exit 1

# a) Bundled portable node downloaded during build.sh — FIRST choice.
#    This is the official nodejs.org binary (glibc-linked) that was fetched
#    at build time and stored in .node_bin/ inside the project directory.
#    It works in the run container even though the Nix store has no nodejs.
_try_node "$_SCRIPT_DIR/.node_bin/node" \
  && echo "[start.sh] node [a] bundled: $_NODE_BIN"

# b) node already in PATH (dev environment, CI, or if nix-profile is wired up)
if [ -z "$_NODE_BIN" ]; then
  _try_node "$(command -v node 2>/dev/null || true)" \
    && echo "[start.sh] node [b] PATH: $_NODE_BIN"
fi

# c) Replit's pid2 helper — may not exist in run container but try anyway
if [ -z "$_NODE_BIN" ] && command -v available-pid2-node-paths >/dev/null 2>&1; then
  while IFS= read -r _candidate; do
    _try_node "$_candidate" && { echo "[start.sh] node [c] pid2: $_NODE_BIN"; break; }
  done < <(available-pid2-node-paths 2>/dev/null || true)
fi

# d) pid2 helper via glob on replit-runtime-path
if [ -z "$_NODE_BIN" ]; then
  for _h in /nix/store/*-replit-runtime-path/bin/available-pid2-node-paths; do
    [ -f "$_h" ] || continue
    while IFS= read -r _candidate; do
      _try_node "$_candidate" && { echo "[start.sh] node [d] pid2-glob: $_NODE_BIN"; break 2; }
    done < <("$_h" 2>/dev/null || true)
  done
fi

# e) /home/runner/.nix-profile/bin/node — ztoc exec triggers lazy load
if [ -z "$_NODE_BIN" ]; then
  _try_node "/home/runner/.nix-profile/bin/node" \
    && echo "[start.sh] node [e] nix-profile: $_NODE_BIN"
fi

# f) Standard Linux paths
if [ -z "$_NODE_BIN" ]; then
  for _p in /usr/local/bin/node /usr/bin/node /bin/node; do
    _try_node "$_p" && { echo "[start.sh] node [f] std: $_NODE_BIN"; break; }
  done
fi

# g) Glob any nodejs in /nix/store — exec triggers ztoc fetch
if [ -z "$_NODE_BIN" ]; then
  for _d in /nix/store/*-nodejs-22*/bin /nix/store/*-nodejs-*/bin; do
    _try_node "$_d/node" && { echo "[start.sh] node [g] nix-glob: $_NODE_BIN"; break; }
  done
fi

if [ -z "$_NODE_BIN" ]; then
  echo "[start.sh] FATAL: cannot locate node binary" >&2
  echo "[start.sh]   PATH=$PATH" >&2
  echo "[start.sh]   bundled .node_bin/node: $(ls -lh "$_SCRIPT_DIR/.node_bin/node" 2>/dev/null || echo missing)" >&2
  echo "[start.sh]   .node_bin/node exec test: $("$_SCRIPT_DIR/.node_bin/node" --version 2>&1 || echo failed)" >&2
  echo "[start.sh]   /nix/store exists: $([ -d /nix/store ] && echo yes || echo no)" >&2
  echo "[start.sh]   /nix/store/*-nodejs-* count: $(ls -d /nix/store/*-nodejs-* 2>/dev/null | wc -l)" >&2
  echo "[start.sh]   pid2 output: $(available-pid2-node-paths 2>&1 || echo none)" >&2
  echo "[start.sh]   nix-profile/bin/node exists: $(ls /home/runner/.nix-profile/bin/node 2>/dev/null || echo no)" >&2
  exit 1
fi

export PATH="$(dirname "$_NODE_BIN"):$PATH"
echo "[start.sh] node: $_NODE_BIN ($("$_NODE_BIN" --version))"

# ── 1a. Validate and export the runtime port contract ─────────────────────────
# This must happen before the liveness stub or any sidecar starts. A duplicate
# assignment is a configuration failure, never something to "work around" by
# letting one process silently take another service's socket.
if ! source "$_SCRIPT_DIR/scripts/port-contract.sh"; then
  echo "[start.sh] FATAL: runtime port contract could not be loaded; aborting startup" >&2
  exit 1
fi

# ── 1a-2. Cross-check against .replit's own [[ports]] table ──────────────────
# Runs once node_modules is confirmed present (tsx is a production dependency);
# node_modules is guaranteed to exist by this point because deploy builds run
# `npm ci` ahead of start.sh. Deferred until after the port-contract.sh env
# vars above are exported so the check observes the exact values the app will.
if [ ! -f "$_SCRIPT_DIR/.replit" ]; then
  echo "[start.sh] .replit not packaged in runtime image — skipping source-config port cross-check"
elif [ -d "$_SCRIPT_DIR/node_modules/.bin" ] && [ -x "$_SCRIPT_DIR/node_modules/.bin/tsx" ]; then
  if ! "$_NODE_BIN" "$_SCRIPT_DIR/node_modules/.bin/tsx" "$_SCRIPT_DIR/scripts/check-port-contract.ts"; then
    echo "[start.sh] FATAL: port contract check failed against .replit; aborting startup" >&2
    exit 1
  fi
else
  echo "[start.sh] WARNING: tsx not found — skipping .replit port-contract cross-check (internal port validation above still applies)"
fi

# ── 1b. Boot-time liveness stub ───────────────────────────────────────────────
_startup_mark node-and-port-contract
# Binds the real port immediately (before node_modules even exists) so the
# platform's health check against "/" gets a 200 from second one, instead of
# "connection refused" / a crash-restart loop, while capsule restore + venv +
# sidecars finish below. Pure Node core-module script — needs zero deps.
_STUB_PID=""
if [ -f "$_SCRIPT_DIR/scripts/boot-stub-server.mjs" ]; then
  PORT="${PORT:-5000}" "$_NODE_BIN" "$_SCRIPT_DIR/scripts/boot-stub-server.mjs" &
  _STUB_PID=$!
  echo "[start.sh] boot-stub liveness server started (pid $_STUB_PID) on port ${PORT:-5000}"
else
  echo "[start.sh] WARNING: scripts/boot-stub-server.mjs not found — health check will 500 until real server binds"
fi

# ── 2. PDIM restore (Extract & Boot) ─────────────────────────────────────────
# Extracts node_modules.pdim (and friends) on first startup. No-op on
# subsequent restarts (directories already present, sentinel files found).
# Reads compression format from *.manifest.json — handles xz and gzip capsules.
#
# Node modules, application code and Python block boot. Python consumers
# resolve the validated interpreter only after this barrier. The boot stub
# serves liveness while extraction is in progress; readiness remains false.
if [ -f "dist/pdim-restore.mjs" ]; then
  echo "[start.sh] Running PDIM capsule restore (critical: node_modules, application, Python)..."
  "$_NODE_BIN" dist/pdim-restore.mjs critical
  _RESTORE_RC=$?
  if [ $_RESTORE_RC -ne 0 ]; then
    echo "[start.sh] FATAL: critical PDIM restore (node_modules) failed" >&2
    exit 1
  fi
  echo "[start.sh] Restoring external/maxcore / external/pdim in background..."
  "$_NODE_BIN" dist/pdim-restore.mjs background >> /tmp/pdim-background-restore.log 2>&1 &
  _RESTORE_PID=$!
  echo "[start.sh] background PDIM restore pid $_RESTORE_PID"
else
  echo "[start.sh] dist/pdim-restore.mjs not found — skipping PDIM restore"
fi
_startup_mark critical-restore

# A configured loopback REDIS_URL is an owned BullMQ dependency. External Redis
# remains operator-managed. Start only the local instance, require PONG before
# workers can boot, and retain its append-only/RDB state under data/redis.
source "$_SCRIPT_DIR/scripts/redis-supervisor.sh"
if ! redis_supervisor_start "$_NODE_BIN" "$_SCRIPT_DIR"; then
  echo "[start.sh] FATAL: configured loopback Redis is unavailable" >&2
  exit 1
fi
# Redis is already live while the remaining prerequisites are checked. Ensure
# any later startup failure stops only the process this launcher owns.
trap '_startup_aux_cleanup; redis_supervisor_cleanup' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# The gateway needs restored JS, not Python. Warm it while Python dependencies
# are checked instead of adding its entire startup after those checks.
if ! pgrep -f "dist/gateway.mjs" >/dev/null 2>&1; then
  if [ ! -f "dist/gateway.mjs" ]; then
    echo "[start.sh] FATAL: required dist/gateway.mjs missing" >&2
    exit 1
  fi
  "$_NODE_BIN" dist/gateway.mjs >> /tmp/diffusion_gateway.log 2>&1 &
  _GW_PID=$!
  echo "[start.sh] Diffusion Gateway starting (pid $_GW_PID) on ${VIDEO_DIFFUSION_PORT}"
fi

# ── 3. Activate Python virtual environment ────────────────────────────────────
# Check ./python_runtime/ first (build artifact created by build.sh, not in
# .dockerignore), then fall back to .venv/ (dev environment).
# NEVER use bare 'python3' — the Replit python-wrapper (a Go binary) panics
# when Python is not configured in the minimal run container.
_PYENV_ACTIVATED=0
for _pydir in "$(pwd)/python_runtime"; do
  for _pysuffix in "bin/python3" "bin/python"; do
    _VENV_PY="${_pydir}/${_pysuffix}"
    if [ -f "$_VENV_PY" ] && "$_VENV_PY" --version >/dev/null 2>&1; then
      export PATH="${_pydir}/bin:$PATH"
      export VIRTUAL_ENV="${_pydir}"
      echo "[start.sh] Python venv activated ($("$_VENV_PY" --version 2>&1)): ${_pydir}/"
      _PYENV_ACTIVATED=1
      break 2
    fi
  done
done
if [ "$_PYENV_ACTIVATED" = "0" ]; then
  echo "[start.sh] FATAL: required Python runtime is not functional" >&2
  exit 1
fi
export MAXBOOSTER_PYTHON="$_VENV_PY"
"$_VENV_PY" -I -c "import numpy, PIL, scipy, fastapi, uvicorn, pydantic, psycopg2, librosa, sklearn, soundfile, torch; print('[start.sh] MaxCore Python deps ready (torch ' + torch.__version__ + ')')" || exit 1
_startup_mark python-and-redis

# Reject aggregate oversubscription before spawning sidecars or app workers.
_PRIMARY_HEAP_MB="$("$_NODE_BIN" --input-type=module -e '
  import { computeWorkerSizing } from "./dist/compute-sizing.mjs";
  const app = computeWorkerSizing({ envOverrideVar: "CLUSTER_WORKERS" });
  if (process.env.MAXCORE_LOCAL !== "0")
    computeWorkerSizing({ reserveCore: false, envOverrideVar: "MAXCORE_LOCAL_CLUSTER_WORKERS" });
  console.log(app.primaryHeapMB);
')" || exit 1

# ── 3. Start boosterstate sidecar ────────────────────────────────────────────
# Check ./bin/boosterstate first (compiled by build.sh, not in .dockerignore),
# then fall back to the dev-build path in boosterstate/target/release/.
if ! pgrep -x boosterstate >/dev/null 2>&1; then
  _BOOSTER_BIN=""
  [ -x "./bin/boosterstate" ] && _BOOSTER_BIN="./bin/boosterstate"
  [ -z "$_BOOSTER_BIN" ] && [ -x "./boosterstate/target/release/boosterstate" ] && \
    _BOOSTER_BIN="./boosterstate/target/release/boosterstate"

  if [ -n "$_BOOSTER_BIN" ]; then
    _SIDECAR_PORT="${BOOSTERSTATE_SIDECAR_PORT}"
    BOOSTERSTATE_PORT="$_SIDECAR_PORT" "$_BOOSTER_BIN" &
    _BOOSTER_PID=$!
    echo "[start.sh] boosterstate started (pid $_BOOSTER_PID) on internal port $_SIDECAR_PORT via $_BOOSTER_BIN"
  else
    echo "[start.sh] FATAL: required Boosterstate executable missing" >&2
    exit 1
  fi
else
  echo "[start.sh] boosterstate already running"
fi

# ── 3b. Optional legacy Python AI Content Sidecar ─────────────────────────────
# The sidecar provides all /generate/content, /generate/script, /analyze/audio,
# etc. endpoints consumed by pythonAIService.ts.  It must start alongside the
# main server so tier-1 AI content generation works in production.
if [ "${ENABLE_LEGACY_AI_SIDECAR:-0}" = "1" ] && ! pgrep -f "ai_content_sidecar.py" >/dev/null 2>&1; then
  _PY_BIN=""
  # Prefer the venv Python that was just activated (has dependencies)
  if [ "$_PYENV_ACTIVATED" = "1" ] && command -v python3 >/dev/null 2>&1; then
    _PY_BIN="$(command -v python3)"
  fi
  # Fallback: try well-known paths
  if [ -z "$_PY_BIN" ]; then
    for _p in /home/runner/.nix-profile/bin/python3 /usr/bin/python3 /usr/local/bin/python3; do
      if "$_p" --version >/dev/null 2>&1; then _PY_BIN="$_p"; break; fi
    done
  fi

  # Nix store glob — exec triggers ztoc lazy-load in the deployment run container.
  # Mirrors the same strategy used above for Node (sections e-g).
  # Patterns ordered: cpython release builds first, then wrapped/python-only.
  if [ -z "$_PY_BIN" ]; then
    for _pd in \
      /nix/store/*-python3-3*/bin \
      /nix/store/*-python3.*/bin \
      /nix/store/*-python-3*/bin \
      /nix/store/*-python-wrapped*/bin \
      /nix/store/*-python3*/bin; do
      [ -f "${_pd}/python3" ] || continue
      if "${_pd}/python3" --version >/dev/null 2>&1; then
        _PY_BIN="${_pd}/python3"
        echo "[start.sh] Python [nix-glob]: $_PY_BIN ($("$_PY_BIN" --version 2>&1))"
        break
      fi
    done
  fi

  if [ -n "$_PY_BIN" ]; then
    PYTHON_AI_PORT="${PYTHON_AI_PORT}" "$_PY_BIN" server/services/ai_content_sidecar.py \
      >> /tmp/ai_content_sidecar.log 2>&1 &
    _LEGACY_PID=$!
    echo "[start.sh] Python AI Content Sidecar started (pid $_LEGACY_PID) on port ${PYTHON_AI_PORT} via $_PY_BIN"
  else
    echo "[start.sh] WARNING: Python not found — legacy AI sidecar unavailable"
  fi
else
  if [ "${ENABLE_LEGACY_AI_SIDECAR:-0}" = "1" ]; then
    echo "[start.sh] Python AI Content Sidecar already running"
  else
    echo "[start.sh] Legacy Python AI sidecar disabled; AI requests must use MaxCore Digital GPU"
  fi
fi

# ── 3c. Start MaxCore Diffusion Gateway ──────────────────────────────────────
# The Diffusion Gateway runs on port 8008 and acts as the middle tier between
# Max Booster and MaxCore AI for video/image diffusion training and relay.
# The gateway is transport/orchestration only. AI inference must remain in
# MaxCore's Digital GPU/HyperGPU path; local model fallback is not permitted.
if ! "$_NODE_BIN" scripts/startup-health.mjs gateway "$VIDEO_DIFFUSION_PORT" ${_GW_PID:+"$_GW_PID"}; then
  echo "[start.sh] FATAL: Diffusion Gateway did not become healthy" >&2
  exit 1
fi

# No TensorFlow.js CPU fallback is configured here. Any model path that cannot
# reach MaxCore/Digital GPU must fail explicitly rather than consume host CPU.

# ── 4b. Hand off the port from the boot-stub to the real server ─────────────
# The real server binds the same port next, so the stub must release it
# first. SIGTERM triggers its graceful shutdown handler; wait briefly for the
# port to actually free rather than assuming the signal was instantaneous.
if [ -n "$_STUB_PID" ] && kill -0 "$_STUB_PID" 2>/dev/null; then
  kill -TERM "$_STUB_PID" 2>/dev/null
  for _i in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$_STUB_PID" 2>/dev/null || break
    sleep 0.2
  done
  kill -0 "$_STUB_PID" 2>/dev/null && kill -KILL "$_STUB_PID" 2>/dev/null
  echo "[start.sh] boot-stub liveness server stopped, port ${PORT:-5000} released"
fi
_startup_mark cluster-handoff

# ── 5. Launch the cluster ─────────────────────────────────────────────────────
export UV_THREADPOOL_SIZE="${UV_THREADPOOL_SIZE:-8}"
export TF_NUM_INTEROP_THREADS="${TF_NUM_INTEROP_THREADS:-2}"
export TF_NUM_INTRAOP_THREADS="${TF_NUM_INTRAOP_THREADS:-2}"
export NODE_ENV="production"

# Prefer cluster entry (multi-worker); fall back to single-process server
if [ -f "dist/cluster.mjs" ]; then
  echo "[start.sh] starting node dist/cluster.mjs"
  _APP_PID=""
  _shutdown_runtime() {
    if [ -n "$_APP_PID" ] && kill -0 "$_APP_PID" 2>/dev/null; then
      kill -TERM "$_APP_PID" 2>/dev/null || true
      wait "$_APP_PID" 2>/dev/null || true
    fi
    redis_supervisor_cleanup
    _startup_aux_cleanup
  }
  trap _shutdown_runtime EXIT
  trap '_shutdown_runtime; exit 130' INT
  trap '_shutdown_runtime; exit 143' TERM
  "$_NODE_BIN" --max-old-space-size="$_PRIMARY_HEAP_MB" dist/cluster.mjs &
  _APP_PID=$!
  # Observation only: do not mistake an open socket/liveness stub for a usable
  # SPA plus healthy dependencies. A timeout is logged, never reported as live.
  "$_NODE_BIN" scripts/startup-health.mjs application "$PORT" "$_APP_PID" &
  _READINESS_PID=$!
  set +e
  wait "$_APP_PID"
  _APP_STATUS=$?
  set -e
  exit "$_APP_STATUS"
else
  echo "[start.sh] FATAL: required dist/cluster.mjs missing — run npm run build first" >&2
  exit 1
fi
