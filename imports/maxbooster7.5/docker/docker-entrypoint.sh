#!/bin/bash
# Docker runtime entrypoint — a self-hosted equivalent of start.sh, stripped
# of everything that only makes sense inside Replit's own run container
# (ztoc-lazy-load node resolution, .replit port-contract cross-check, PDIM
# capsule extraction). None of that applies to a normal Docker image: node
# is just installed in the base image, and node_modules/dist are already
# real directories baked into a layer, not compressed capsules.
#
# What this DOES preserve, because it is real production behavior and not
# a Replit-only workaround:
#   - the internal port contract (PORT is the only public port; every
#     sidecar is loopback-only and must not collide)
#   - starting the boosterstate sidecar if it was compiled into the image
#   - activating a Python venv if one was baked in (optional — see Dockerfile)
#   - the same cluster entrypoint (dist/cluster.mjs) used in Replit prod
#
# Not bundled here (same graceful-degradation contract Replit prod uses
# when they're absent): the legacy Python AI content sidecar and the
# MaxCore video diffusion gateway. Both require a Python runtime this
# image does not ship by default; the app already logs a warning and
# disables those specific features rather than crashing when they're
# missing — see server logs for "[start.sh] WARNING: .venv Python not
# functional" as the equivalent message on Replit.

set -euo pipefail

export PORT="${PORT:-5000}"
export LOCAL_PDIM_PORT="${LOCAL_PDIM_PORT:-5556}"
export VIDEO_DIFFUSION_PORT="${VIDEO_DIFFUSION_PORT:-8008}"
export MAXCORE_LOCAL_PORT="${MAXCORE_LOCAL_PORT:-8090}"
export BOOSTERSTATE_SIDECAR_PORT="${BOOSTERSTATE_SIDECAR_PORT:-9877}"
export MODEL_API_PORT="${MODEL_API_PORT:-9878}"
export MODEL_API_HEALTH_PORT="${MODEL_API_HEALTH_PORT:-9879}"
export PYTHON_AI_PORT="${PYTHON_AI_PORT:-9880}"
export NODE_ENV="${NODE_ENV:-production}"

echo "[docker-entrypoint] ports — public=${PORT}; internal: pdim=${LOCAL_PDIM_PORT}, boosterstate=${BOOSTERSTATE_SIDECAR_PORT}"

# ── Optional Python venv (only present if built with --build-arg WITH_PYTHON=1) ──
if [ -x "/app/python_runtime/bin/python3" ]; then
  export PATH="/app/python_runtime/bin:$PATH"
  export VIRTUAL_ENV="/app/python_runtime"
  echo "[docker-entrypoint] Python venv activated: $(python3 --version 2>&1)"
else
  echo "[docker-entrypoint] No Python venv baked in — video/audio analysis + legacy AI sidecar stay disabled (app degrades gracefully)"
fi

# ── boosterstate sidecar (compiled in the rust-builder stage; see Dockerfile) ──
if [ -x "/app/bin/boosterstate" ]; then
  BOOSTERSTATE_PORT="$BOOSTERSTATE_SIDECAR_PORT" /app/bin/boosterstate &
  echo "[docker-entrypoint] boosterstate started (pid $!) on internal port $BOOSTERSTATE_SIDECAR_PORT"
else
  echo "[docker-entrypoint] boosterstate binary missing — sidecar unavailable (app has a built-in graceful fallback)"
fi

# ── Main app: same cluster entry Replit production uses ────────────────────
exec node dist/cluster.mjs
