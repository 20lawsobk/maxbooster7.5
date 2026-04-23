#!/usr/bin/env bash
# Max Booster — DNS Health Watchdog
#
# Monitors ns1 (port 5353) and ns2 (port 5354) every 30 seconds.
# If either nameserver stops responding it logs an alert and attempts
# to wake the process via the main app's health API.
#
# Runs as a persistent Replit workflow ("DNS Health Watchdog").

set -uo pipefail

APP_URL="${APP_URL:-http://localhost:5000}"
NS1_PORT="${NS1_PORT:-5353}"
NS2_PORT="${NS2_PORT:-5354}"
CHECK_INTERVAL="${CHECK_INTERVAL:-30}"

ns1_failures=0
ns2_failures=0
MAX_FAILURES=3

log() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [watchdog] $*"
}

# Send a minimal DNS query (A record for "health.max-booster.com") using nc/bash TCP.
# Returns 0 if a DNS response arrives within 3 seconds, 1 otherwise.
probe_dns() {
  local port="$1"
  # Build a raw DNS query: header (ID=0xABCD, QR+RD, 1 question) + qname + qtype A + qclass IN
  # Using Python for reliable binary send/recv in bash environment
  python3 - <<PYEOF 2>/dev/null
import socket, struct, sys
query = (
    b'\xab\xcd'   # ID
    b'\x01\x00'   # flags: recursion desired
    b'\x00\x01'   # QDCOUNT=1
    b'\x00\x00'   # ANCOUNT=0
    b'\x00\x00'   # NSCOUNT=0
    b'\x00\x00'   # ARCOUNT=0
    b'\x06health'
    b'\x0bmax-booster'
    b'\x03com\x00'
    b'\x00\x01'   # QTYPE=A
    b'\x00\x01'   # QCLASS=IN
)
try:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(3)
    sock.sendto(query, ('127.0.0.1', $port))
    data, _ = sock.recvfrom(512)
    # Any response (even NXDOMAIN rcode=3) means server is alive
    sys.exit(0 if len(data) >= 12 else 1)
except Exception:
    sys.exit(1)
PYEOF
}

# Also check the HTTP health endpoint
probe_http() {
  curl -sf --max-time 5 "${APP_URL}/api/dns/health" > /dev/null 2>&1
}

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "DNS Health Watchdog starting"
log "  ns1 → 127.0.0.1:${NS1_PORT}"
log "  ns2 → 127.0.0.1:${NS2_PORT}"
log "  HTTP → ${APP_URL}/api/dns/health"
log "  interval=${CHECK_INTERVAL}s  max_failures=${MAX_FAILURES}"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cycle=0
while true; do
  cycle=$((cycle + 1))

  # ── ns1 probe ─────────────────────────────────────────────────────────────
  if probe_dns "${NS1_PORT}"; then
    ns1_failures=0
    ns1_status="✅ UP"
  else
    ns1_failures=$((ns1_failures + 1))
    ns1_status="❌ DOWN (fail ${ns1_failures}/${MAX_FAILURES})"
    log "ALERT ns1 not responding — ${ns1_failures}/${MAX_FAILURES} consecutive failures"
  fi

  # ── ns2 probe ─────────────────────────────────────────────────────────────
  if probe_dns "${NS2_PORT}"; then
    ns2_failures=0
    ns2_status="✅ UP"
  else
    ns2_failures=$((ns2_failures + 1))
    ns2_status="❌ DOWN (fail ${ns2_failures}/${MAX_FAILURES})"
    log "ALERT ns2 not responding — ${ns2_failures}/${MAX_FAILURES} consecutive failures"
  fi

  # ── HTTP probe ─────────────────────────────────────────────────────────────
  if probe_http; then
    http_status="✅ UP"
    # Fetch query count from health endpoint
    health_json=$(curl -sf --max-time 5 "${APP_URL}/api/dns/health" 2>/dev/null || echo '{}')
    query_count=$(echo "$health_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('queryCount',0))" 2>/dev/null || echo "?")
  else
    http_status="❌ DOWN"
    query_count="?"
  fi

  # ── Status report every 10 cycles (5 min) or on any failure ───────────────
  if (( cycle % 10 == 0 )) || (( ns1_failures > 0 )) || (( ns2_failures > 0 )); then
    log "Status — ns1=${ns1_status}  ns2=${ns2_status}  http=${http_status}  queries=${query_count}"
  fi

  # ── Critical alert if both nameservers are down ────────────────────────────
  if (( ns1_failures >= MAX_FAILURES )) && (( ns2_failures >= MAX_FAILURES )); then
    log "🚨 CRITICAL: Both ns1 AND ns2 have failed ${MAX_FAILURES}+ consecutive checks!"
    log "   Manual intervention required. Check Replit workflow console for errors."
  fi

  sleep "${CHECK_INTERVAL}"
done
