#!/bin/bash
# Production startup script — does not require npm in PATH.
# Used as the deployment run command so the Nix store path for npm is irrelevant.

set -e

# ── 1. Locate node ────────────────────────────────────────────────────────────
# Try stable profile paths first, then fall back to a find in the Nix store.
for _dir in \
  /nix/var/nix/profiles/default/bin \
  /home/runner/.nix-profile/bin \
  /root/.nix-profile/bin \
  /usr/local/bin \
  /usr/bin \
  /bin; do
  if [ -x "$_dir/node" ]; then
    export PATH="$_dir:$PATH"
    break
  fi
done

if ! command -v node &>/dev/null; then
  # Last resort: scan the Nix store for a node binary.
  _found=$(find /nix/store -maxdepth 4 -name "node" -type f -executable 2>/dev/null | head -1)
  if [ -n "$_found" ]; then
    export PATH="$(dirname "$_found"):$PATH"
  fi
fi

if ! command -v node &>/dev/null; then
  echo "[start.sh] FATAL: cannot locate node binary" >&2
  exit 1
fi

echo "[start.sh] node: $(command -v node) ($(node --version))"

# ── 2. Start boosterstate sidecar ────────────────────────────────────────────
if ! pgrep -x boosterstate > /dev/null 2>&1; then
  if [ -x "./boosterstate/target/release/boosterstate" ]; then
    ./boosterstate/target/release/boosterstate &
    echo "[start.sh] boosterstate started (pid $!)"
    sleep 2
  else
    echo "[start.sh] WARNING: boosterstate binary not found — skipping sidecar"
  fi
else
  echo "[start.sh] boosterstate already running"
fi

# ── 3. Launch the cluster ─────────────────────────────────────────────────────
export UV_THREADPOOL_SIZE="${UV_THREADPOOL_SIZE:-8}"
export TF_NUM_INTEROP_THREADS="${TF_NUM_INTEROP_THREADS:-2}"
export TF_NUM_INTRAOP_THREADS="${TF_NUM_INTRAOP_THREADS:-2}"
export NODE_ENV="production"

echo "[start.sh] starting node dist/cluster.cjs"
exec node --max-old-space-size="${NODE_MAX_OLD_SPACE_SIZE:-4096}" dist/cluster.cjs
