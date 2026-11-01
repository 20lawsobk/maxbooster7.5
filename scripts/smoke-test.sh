#!/usr/bin/env bash
# scripts/smoke-test.sh — post-deploy readiness smoke test for Max Booster
#
# Hits /api/ready, /api/health/ready, and two unauthenticated public endpoints.
# Exits 0 only when all checks pass.  Designed to run after a deploy; the
# CI/CD pipeline should call it before marking the deployment "healthy".
#
# Usage:
#   ./scripts/smoke-test.sh [BASE_URL]
#
# Examples:
#   ./scripts/smoke-test.sh                             # localhost:5000
#   ./scripts/smoke-test.sh https://my-app.replit.app

set -euo pipefail

BASE="${1:-http://localhost:5000}"
TIMEOUT=15   # seconds per request
RETRIES=3    # attempts before declaring a check failed
DELAY=3      # seconds between retries

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

pass() { echo -e "  ${GRN}✓${NC}  $1"; PASS=$((PASS+1)); }
fail() { echo -e "  ${RED}✗${NC}  $1"; FAIL=$((FAIL+1)); }
info() { echo -e "  ${YLW}→${NC}  $1"; }

# ── Helper: HTTP GET with retry ───────────────────────────────────────────────
check_get() {
  local label="$1"
  local path="$2"
  local expect_status="${3:-200}"
  local url="${BASE}${path}"

  for attempt in $(seq 1 $RETRIES); do
    http_code=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" \
      --max-time "$TIMEOUT" --connect-timeout 5 "$url" 2>/dev/null || echo "000")

    if [ "$http_code" = "$expect_status" ]; then
      pass "${label} → HTTP ${http_code}"
      return 0
    fi

    if [ "$attempt" -lt "$RETRIES" ]; then
      info "  attempt ${attempt}/${RETRIES} got HTTP ${http_code} — retrying in ${DELAY}s"
      sleep "$DELAY"
    fi
  done

  local body=""
  body=$(cat /tmp/smoke_body.txt 2>/dev/null | head -c 200 || true)
  fail "${label} → HTTP ${http_code} (expected ${expect_status}) — ${body}"
  return 1
}

# ── Helper: JSON field check ──────────────────────────────────────────────────
check_json_field() {
  local label="$1"
  local path="$2"
  local field="$3"           # e.g. '"status"'
  local url="${BASE}${path}"

  body=$(curl -s --max-time "$TIMEOUT" --connect-timeout 5 "$url" 2>/dev/null || echo "{}")
  if echo "$body" | grep -q "\"${field}\""; then
    pass "${label} — response contains '${field}'"
  else
    fail "${label} — response missing '${field}': $(echo "$body" | head -c 200)"
  fi
}

# ── Helper: ensure status is not "down" ──────────────────────────────────────
check_not_down() {
  local label="$1"
  local path="$2"
  local url="${BASE}${path}"

  body=$(curl -s --max-time "$TIMEOUT" --connect-timeout 5 "$url" 2>/dev/null || echo '{"status":"down"}')
  status=$(echo "$body" | grep -o '"status":"[^"]*"' | cut -d: -f2 | tr -d '"' | head -1)
  if [ "$status" = "down" ]; then
    fail "${label} — status=down"
  else
    pass "${label} — status=${status:-unknown}"
  fi
}

echo ""
echo -e "${YLW}═══════════════════════════════════════════════${NC}"
echo -e "${YLW}  Max Booster — Smoke Test${NC}"
echo -e "${YLW}  Target: ${BASE}${NC}"
echo -e "${YLW}═══════════════════════════════════════════════${NC}"
echo ""

# ── 1. Liveness probe ─────────────────────────────────────────────────────────
echo "1. Liveness"
check_get "GET /api/health" "/api/health" "200"

# ── 2. Readiness probes (k8s + custom) ───────────────────────────────────────
echo ""
echo "2. Readiness"
check_not_down   "GET /api/ready"           "/api/ready"
check_not_down   "GET /api/health/ready"    "/api/health/ready"
check_json_field "GET /api/ready — latency" "/api/ready" "latency"

# ── 3. Public API endpoints ───────────────────────────────────────────────────
echo ""
echo "3. Public API"
# Marketplace beat listings — should return 200 (public)
check_get "GET /api/marketplace/beats" "/api/marketplace/beats" "200"
# Auth /me — returns 200 with null body when unauthenticated
check_get "GET /api/auth/me"            "/api/auth/me"           "200"

# ── 4. Authenticated endpoints — expect 401, not 500 ─────────────────────────
echo ""
echo "4. Auth-gated endpoints (expect 401, not 500)"
check_get "GET /api/admin/beat-money-loop/status" "/api/admin/beat-money-loop/status" "401"
check_get "GET /api/admin/users"                  "/api/admin/users"                  "401"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${YLW}═══════════════════════════════════════════════${NC}"
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GRN}  ✅ All ${PASS} checks passed${NC}"
  echo -e "${YLW}═══════════════════════════════════════════════${NC}"
  echo ""
  exit 0
else
  echo -e "${RED}  ❌ ${FAIL} check(s) failed  (${PASS} passed)${NC}"
  echo -e "${YLW}═══════════════════════════════════════════════${NC}"
  echo ""
  exit 1
fi
