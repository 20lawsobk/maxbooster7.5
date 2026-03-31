#!/bin/bash
# Production startup script — does not require npm in PATH.
# Used as the deployment run command so the Nix store path for npm is irrelevant.

# NOTE: Do NOT use `set -e` at the top level — the node-finder loop uses
# non-zero returns intentionally and we handle errors explicitly.

# ── 1. Locate node ────────────────────────────────────────────────────────────
# Strategy (in order — no hardcoded hashes; globs match any Nix store version):
#   a) node already in PATH (dev / repl environment)
#   b) .node_bin_dir saved by build.sh (build & runtime share the same Nix store)
#   c) Glob-match /nix/store/*-nodejs-22*/bin/node  (any Node.js 22.x, any hash)
#   d) Glob-match /nix/store/*-nodejs-*/bin/node    (any Node.js version)
#   e) Replit's available-pid2-node-paths helper (found via glob on its package dir)
#   f) Standard Linux paths (/usr/local/bin, /usr/bin, /bin)

_NODE_BIN=""

# a) Already in PATH
if command -v node >/dev/null 2>&1; then
  _NODE_BIN=$(command -v node)
fi

# b) Build-time saved path
if [ -z "$_NODE_BIN" ] && [ -f ".node_bin_dir" ]; then
  _d=$(cat .node_bin_dir 2>/dev/null || true)
  if [ -n "$_d" ] && [ -x "$_d/node" ]; then
    _NODE_BIN="$_d/node"
  fi
fi

# c) Glob: any Node.js 22.x in /nix/store (hash-independent)
if [ -z "$_NODE_BIN" ]; then
  for _d in /nix/store/*-nodejs-22*/bin; do
    if [ -x "$_d/node" ]; then
      _NODE_BIN="$_d/node"
      break
    fi
  done
fi

# d) Glob: any Node.js in /nix/store (fallback to any version)
if [ -z "$_NODE_BIN" ]; then
  for _d in /nix/store/*-nodejs-*/bin; do
    if [ -x "$_d/node" ]; then
      _NODE_BIN="$_d/node"
      break
    fi
  done
fi

# e) Replit pid2 helper — find it via glob (avoids hash-in-path dependency)
if [ -z "$_NODE_BIN" ]; then
  _HELPER=""
  if command -v available-pid2-node-paths >/dev/null 2>&1; then
    _HELPER="available-pid2-node-paths"
  else
    for _h in /nix/store/*-replit-runtime-path/bin/available-pid2-node-paths; do
      if [ -x "$_h" ]; then _HELPER="$_h"; break; fi
    done
  fi
  if [ -n "$_HELPER" ]; then
    _CANDIDATE=$("$_HELPER" 2>/dev/null | head -1 || true)
    if [ -n "$_CANDIDATE" ] && [ -x "$_CANDIDATE" ]; then
      _NODE_BIN="$_CANDIDATE"
    fi
  fi
fi

# f) Standard Linux paths
if [ -z "$_NODE_BIN" ]; then
  for _d in /usr/local/bin /usr/bin /bin; do
    if [ -x "$_d/node" ]; then
      _NODE_BIN="$_d/node"
      break
    fi
  done
fi

if [ -z "$_NODE_BIN" ]; then
  echo "[start.sh] FATAL: cannot locate node binary" >&2
  echo "[start.sh]   PATH=$PATH" >&2
  echo "[start.sh]   /nix/store exists: $([ -d /nix/store ] && echo yes || echo no)" >&2
  echo "[start.sh]   /nix/store/*-nodejs-* count: $(ls -d /nix/store/*-nodejs-* 2>/dev/null | wc -l)" >&2
  exit 1
fi

export PATH="$(dirname "$_NODE_BIN"):$PATH"
echo "[start.sh] node: $_NODE_BIN ($(node --version))"

# ── 2. Activate Python virtual environment ────────────────────────────────────
if [ -d ".venv/bin" ]; then
  export PATH="$(pwd)/.venv/bin:$PATH"
  export VIRTUAL_ENV="$(pwd)/.venv"
  echo "[start.sh] Python venv activated: $(python3 --version 2>&1)"
else
  echo "[start.sh] WARNING: .venv not found — Python scripts may use system packages"
fi

# ── 3. Start boosterstate sidecar ────────────────────────────────────────────
if ! pgrep -x boosterstate >/dev/null 2>&1; then
  if [ -x "./boosterstate/target/release/boosterstate" ]; then
    _SIDECAR_PORT="${BOOSTERSTATE_SIDECAR_PORT:-9877}"
    BOOSTERSTATE_PORT="$_SIDECAR_PORT" ./boosterstate/target/release/boosterstate &
    echo "[start.sh] boosterstate started (pid $!) on internal port $_SIDECAR_PORT"
  else
    echo "[start.sh] WARNING: boosterstate binary not found — skipping sidecar"
  fi
else
  echo "[start.sh] boosterstate already running"
fi

# ── 4. Launch the cluster ─────────────────────────────────────────────────────
export UV_THREADPOOL_SIZE="${UV_THREADPOOL_SIZE:-8}"
export TF_NUM_INTEROP_THREADS="${TF_NUM_INTEROP_THREADS:-2}"
export TF_NUM_INTRAOP_THREADS="${TF_NUM_INTRAOP_THREADS:-2}"
export NODE_ENV="production"

echo "[start.sh] starting node dist/cluster.cjs"
exec "$_NODE_BIN" --max-old-space-size="${NODE_MAX_OLD_SPACE_SIZE:-4096}" dist/cluster.cjs
