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
