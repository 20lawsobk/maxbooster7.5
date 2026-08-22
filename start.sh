#!/bin/bash
# Production startup script — used as the deployment run command.
#
# KEY: The deployment container uses ztoc lazy-loading for container layers.
# [ -x /path/to/node ] calls stat() and sees NOTHING for lazily-loaded paths.
# exec /path/to/node triggers the ztoc fetch and the binary becomes available.
# We MUST verify node by actually running it, not by checking file existence.

# ── 1. Locate node ────────────────────────────────────────────────────────────
# _try_node: attempt to run a candidate binary; sets _NODE_BIN on success.
_try_node() {
  local _bin="$1"
  [ -z "$_bin" ] && return 1
  if "$_bin" --version >/dev/null 2>&1; then
    _NODE_BIN="$_bin"
    return 0
  fi
  return 1
}

_NODE_BIN=""

# Resolve the directory containing start.sh so we can find .node_bin/
# even if start.sh is called from a different working directory.
_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

# ── 1b. Boot-time liveness stub ───────────────────────────────────────────────
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
# Only node_modules blocks boot — Node cannot import anything without it.
# python_runtime / external/maxcore / external/pdim restore in the
# BACKGROUND, in parallel with the app itself starting: those subsystems
# already start async and degrade gracefully (Python sidecar warns and
# falls back, MaxCore's supervisor reports degraded/unreachable, pdim isn't
# imported by the running app at all). Blocking on all four here delays port
# binding past the deployment's startup-probe timeout on a cold boot when
# their combined extraction time is large.
if [ -f "dist/pdim-restore.mjs" ]; then
  echo "[start.sh] Running PDIM capsule restore (critical: node_modules)..."
  "$_NODE_BIN" dist/pdim-restore.mjs critical
  _RESTORE_RC=$?
  if [ $_RESTORE_RC -ne 0 ]; then
    echo "[start.sh] FATAL: critical PDIM restore (node_modules) failed" >&2
    exit 1
  fi
  echo "[start.sh] Restoring python_runtime / external/maxcore / external/pdim in background..."
  "$_NODE_BIN" dist/pdim-restore.mjs background >> /tmp/pdim-background-restore.log 2>&1 &
  echo "[start.sh] background PDIM restore pid $!"
else
  echo "[start.sh] dist/pdim-restore.mjs not found — skipping PDIM restore"
fi

# ── 3. Activate Python virtual environment ────────────────────────────────────
# Check ./python_runtime/ first (build artifact created by build.sh, not in
# .dockerignore), then fall back to .venv/ (dev environment).
# NEVER use bare 'python3' — the Replit python-wrapper (a Go binary) panics
# when Python is not configured in the minimal run container.
_PYENV_ACTIVATED=0
for _pydir in "$(pwd)/python_runtime" "$(pwd)/.venv"; do
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
  echo "[start.sh] WARNING: .venv Python not functional — Python features disabled (video/audio analysis unavailable)"
fi

# ── 3. Start boosterstate sidecar ────────────────────────────────────────────
# Check ./bin/boosterstate first (compiled by build.sh, not in .dockerignore),
# then fall back to the dev-build path in boosterstate/target/release/.
if ! pgrep -x boosterstate >/dev/null 2>&1; then
  _BOOSTER_BIN=""
  [ -x "./bin/boosterstate" ] && _BOOSTER_BIN="./bin/boosterstate"
  [ -z "$_BOOSTER_BIN" ] && [ -x "./boosterstate/target/release/boosterstate" ] && \
    _BOOSTER_BIN="./boosterstate/target/release/boosterstate"

  if [ -n "$_BOOSTER_BIN" ]; then
    _SIDECAR_PORT="${BOOSTERSTATE_SIDECAR_PORT:-9877}"
    BOOSTERSTATE_PORT="$_SIDECAR_PORT" "$_BOOSTER_BIN" &
    echo "[start.sh] boosterstate started (pid $!) on internal port $_SIDECAR_PORT via $_BOOSTER_BIN"
  else
    echo "[start.sh] WARNING: boosterstate binary not found — skipping sidecar"
  fi
else
  echo "[start.sh] boosterstate already running"
fi

# ── 3b. Start Python AI Content Sidecar ──────────────────────────────────────
# The sidecar provides all /generate/content, /generate/script, /analyze/audio,
# etc. endpoints consumed by pythonAIService.ts.  It must start alongside the
# main server so tier-1 AI content generation works in production.
if ! pgrep -f "ai_content_sidecar.py" >/dev/null 2>&1; then
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
    PYTHON_AI_PORT="${PYTHON_AI_PORT:-9878}" "$_PY_BIN" server/services/ai_content_sidecar.py \
      >> /tmp/ai_content_sidecar.log 2>&1 &
    echo "[start.sh] Python AI Content Sidecar started (pid $!) on port ${PYTHON_AI_PORT:-9878} via $_PY_BIN"
  else
    echo "[start.sh] WARNING: Python not found — Python AI Sidecar not started (content generation will use fallback)"
  fi
