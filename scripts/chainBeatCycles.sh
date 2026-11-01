#!/bin/bash
# chainBeatCycles.sh — fires beat cycles sequentially, each starting only after
# the previous one completes (success or failure).
# Run detached: nohup bash scripts/chainBeatCycles.sh >> /tmp/beat_chain.log 2>&1 &

set -euo pipefail
LOG="/tmp/beat_chain.log"
API="http://localhost:5000/api/dev/trigger-beat"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# Remaining targets after the already-running trap × dark
TARGETS=(
  '{"genre":"drill","mood":"aggressive","key":"C# Minor"}'
  '{"genre":"hiphop","mood":"empowering","key":"G Minor"}'
  '{"genre":"r&b","mood":"melancholic","key":"Eb Minor"}'
  '{"genre":"pop","mood":"energetic","key":"C Major"}'
  '{"genre":"electronic","mood":"euphoric","key":"D Minor"}'
  '{"genre":"dancehall","mood":"energetic","key":"A Major"}'
  '{"genre":"lofi","mood":"chill","key":"F Major"}'
  '{"genre":"afrobeats","mood":"euphoric","key":"E Minor"}'
)

wait_for_cycle_complete() {
  local max_wait=1500  # 25 min max per cycle
  local waited=0
  while (( waited < max_wait )); do
    STATUS=$(node -e "
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.NEON_DATABASE_URL);
sql\`SELECT status FROM beat_money_loop_cycles ORDER BY started_at DESC LIMIT 1\`
  .then(r => process.stdout.write(r[0]?.status || 'unknown'))
  .catch(() => process.stdout.write('error'));
" 2>/dev/null)
    if [[ "$STATUS" == "listed" || "$STATUS" == "completed" || "$STATUS" == "failed" ]]; then
      log "  Cycle done — status=$STATUS"
      return 0
    fi
    if (( waited % 60 == 0 )); then
      log "  Waiting for cycle… (${waited}s elapsed, status=$STATUS)"
    fi
    sleep 10
    waited=$((waited + 10))
  done
  log "  TIMEOUT waiting for cycle"
  return 1
}

fire_cycle() {
  local payload="$1"
  log "▶ Firing cycle: $payload"
  local resp
  resp=$(curl -s -X POST "$API" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>/dev/null)
  log "  Response: $resp"
}

log "🔗 Beat chain resumed — ${#TARGETS[@]} genres remaining (trap×dark already running)"
log "   Waiting for current trap × dark cycle to complete..."

# Wait for the currently-running trap × dark cycle to finish first
wait_for_cycle_complete || { log "ERROR: first wait timed out"; }

# Small gap between cycles
sleep 5

for target in "${TARGETS[@]}"; do
  fire_cycle "$target"
  sleep 5  # brief gap before polling
  wait_for_cycle_complete || { log "ERROR: cycle timed out, continuing to next"; }
  sleep 5
done

log "═══ ALL CYCLES DONE ═══"
