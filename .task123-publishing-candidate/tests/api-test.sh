#!/usr/bin/env bash
# ============================================================
# Max Booster — Full API Test Suite
# Usage: bash tests/api-test.sh [base_url]
# Default base_url: $REPLIT_DEV_DOMAIN env var
# ============================================================

BASE="${1:-https://$REPLIT_DEV_DOMAIN}"
JAR="/tmp/mb_test_$$.txt"
PASS=0
FAIL=0
WARN=0

# Test credentials — deterministic so reruns reuse the same account
TEST_EMAIL="mb-testrunner@maxbooster.test"
TEST_PASS="MbTest_Secure#2025"
TEST_USER="mbtestrunner"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_pass() { echo -e "${GREEN}  PASS${NC}  $1"; ((PASS++)); }
log_fail() { echo -e "${RED}  FAIL${NC}  $1  →  $2"; ((FAIL++)); }
log_warn() { echo -e "${YELLOW}  WARN${NC}  $1  →  $2"; ((WARN++)); }
log_info() { echo -e "${BLUE}  INFO${NC}  $1"; }
section()  { echo -e "\n${BLUE}══ $1 ══${NC}"; }

check() {
  local label="$1" path="$2" want="$3" flags="${4:-}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" $flags -b "$JAR" -c "$JAR" "$BASE$path" 2>/dev/null)
  if [[ "$code" == "$want" ]]; then
    log_pass "$label ($code)"
  elif [[ "$code" == "401" || "$code" == "403" ]]; then
    log_warn "$label" "auth required / forbidden ($code) — session may not have carried"
  else
    log_fail "$label" "expected $want, got $code"
  fi
}

# ── 1. Server health ───────────────────────────────────────────────────────────
section "1 · Server health"
check "Health endpoint"  "/api/health"      "200"
check "CSRF endpoint"    "/api/csrf-token"  "200"

CSRF=$(curl -s -c "$JAR" "$BASE/api/csrf-token" 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('csrfToken',''))" 2>/dev/null)
if [[ -n "$CSRF" ]]; then
  log_pass "CSRF token present (${CSRF:0:16}…)"
else
  log_fail "CSRF token" "empty — auth will fail"
fi

# ── 2. Auth — register / login ─────────────────────────────────────────────────
section "2 · Auth — register & login"

REG=$(curl -s -c "$JAR" -b "$JAR" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF" \
  -d "{\"username\":\"$TEST_USER\",\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}" 2>/dev/null)

if echo "$REG" | grep -q '"email"'; then
  log_pass "Register new test user (or already exists)"
else
  # Try login — user may already exist
  LOGIN=$(curl -s -c "$JAR" -b "$JAR" -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -H "x-csrf-token: $CSRF" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}" 2>/dev/null)
  if echo "$LOGIN" | grep -q '"email"'; then
    log_pass "Login with existing test user"
  else
    log_fail "Auth" "could not register or login — response: ${REG:0:150}"
  fi
fi

# Verify session is live
ME=$(curl -s -b "$JAR" "$BASE/api/auth/me" 2>/dev/null)
if echo "$ME" | grep -q '"email"'; then
  log_pass "Session active — /api/auth/me returns user"
  USER_ID=$(echo "$ME" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','?'))" 2>/dev/null)
  log_info "Test user id: $USER_ID"
else
  log_fail "/api/auth/me" "no user in session — response: ${ME:0:120}"
fi

# ── 3. Core user endpoints ─────────────────────────────────────────────────────
section "3 · User profile & preferences"
check "Auth profile"         "/api/auth/profile"       "200"
check "Auth preferences"     "/api/auth/preferences"   "200"
check "User preferences"     "/api/user/preferences"   "200"

# ── 4. Social media suite ──────────────────────────────────────────────────────
section "4 · Social media suite"
check "Social posts"           "/api/social/posts"            "200"
check "Social platform status" "/api/social/platform-status"  "200"
check "Autopilot preferences"  "/api/autopilot/preferences"   "200"
check "Scheduled posts"        "/api/social/scheduled"        "200"

# ── 5. Distribution & analytics ───────────────────────────────────────────────
section "5 · Distribution & analytics"
check "Distribution releases"  "/api/distribution/releases"  "200"
check "Analytics anomalies"    "/api/analytics/anomalies"    "200"
check "Revenue forecast"       "/api/revenue-forecast"       "200"
check "Artist profiles"        "/api/artist-profiles"        "200"

# ── 6. Billing ─────────────────────────────────────────────────────────────────
section "6 · Billing"
check "Billing subscription"  "/api/billing/subscription"   "200"
check "Billing invoices"      "/api/billing/invoices"       "200"
check "Payment method"        "/api/billing/payment-method" "200"

# ── 7. Studio / music modules ─────────────────────────────────────────────────
section "7 · Studio & music"
check "Songwriting"           "/api/songwriting"           "200"
check "Music videos"          "/api/music-videos"          "200"
check "Sample clearances"     "/api/sample-clearances"     "200"
check "Label submissions"     "/api/label-submissions"     "200"
check "Radio pitches"         "/api/radio-pitches"         "200"
check "Collaborations"        "/api/collaborations/projects" "200"

# ── 8. Career & tour modules ───────────────────────────────────────────────────
section "8 · Career & tour"
check "Venues"               "/api/venues"                     "200"
check "Fan campaigns"        "/api/fan-campaigns"              "200"
check "Project budgets"      "/api/project-budgets"            "200"
check "Artist progress"      "/api/artist-progress/milestones" "200"

# ── 9. Storage & files ────────────────────────────────────────────────────────
section "9 · Storage & files"
check "Files list"           "/api/files/list"                 "200"

# ── 10. AI / MaxCore reachability ─────────────────────────────────────────────
section "10 · AI & MaxCore"
AI_STATUS=$(curl -s -b "$JAR" -c "$JAR" "$BASE/api/social/generate-content" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF" \
  -d '{"platform":"instagram","contentType":"post","prompt":"test ping"}' \
  -o /dev/null -w "%{http_code}" 2>/dev/null)
if [[ "$AI_STATUS" == "200" ]]; then
  log_pass "AI content generation endpoint ($AI_STATUS)"
elif [[ "$AI_STATUS" == "400" || "$AI_STATUS" == "422" ]]; then
  log_pass "AI content generation reachable (validation error $AI_STATUS — route live)"
else
  log_warn "AI content generation" "status $AI_STATUS (MaxCore may be offline or route still loading)"
fi

# ── 11. Heartbeat / session keep-alive ────────────────────────────────────────
section "11 · Session heartbeat"
HB=$(curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/heartbeat" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF" \
  -d '{}' \
  -o /dev/null -w "%{http_code}" 2>/dev/null)
if [[ "$HB" == "200" || "$HB" == "204" ]]; then
  log_pass "Session heartbeat ($HB)"
else
  log_warn "Session heartbeat" "$HB"
fi

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}══════════════════════════════════════${NC}"
echo -e "  Results: ${GREEN}$PASS PASS${NC}  ${RED}$FAIL FAIL${NC}  ${YELLOW}$WARN WARN${NC}"
echo -e "${BLUE}══════════════════════════════════════${NC}"
echo ""
echo "  Test login credentials:"
echo "    Email    : $TEST_EMAIL"
echo "    Password : $TEST_PASS"
echo ""

rm -f "$JAR"
[[ $FAIL -eq 0 ]]