else
  echo "[start.sh] Python AI Content Sidecar already running"
fi

# ── 3c. Start MaxCore Diffusion Gateway ──────────────────────────────────────
# The Diffusion Gateway runs on port 8008 and acts as the middle tier between
# Max Booster and MaxCore AI for video/image diffusion training and relay.
# diffusionBackgroundTrainer.ts checks localhost:8008 before deciding whether to
# run the local fallback loop — if the gateway is not up it falls back to local
# training instead of routing through MaxCore.
if ! pgrep -f "dist/gateway.mjs" >/dev/null 2>&1; then
  if [ -f "dist/gateway.mjs" ]; then
    "$_NODE_BIN" dist/gateway.mjs >> /tmp/diffusion_gateway.log 2>&1 &
    _GW_PID=$!
    echo "[start.sh] MaxCore Diffusion Gateway started (pid $_GW_PID) on port 8008"
    # Brief pause so the gateway is listening before the cluster boots and checks it
    sleep 2
  else
    echo "[start.sh] WARNING: dist/gateway.mjs not found — Diffusion Gateway not started"
  fi
else
  echo "[start.sh] MaxCore Diffusion Gateway already running"
fi

# ── 4. Set up @tensorflow/tfjs-node native library path ──────────────────────
# @tensorflow/tfjs-node ships libtensorflow.so.2.9.1 inside its npm package but
# the .node binding looks for the unversioned soname libtensorflow.so.2 via the
# dynamic linker.  Create the versioned symlinks if they are missing (npm install
# does not always create them on NixOS/Replit) and add the dir to LD_LIBRARY_PATH
# so the linker can resolve them without root / system-wide ldconfig.
_TF_LIB_DIR="$(pwd)/node_modules/@tensorflow/tfjs-node/deps/lib"
if [ -d "$_TF_LIB_DIR" ]; then
  # Create libtensorflow.so.2 → libtensorflow.so.2.9.1 symlink if missing
  if [ ! -f "$_TF_LIB_DIR/libtensorflow.so.2" ] && [ -f "$_TF_LIB_DIR/libtensorflow.so.2.9.1" ]; then
    ln -sf libtensorflow.so.2.9.1 "$_TF_LIB_DIR/libtensorflow.so.2" 2>/dev/null || true
    echo "[start.sh] created libtensorflow.so.2 symlink"
  fi
  # Create libtensorflow_framework.so.2 → libtensorflow_framework.so.2.9.1 symlink if missing
  if [ ! -f "$_TF_LIB_DIR/libtensorflow_framework.so.2" ] && [ -f "$_TF_LIB_DIR/libtensorflow_framework.so.2.9.1" ]; then
    ln -sf libtensorflow_framework.so.2.9.1 "$_TF_LIB_DIR/libtensorflow_framework.so.2" 2>/dev/null || true
    echo "[start.sh] created libtensorflow_framework.so.2 symlink"
  fi
  export LD_LIBRARY_PATH="$_TF_LIB_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  echo "[start.sh] LD_LIBRARY_PATH set to include @tensorflow/tfjs-node deps"
else
  # Not an error: the native libtensorflow download is blocked in this
  # environment (tar package firewall), so @tensorflow/tfjs-node ships without
  # deps/lib and the app intentionally falls back to the pure-JS TF.js CPU
  # backend ("[BaseTrainer] TF.js CPU backend active" — verified working).
  echo "[start.sh] tfjs-node native libs not present — using TF.js CPU backend (expected fallback)"
fi

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

# ── 5. Launch the cluster ─────────────────────────────────────────────────────
export UV_THREADPOOL_SIZE="${UV_THREADPOOL_SIZE:-8}"
export TF_NUM_INTEROP_THREADS="${TF_NUM_INTEROP_THREADS:-2}"
export TF_NUM_INTRAOP_THREADS="${TF_NUM_INTRAOP_THREADS:-2}"
export NODE_ENV="production"

# Prefer cluster entry (multi-worker); fall back to single-process server
if [ -f "dist/cluster.mjs" ]; then
  echo "[start.sh] starting node dist/cluster.mjs"
  exec "$_NODE_BIN" --max-old-space-size="${NODE_MAX_OLD_SPACE_SIZE:-4096}" dist/cluster.mjs
elif [ -f "dist/index.mjs" ]; then
  echo "[start.sh] starting node dist/index.mjs (cluster not found)"
  exec "$_NODE_BIN" --max-old-space-size="${NODE_MAX_OLD_SPACE_SIZE:-4096}" dist/index.mjs
else
  echo "[start.sh] FATAL: neither dist/cluster.mjs nor dist/index.mjs found — run npm run build first" >&2
  exit 1
fi
