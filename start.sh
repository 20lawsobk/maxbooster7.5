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

# a) node already in PATH (dev environment, or if pid2 / nix-profile wired it up)
_try_node "$(command -v node 2>/dev/null || true)" && echo "[start.sh] node [a] PATH: $_NODE_BIN"

# b) Replit's pid2 helper — designed exactly for this: returns the canonical
#    node path for the current runtime container (lazy-loaded via ztoc).
#    available-pid2-node-paths IS in PATH via replit-runtime-path.
if [ -z "$_NODE_BIN" ] && command -v available-pid2-node-paths >/dev/null 2>&1; then
  while IFS= read -r _candidate; do
    _try_node "$_candidate" && { echo "[start.sh] node [b] pid2: $_NODE_BIN"; break; }
  done < <(available-pid2-node-paths 2>/dev/null || true)
fi

# b2) pid2 helper found via glob on replit-runtime-path (in case it's not in PATH)
if [ -z "$_NODE_BIN" ]; then
  for _h in /nix/store/*-replit-runtime-path/bin/available-pid2-node-paths; do
    [ -f "$_h" ] || continue
    while IFS= read -r _candidate; do
      _try_node "$_candidate" && { echo "[start.sh] node [b2] pid2-glob: $_NODE_BIN"; break 2; }
    done < <("$_h" 2>/dev/null || true)
  done
fi

# c) .node_bin_dir written by build.sh — run it, don't stat it
if [ -z "$_NODE_BIN" ] && [ -f ".node_bin_dir" ]; then
  _d=$(cat .node_bin_dir 2>/dev/null || true)
  _try_node "$_d/node" && echo "[start.sh] node [c] .node_bin_dir: $_NODE_BIN"
fi

# d) /home/runner/.nix-profile/bin/node — in PATH; might be lazy-loaded via ztoc
if [ -z "$_NODE_BIN" ]; then
  _try_node "/home/runner/.nix-profile/bin/node" \
    && echo "[start.sh] node [d] nix-profile: $_NODE_BIN"
fi

# e) Standard Linux paths
if [ -z "$_NODE_BIN" ]; then
  for _p in /usr/local/bin/node /usr/bin/node /bin/node; do
    _try_node "$_p" && { echo "[start.sh] node [e] std: $_NODE_BIN"; break; }
  done
fi

# f) Glob any nodejs in /nix/store — exec triggers ztoc fetch (stat would miss)
if [ -z "$_NODE_BIN" ]; then
  for _d in /nix/store/*-nodejs-22*/bin /nix/store/*-nodejs-*/bin; do
    _try_node "$_d/node" && { echo "[start.sh] node [f] nix-glob: $_NODE_BIN"; break; }
  done
fi

if [ -z "$_NODE_BIN" ]; then
  echo "[start.sh] FATAL: cannot locate node binary" >&2
  echo "[start.sh]   PATH=$PATH" >&2
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
