#!/bin/bash
#
# MAX BOOSTER — PRODUCTION START SCRIPT
#
# Starts all required services for the Max Booster platform:
#   1. MaxCore Diffusion v4 LITE (port 8008) — training time simulator + memory sync
#   2. Max Booster main server (port 5000) — primary application
#
# Run modes:
#   Built   (dist/index.js present) → `node dist/index.js`  (fast, no TS overhead)
#   Fallback (no dist)              → `tsx server/index.ts`  (dev / first-boot)
#
# Storage: All persistence routes through the Pocket Dimension (PDIM) system.
# AI:      MaxCore (https://secure-ai-forge.replit.app) is the sole content
#          generation source — the diffusion relay on port 8008 enriches prompts
#          before forwarding them to MaxCore.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║         MAX BOOSTER — PRODUCTION STARTUP                   ║"
echo "║         Storage: Pocket Dimension (PDIM)                   ║"
echo "║         AI:      MaxCore (secure-ai-forge.replit.app)      ║"
echo "╚════════════════════════════════════════════════════════════╝"

# ── Step 1: Start MaxCore Diffusion relay on port 8008 ──────────────────────
echo ""
echo "🎬 Starting MaxCore Diffusion v4 LITE relay (port 8008)..."
cd "$PROJECT_ROOT"
bash server/services/diffusion/start_api.sh &
DIFFUSION_PID=$!
echo "   PID: $DIFFUSION_PID"

# Give the Python server a few seconds to bind
sleep 3

# ── Step 2: Start the main Max Booster Node.js server ───────────────────────
echo ""
if [ -f "$PROJECT_ROOT/dist/index.js" ]; then
  echo "🚀 Starting Max Booster (compiled — node dist/index.js)..."
  exec node "$PROJECT_ROOT/dist/index.js"
else
  echo "🚀 Starting Max Booster (source — tsx server/index.ts)..."
  exec ./node_modules/.bin/tsx server/index.ts
fi
