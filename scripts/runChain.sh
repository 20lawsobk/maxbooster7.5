#!/bin/bash
# runChain.sh - fires 8 beat cycles sequentially after any current cycle finishes

LOG="/tmp/beat_chain.log"
API="http://localhost:5000/api/dev/trigger-beat"

log() { echo "[$(date '+%H:%M:%S')] $*" >> "$LOG"; }

db_status() {
  node -e "
const {neon}=require('@neondatabase/serverless');
const s=neon(process.env.NEON_DATABASE_URL);
s\`SELECT status FROM beat_money_loop_cycles ORDER BY started_at DESC LIMIT 1\`
  .then(r=>process.stdout.write(r[0]?.status||'unknown'))
  .catch(()=>process.stdout.write('error'));
" 2>/dev/null
}

wait_done() {
  local w=0
  while [ $w -lt 1800 ]; do
    local ST
    ST=$(db_status)
    if [ "$ST" = "listed" ] || [ "$ST" = "completed" ] || [ "$ST" = "failed" ]; then
      log "  Cycle done — status=$ST"
      return 0
    fi
    if [ $((w % 60)) -eq 0 ]; then
      log "  Waiting... (${w}s elapsed, status=$ST)"
    fi
    sleep 10
    w=$((w + 10))
  done
  log "  Timeout waiting for cycle"
  return 0
}

GENRES=(
  '{"genre":"drill","mood":"aggressive","key":"C# Minor"}'
  '{"genre":"hiphop","mood":"empowering","key":"G Minor"}'
  '{"genre":"r&b","mood":"melancholic","key":"Eb Minor"}'
  '{"genre":"pop","mood":"energetic","key":"C Major"}'
  '{"genre":"electronic","mood":"euphoric","key":"D Minor"}'
  '{"genre":"dancehall","mood":"energetic","key":"A Major"}'
  '{"genre":"lofi","mood":"chill","key":"F Major"}'
  '{"genre":"afrobeats","mood":"euphoric","key":"E Minor"}'
)

log "=== Chain starting ($(date)) ==="

# Wait for any in-progress cycle first
CUR=$(db_status)
if [ "$CUR" = "generating" ] || [ "$CUR" = "producing" ]; then
  log "Active cycle detected (status=$CUR) — waiting for it to finish..."
  wait_done
fi

# Count how many cycles already exist (including the manually-fired drill one)
DONE_COUNT=$(node -e "
const {neon}=require('@neondatabase/serverless');
const s=neon(process.env.NEON_DATABASE_URL);
s\`SELECT count(*) as n FROM beat_money_loop_cycles\`
  .then(r=>process.stdout.write(String(r[0]?.n||0)))
  .catch(()=>process.stdout.write('0'));
" 2>/dev/null)

# Each previous finished/failed cycle corresponds to 1 genre used.
# Baseline: 1 cycle pre-dates this chain (trap x dark), plus any we fired
# Start from index = DONE_COUNT - 1 (the trap cycle was index -1, drill was index 0)
START_IDX=$(( DONE_COUNT - 2 ))
if [ $START_IDX -lt 0 ]; then START_IDX=0; fi
if [ $START_IDX -ge ${#GENRES[@]} ]; then
  log "=== All ${#GENRES[@]} genres already fired — done ==="
  exit 0
fi

log "Resuming from genre index $START_IDX of ${#GENRES[@]} (${DONE_COUNT} total cycles in DB)"

for (( i=START_IDX; i<${#GENRES[@]}; i++ )); do
  G="${GENRES[$i]}"
  log ">>> Firing genre $((i+1))/${#GENRES[@]}: $G"
  R=$(curl -s --max-time 10 -X POST "$API" \
    -H "Content-Type: application/json" \
    -d "$G" 2>/dev/null || echo '{"error":"curl failed"}')
  log "    Response: $R"
  sleep 8
  wait_done
  sleep 5
done

log "=== ALL ${#GENRES[@]} BEAT CYCLES COMPLETE ($(date)) ==="
