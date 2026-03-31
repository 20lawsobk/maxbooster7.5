#!/bin/bash
# Production startup script — does not require npm in PATH.
# Used as the deployment run command so the Nix store path for npm is irrelevant.

set -e

# ── 1. Locate node ────────────────────────────────────────────────────────────
# Strategy (in order):
#   a) node already in PATH (dev / repl environment)
#   b) Replit's available-pid2-node-paths helper (deployment — returns exact paths)
#   c) Known deterministic Nix store paths for Node.js 22.x on stable-25_05
#   d) Standard Linux binary dirs
#   e) Brute-force find in /nix/store as a last resort

# Replit-provided helper that prints the canonical node binary path(s)
_PID2_HELPER="/nix/store/hf82lxy09dr6mxizcyksjjjsn6szd1ba-replit-runtime-path/bin/available-pid2-node-paths"

_locate_node() {
  # a) Already in PATH
  if command -v node &>/dev/null; then return 0; fi

  # b) Replit deployment helper
  local _helper=""
  if command -v available-pid2-node-paths &>/dev/null; then
    _helper="available-pid2-node-paths"
  elif [ -x "$_PID2_HELPER" ]; then
    _helper="$_PID2_HELPER"
  fi
  if [ -n "$_helper" ]; then
    while IFS= read -r _candidate; do
      if [ -x "$_candidate" ]; then
        export PATH="$(dirname "$_candidate"):$PATH"
        return 0
      fi
    done < <("$_helper" 2>/dev/null)
  fi

  # c) Known deterministic Nix store paths (content-addressed — same on any machine
  #    using the same nixpkgs input, so safe to hardcode as high-priority fallbacks)
  for _dir in \
    /nix/store/bl6iwirn83qj9r8wng43kfdqd5mfahj8-nodejs-22.22.0/bin \
    /nix/store/nvf9kaarb9kqqdbygl9cbzhli1y8yjik-nodejs-22.20.0/bin \
    /nix/var/nix/profiles/default/bin \
    /home/runner/.nix-profile/bin \
    /root/.nix-profile/bin \
    /usr/local/bin \
    /usr/bin \
    /bin; do
    if [ -x "$_dir/node" ]; then
      export PATH="$_dir:$PATH"
      return 0
    fi
  done

  # d) Last resort: brute-force scan — exclude wrappers (symlinks that re-exec npm/npx)
  local _found
  _found=$(find /nix/store -maxdepth 5 -name "node" -type f -executable 2>/dev/null \
    | grep -v "wrapped\|wrapper" | head -1)
  if [ -n "$_found" ]; then
    export PATH="$(dirname "$_found"):$PATH"
    return 0
  fi

  return 1
}

if ! _locate_node; then
  echo "[start.sh] FATAL: cannot locate node binary" >&2
  exit 1
fi

echo "[start.sh] node: $(command -v node) ($(node --version))"

# ── 2. Activate Python virtual environment ────────────────────────────────────
# Prepend .venv/bin to PATH so python3 and all installed packages (numpy,
# pillow, etc.) resolve from the project-local venv created by build.sh,
# never from the read-only Nix store.
if [ -d ".venv/bin" ]; then
  export PATH="$(pwd)/.venv/bin:$PATH"
  export VIRTUAL_ENV="$(pwd)/.venv"
  echo "[start.sh] Python venv activated: $(python3 --version 2>&1)"
else
  echo "[start.sh] WARNING: .venv not found — Python scripts may use system packages"
fi

# ── 3. Start boosterstate sidecar ────────────────────────────────────────────
# BOOSTERSTATE_PORT may equal PORT (5000) in the one-port configuration — clients
# reach the sidecar via the /api/boosterstate Express proxy.  The binary itself
# must always bind to an internal port that does not conflict with the main app.
# BOOSTERSTATE_SIDECAR_PORT (default 9877) is the binary's actual listen address.
if ! pgrep -x boosterstate > /dev/null 2>&1; then
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
exec node --max-old-space-size="${NODE_MAX_OLD_SPACE_SIZE:-4096}" dist/cluster.cjs
