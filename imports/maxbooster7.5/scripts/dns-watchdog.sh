#!/usr/bin/env bash
# Max Booster — DNS Health Watchdog v2
#
# Monitors ns1 (5353), ns2 (5354), ns3 (5355) every 30 seconds.
# Also checks health HTTP endpoints on ns2 (5381) and ns3 (5382).
# Logs alerts after configurable consecutive failure threshold.
#
# Runs as a persistent Replit workflow ("DNS Health Watchdog").

set -uo pipefail

APP_URL="${APP_URL:-http://localhost:5000}"
NS1_PORT="${NS1_PORT:-5353}"
NS2_PORT="${NS2_PORT:-5354}"
NS3_PORT="${NS3_PORT:-5355}"
NS2_HEALTH="${NS2_HEALTH:-5381}"
NS3_HEALTH="${NS3_HEALTH:-5382}"
CHECK_INTERVAL="${CHECK_INTERVAL:-30}"
MAX_FAILURES=3

declare -A failures=(["ns1"]=0 ["ns2"]=0 ["ns3"]=0)

log() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [watchdog] $*"
}

probe_dns() {
  local port="$1"
  python3 - <<PYEOF 2>/dev/null
import socket, struct, sys
query = (
    b'\xab\xcd\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00'
    b'\x0bmax-booster\x03com\x00\x00\x01\x00\x01'
)
try:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(3)
    sock.sendto(query, ('127.0.0.1', $port))
    data, _ = sock.recvfrom(512)
    sys.exit(0 if len(data) >= 12 else 1)
except Exception:
    sys.exit(1)
PYEOF
}

probe_health() {
  local port="$1"
  curl -sf --max-time 5 "http://localhost:${port}/health" > /dev/null 2>&1
}

probe_app() {
  curl -sf --max-time 5 "${APP_URL}/api/dns/health" > /dev/null 2>&1
}

check_node() {
  local name="$1" port="$2"
  if probe_dns "$port"; then
    failures[$name]=0
    echo "UP"
  else
    failures[$name]=$((${failures[$name]} + 1))
    local fc=${failures[$name]}
    log "ALERT ${name} DNS not responding — ${fc}/${MAX_FAILURES} consecutive failures"
    echo "DOWN(${fc})"
  fi
}

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "DNS Health Watchdog v2 starting"
log "  ns1 → :${NS1_PORT}   ns2 → :${NS2_PORT}   ns3 → :${NS3_PORT}"
log "  ns2-health → :${NS2_HEALTH}   ns3-health → :${NS3_HEALTH}"
log "  app → ${APP_URL}/api/dns/health"
log "  interval=${CHECK_INTERVAL}s  max_failures=${MAX_FAILURES}"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cycle=0
while true; do
  cycle=$((cycle + 1))

  ns1_s=$(check_node "ns1" "$NS1_PORT")
  ns2_s=$(check_node "ns2" "$NS2_PORT")
  ns3_s=$(check_node "ns3" "$NS3_PORT")

  # Health API checks
  ns2_h=$(probe_health "$NS2_HEALTH" && echo "HTTP-UP" || echo "HTTP-DOWN")
  ns3_h=$(probe_health "$NS3_HEALTH" && echo "HTTP-UP" || echo "HTTP-DOWN")
  app_h=$(probe_app               && echo "HTTP-UP" || echo "HTTP-DOWN")

  # Fetch query counts from health APIs
  ns2_q=$(curl -sf --max-time 3 "http://localhost:${NS2_HEALTH}/health" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('queries',0))" 2>/dev/null || echo "?")
  ns3_q=$(curl -sf --max-time 3 "http://localhost:${NS3_HEALTH}/health" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('queries',0))" 2>/dev/null || echo "?")

  # Status report every 5 cycles (2.5 min) or on any DNS failure
  if (( cycle % 5 == 0 )) || [[ "$ns1_s" == DOWN* ]] || [[ "$ns2_s" == DOWN* ]] || [[ "$ns3_s" == DOWN* ]]; then
    log "Status — ns1=${ns1_s} ns2=${ns2_s}(${ns2_h},q=${ns2_q}) ns3=${ns3_s}(${ns3_h},q=${ns3_q}) app=${app_h}"
  fi

  # Critical: at least 2 of 3 nodes must be up
  down_count=0
  [[ "$ns1_s" == DOWN* ]] && down_count=$((down_count + 1))
  [[ "$ns2_s" == DOWN* ]] && down_count=$((down_count + 1))
  [[ "$ns3_s" == DOWN* ]] && down_count=$((down_count + 1))

  if (( down_count >= 2 )); then
    log "🚨 CRITICAL: ${down_count}/3 nameservers are DOWN! DNS service degraded."
  fi

  if (( down_count == 3 )); then
    log "🚨 TOTAL OUTAGE: All 3 nameservers are DOWN! Manual intervention required."
  fi

  sleep "${CHECK_INTERVAL}"
done
