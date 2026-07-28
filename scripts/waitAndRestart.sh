#!/bin/bash
# waitAndRestart.sh — waits for the current beat cycle to finish,
# then kills and restarts the dev server so the PDIM timeout fix loads
# BEFORE the next beat cycle fires.
#
# The beat chain waits 5s after a status change before firing the next cycle.
# A typical server restart takes 1-3s, so this races to restart within the gap.

set -euo pipefail
LOG="/tmp/restart_watcher.log"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

log "Watcher started — waiting for beat cycle to exit generating status"

max_wait=900
waited=0
while (( waited < max_wait )); do
  STATUS=$(node -e "
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.NEON_DATABASE_URL);
sql\`SELECT status FROM beat_money_loop_cycles ORDER BY started_at DESC LIMIT 1\`
  .then(r => process.stdout.write(r[0]?.status || 'unknown'))
  .catch(() => process.stdout.write('error'));
" 2>/dev/null)
  
  if [[ "$STATUS" != "generating" && "$STATUS" != "unknown" && "$STATUS" != "error" ]]; then
    log "✅ Beat cycle exited: status=$STATUS — restarting server NOW"
    # Kill the current server process and let the workflow restart it
    pkill -f "node.*tsx.*server" 2>/dev/null || true
    pkill -f "node.*esbuild.*server" 2>/dev/null || true
    pkill -f "tsx watch" 2>/dev/null || true
    kill $(lsof -ti:5000 2>/dev/null | head -1) 2>/dev/null || true
    log "Server kill signal sent. Waiting 3s for restart..."
    sleep 3
    log "Done — PDIM fixes should now be active"
    exit 0
  fi
  
  sleep 5
  waited=$((waited + 5))
done

log "TIMEOUT: beat cycle never exited generating status after ${max_wait}s"
exit 1
