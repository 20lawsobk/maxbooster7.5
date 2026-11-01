#!/usr/bin/env bash
# scripts/bench.sh — baseline latency benchmark for Max Booster
#
# Hits 5 representative endpoints 200× each using curl, then prints a
# latency report by reading P95/P99 from /api/ready.
#
# Usage:
#   ./scripts/bench.sh [BASE_URL]
#
# Examples:
#   ./scripts/bench.sh                          # hits http://localhost:5000
#   ./scripts/bench.sh https://my-app.replit.app

set -euo pipefail

BASE="${1:-http://localhost:5000}"
REPS=200

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
BLU='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLU}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLU}║   Max Booster — Latency Benchmark        ║${NC}"
echo -e "${BLU}║   Target: ${BASE}${NC}"
echo -e "${BLU}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Endpoints to benchmark ───────────────────────────────────────────────────
declare -A ENDPOINTS
ENDPOINTS["health"]="/api/health"
ENDPOINTS["ready"]="/api/ready"
ENDPOINTS["beats/listings"]="/api/marketplace/beats"
ENDPOINTS["auth/status"]="/api/auth/session"
ENDPOINTS["metrics"]="/api/metrics"

# ── Helper: hit an endpoint N times, collect raw durations (ms) ──────────────
bench_endpoint() {
  local label="$1"
  local path="$2"
  local url="${BASE}${path}"
  local times=()

  printf "  %-20s  %d requests ... " "$label" "$REPS"

  for (( i=0; i<REPS; i++ )); do
    ms=$(curl -s -o /dev/null \
      --max-time 10 \
      --connect-timeout 5 \
      -w "%{time_total}" \
      "$url" 2>/dev/null || echo "0")
    # curl returns seconds with decimals; convert to ms integer
    ms_int=$(awk "BEGIN { printf \"%d\", $ms * 1000 }")
    times+=("$ms_int")
  done

  # Sort and compute stats using awk
  sorted=$(printf '%s\n' "${times[@]}" | sort -n)
  stats=$(echo "$sorted" | awk -v n="$REPS" '
    BEGIN { sum=0; min=99999999; max=0 }
    {
      val=$1; sum+=val
      if(val<min) min=val
      if(val>max) max=val
      a[NR]=val
    }
    END {
      avg = sum/NR
      p95_idx = int(0.95*NR + 0.5); if(p95_idx<1) p95_idx=1
      p99_idx = int(0.99*NR + 0.5); if(p99_idx<1) p99_idx=1
      printf "min=%d avg=%d p95=%d p99=%d max=%d", min, int(avg), a[p95_idx], a[p99_idx], max
    }
  ')

  printf "done\n"

  # Parse and colour P95
  p95=$(echo "$stats" | grep -o 'p95=[0-9]*' | cut -d= -f2)
  avg=$(echo "$stats" | grep -o 'avg=[0-9]*' | cut -d= -f2)
  min=$(echo "$stats" | grep -o 'min=[0-9]*' | cut -d= -f2)
  max=$(echo "$stats" | grep -o 'max=[0-9]*' | cut -d= -f2)
  p99=$(echo "$stats" | grep -o 'p99=[0-9]*' | cut -d= -f2)

  if [ "$p95" -gt 2000 ]; then
    colour="$RED"
  elif [ "$p95" -gt 500 ]; then
    colour="$YLW"
  else
    colour="$GRN"
  fi

  printf "    ${NC}min=%-6s avg=%-6s ${colour}p95=%-6s p99=%-6s${NC} max=%s ms\n" \
    "${min}ms" "${avg}ms" "${p95}ms" "${p99}ms" "${max}ms"
}

echo -e "${YLW}── Per-endpoint curl benchmark (${REPS}× each) ──${NC}"
echo ""

for label in "${!ENDPOINTS[@]}"; do
  bench_endpoint "$label" "${ENDPOINTS[$label]}"
done

echo ""
echo -e "${YLW}── Platform-reported percentiles (/api/ready) ──${NC}"
echo ""

ready_json=$(curl -s --max-time 5 "${BASE}/api/ready" 2>/dev/null || echo '{}')

# Parse latency block from JSON (minimal awk — no jq dependency)
extract() {
  echo "$ready_json" | grep -o "\"$1\":[0-9]*" | cut -d: -f2 | head -1
}

avg_ms=$(extract avgMs)
p95_ms=$(extract p95Ms)
p99_ms=$(extract p99Ms)
min_ms=$(extract minMs)
max_ms=$(extract maxMs)
samples=$(extract samples)
status=$(echo "$ready_json"  | grep -o '"status":"[^"]*"' | cut -d: -f2 | tr -d '"' | head -1)

if [ -z "$p95_ms" ]; then
  echo -e "  ${RED}Could not parse /api/ready — server may be offline or latency block missing.${NC}"
else
  if [ "$p95_ms" -gt 2000 ]; then
    p_colour="$RED"
  elif [ "$p95_ms" -gt 500 ]; then
    p_colour="$YLW"
  else
    p_colour="$GRN"
  fi

  echo -e "  Platform status : $([ "$status" = "ok" ] && echo "${GRN}${status}${NC}" || echo "${YLW}${status}${NC}")"
  echo -e "  Sample window   : last 5 minutes  (${samples} samples)"
  echo -e "  min / avg       : ${min_ms}ms / ${avg_ms}ms"
  echo -e "  ${p_colour}P95 / P99       : ${p95_ms}ms / ${p99_ms}ms${NC}"
  echo -e "  max             : ${max_ms}ms"
fi

echo ""
echo -e "${BLU}Benchmark complete.${NC}"
echo ""
