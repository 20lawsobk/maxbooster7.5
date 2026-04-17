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

# ── 2. PDIM restore (Extract & Boot) ─────────────────────────────────────────
# Extracts node_modules.pdim and python_runtime.pdim on first startup.
# No-op on subsequent restarts (directories already present).
# Reads compression format from *.manifest.json — handles xz and gzip capsules.
if [ -f "dist/pdim-restore.mjs" ]; then
  echo "[start.sh] Running PDIM capsule restore..."
  "$_NODE_BIN" dist/pdim-restore.mjs
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
  echo "[start.sh] WARNING: @tensorflow/tfjs-node deps/lib not found — TF ML features may be degraded"
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
