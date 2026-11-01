#!/usr/bin/env bash
# Bootstrap the imported MaxCore workspace (external/maxcore) so the local
# supervisor can spawn it from a clean checkout. Idempotent and fast when
# everything is already installed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAXCORE="$ROOT/external/maxcore"
API_SERVER="$MAXCORE/artifacts/api-server"
PY_SERVER="$MAXCORE/artifacts/ai-training-server"

if [ ! -d "$MAXCORE" ]; then
  echo "[bootstrap-maxcore] external/maxcore not present — nothing to do" >&2
  exit 1
fi

# 1. Node workspace deps (pnpm workspace; installs per-package node_modules)
if [ ! -x "$API_SERVER/node_modules/.bin/tsx" ]; then
  echo "[bootstrap-maxcore] Installing MaxCore Node workspace (pnpm install)…"
  (cd "$MAXCORE" && pnpm install --prefer-offline)
else
  echo "[bootstrap-maxcore] Node workspace already installed"
fi

# 2. Python deps for the AI training server (installs into the shared venv)
if ! python3 -c "import fastapi, uvicorn" >/dev/null 2>&1; then
  echo "[bootstrap-maxcore] Installing MaxCore Python deps (uv sync)…"
  (cd "$PY_SERVER" && uv sync)
else
  echo "[bootstrap-maxcore] Python deps already installed"
fi

echo "[bootstrap-maxcore] Done"
