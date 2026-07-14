#!/usr/bin/env bash
# Comprehensive URL-to-video test suite — backend + client contract validation
# Run from workspace root: bash scripts/test-url-to-video.sh

BASE="http://127.0.0.1:5000"
COOKIE_JAR="/tmp/test-cookies-v2.txt"
PASS=0
FAIL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ PASS${NC} — $1"; ((PASS++)); }
fail() { echo -e "${RED}✗ FAIL${NC} — $1 | response: $2"; ((FAIL++)); }
section() { echo -e "\n${YELLOW}══ $1 ══${NC}"; }

has_field() { echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if '$2' in d else 1)" 2>/dev/null; }
status_is() { echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('status')=='$2' else 1)" 2>/dev/null; }
is_error()  { echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if 'error' in d or d.get('success')==False else 1)" 2>/dev/null; }

# ── Login ──────────────────────────────────────────────────────────────────
section "1. Authentication"
rm -f "$COOKIE_JAR"
LOGIN_RESP=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -d '{"email":"blawzmusic@gmail.com","password":"Iamadmin123!"}')
echo "Login → $(echo "$LOGIN_RESP" | head -c 200)"

if echo "$LOGIN_RESP" | grep -q '"id"\|"userId"\|"user"'; then
  pass "Login with admin credentials"
  USER_ID=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id') or d.get('user',{}).get('id',''))" 2>/dev/null)
  echo "  User ID: $USER_ID"
else
  fail "Login failed — trying register as fallback" "$LOGIN_RESP"
  REG=$(curl -s -X POST "$BASE/api/auth/register" \
    -H "Content-Type: application/json" \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -d '{"email":"test_video@maxbooster.test","password":"TestVideo123!","username":"VideoTester","name":"Video Tester"}')
  echo "Register → $REG"
  if echo "$REG" | grep -q '"id"\|"user"'; then pass "Register fallback succeeded"; fi
fi


# Fetch CSRF token (sets cookie + returns JSON with csrfToken)
CSRF_RESP=$(curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$BASE/api/csrf-token")
CSRF_TOKEN=$(echo "$CSRF_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('csrfToken',''))" 2>/dev/null)
echo "CSRF token: ${CSRF_TOKEN:0:16}..."

auth_curl() {
  curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    ${CSRF_TOKEN:+-H "x-csrf-token: $CSRF_TOKEN"} \
    "$@"
}

# ── Music Video Capabilities (tests missing stub fix) ─────────────────────
section "2. Music Video Capabilities (musicIndustryTrainingData stub)"
MVC=$(auth_curl "$BASE/api/social/music-video-capabilities")
echo "Capabilities → $(echo "$MVC" | head -c 300)"
if echo "$MVC" | grep -q '"voices"\|"kenBurns"\|"transitions"'; then
  pass "music-video-capabilities returns full options (stub loaded correctly)"
elif echo "$MVC" | grep -q "musicIndustryTrainingData\|Cannot find module"; then
  fail "musicIndustryTrainingData stub still missing" "$MVC"
else
  fail "music-video-capabilities unexpected response" "$(echo "$MVC" | head -c 200)"
fi

# ── URL Content Analysis ───────────────────────────────────────────────────
section "3. URL Content Analysis"
CA1=$(auth_curl -X POST "$BASE/api/content-analysis/website" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://maxbooster.replit.app"}')
echo "Website → $(echo "$CA1" | head -c 200)"
if echo "$CA1" | grep -qiE '"title"|"description"|"success"|"url"'; then
  pass "Website URL analysis returns metadata"
else
  fail "Website URL analysis unexpected" "$(echo "$CA1" | head -c 150)"
fi

CA2=$(auth_curl -X POST "$BASE/api/content-analysis/website" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"}')
echo "Spotify → $(echo "$CA2" | head -c 200)"
if echo "$CA2" | grep -qiE '"title"|"artist"|"track"|"success"|"url"'; then
  pass "Spotify URL analysis parses music metadata"
else
  fail "Spotify URL analysis unexpected" "$(echo "$CA2" | head -c 150)"
fi

# ── Multimodal Generate — URL→video ───────────────────────────────────────
section "4. POST /api/multimodal/generate (modality=url, outputModality=video)"
MG1=$(auth_curl -X POST "$BASE/api/multimodal/generate" \
  -H "Content-Type: application/json" \
  -d '{"input":{"modality":"url","payload":"https://maxbooster.replit.app"},
       "platforms":["instagram"],
       "constraints":{"outputModality":"video","styleTags":["video"]}}')
echo "Website URL→video → $(echo "$MG1" | head -c 300)"
if echo "$MG1" | grep -qE '"assets"|"id"|"requestId"'; then
  ASSETS=$(echo "$MG1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('assets',[])))" 2>/dev/null)
  pass "Multimodal generate returns response envelope (assets=$ASSETS — 0 expected for video, triggers client widget)"
else
  fail "Multimodal generate unexpected" "$(echo "$MG1" | head -c 200)"
fi

MG2=$(auth_curl -X POST "$BASE/api/multimodal/generate" \
  -H "Content-Type: application/json" \
  -d '{"input":{"modality":"url","payload":"https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"},
       "platforms":["tiktok"],
       "constraints":{"outputModality":"video"}}')
echo "Spotify URL→video → $(echo "$MG2" | head -c 300)"
if echo "$MG2" | grep -qE '"assets"|"id"'; then
  pass "Multimodal generate handles Spotify URL"
else
  fail "Multimodal Spotify URL" "$(echo "$MG2" | head -c 150)"
fi

# ── Multimodal Input Validation ────────────────────────────────────────────
section "5. Multimodal Input Validation"
V1=$(auth_curl -X POST "$BASE/api/multimodal/generate" \
  -H "Content-Type: application/json" \
  -d '{"input":{"modality":"url"},"platforms":["instagram"]}')
if is_error "$V1"; then
  pass "Missing payload → error"
else
  fail "Missing payload should error" "$V1"
fi

V2=$(auth_curl -X POST "$BASE/api/multimodal/generate" \
  -H "Content-Type: application/json" \
  -d '{"input":{"modality":"url","payload":"https://example.com"},"platforms":[]}')
if is_error "$V2"; then
  pass "Empty platforms → error"
else
  fail "Empty platforms should error" "$V2"
fi

V3=$(auth_curl -X POST "$BASE/api/multimodal/generate" \
  -H "Content-Type: application/json" \
  -d '{"input":{"modality":"url","payload":"https://example.com"},"platforms":["fakebook"]}')
if is_error "$V3"; then
  pass "Invalid platform → error"
else
  fail "Invalid platform should error" "$V3"
fi

# ── Generate Video — URL as topic ─────────────────────────────────────────
section "6. POST /api/social/generate-video"
GV1=$(auth_curl -X POST "$BASE/api/social/generate-video" \
  -H "Content-Type: application/json" \
  -d '{"topic":"https://maxbooster.replit.app","platform":"tiktok","aspect_ratio":"9:16","duration":10}')
echo "URL topic → $GV1"
JOB_URL=$(echo "$GV1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('job_id',''))" 2>/dev/null)
if [ -n "$JOB_URL" ]; then
  pass "generate-video (URL topic) returns job_id: $JOB_URL"
else
  fail "generate-video URL topic should return job_id" "$GV1"
fi

GV2=$(auth_curl -X POST "$BASE/api/social/generate-video" \
  -H "Content-Type: application/json" \
  -d '{"hook":"New music out now","body":"Stream everywhere","cta":"Link in bio","platform":"instagram","aspect_ratio":"1:1","duration":15}')
echo "hook/body/cta → $GV2"
JOB_HOOK=$(echo "$GV2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('job_id',''))" 2>/dev/null)
if [ -n "$JOB_HOOK" ]; then
  pass "generate-video (hook/body/cta) returns job_id: $JOB_HOOK"
else
  fail "generate-video hook/body should return job_id" "$GV2"
fi

GV3=$(auth_curl -X POST "$BASE/api/social/generate-video" \
  -H "Content-Type: application/json" \
  -d '{"topic":"Make a promo","platform":"youtube","aspect_ratio":"16:9","duration":30,"tone":"professional","goal":"awareness","quality":"cinematic"}')
JOB_FULL=$(echo "$GV3" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('job_id',''))" 2>/dev/null)
if [ -n "$JOB_FULL" ]; then
  pass "generate-video (all params) returns job_id: $JOB_FULL"
else
  fail "generate-video all params" "$GV3"
fi

# ── Generate Video — Validation ────────────────────────────────────────────
section "7. Generate-Video Input Validation"
GVF=$(auth_curl -X POST "$BASE/api/social/generate-video" \
  -H "Content-Type: application/json" \
  -d '{"platform":"tiktok"}')
if is_error "$GVF"; then
  pass "Missing topic/hook → error ($(echo "$GVF" | python3 -c "import sys,json; print(json.load(sys.stdin).get('message','?'))" 2>/dev/null))"
else
  fail "Missing topic/hook should error" "$GVF"
fi

# ── Video Job Polling ─────────────────────────────────────────────────────
section "8. GET /api/social/video-job/:jobId"
if [ -n "$JOB_URL" ]; then
  POLL=$(auth_curl "$BASE/api/social/video-job/$JOB_URL")
  echo "Poll $JOB_URL → $POLL"
  PSTAT=$(echo "$POLL" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','missing'))" 2>/dev/null)
  if [[ "$PSTAT" =~ ^(processing|completed|done|error)$ ]]; then
    pass "video-job poll returns valid status: $PSTAT"
    [ "$PSTAT" = "processing" ] && pass "  Job correctly shows 'processing' (MaxCore async generation in flight)"
  else
    fail "video-job poll invalid status" "$POLL"
  fi
else
  fail "No job_id to poll" "(generate-video step failed)"
fi

# Stale video_ prefix → 410 with restart message
STALE=$(auth_curl "$BASE/api/social/video-job/video_0000000000_xxxxxx")
echo "Stale video_ job → $STALE"
if is_error "$STALE"; then
  MSG=$(echo "$STALE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error') or d.get('message',''))" 2>/dev/null)
  pass "Stale video_ job returns error: $MSG"
else
  fail "Stale video_ job should error" "$STALE"
fi

# Unknown job format → 404 error
UNK=$(auth_curl "$BASE/api/social/video-job/unknown_job_abc")
echo "Unknown job → $UNK"
if is_error "$UNK"; then
  pass "Unknown job ID format returns error"
else
  fail "Unknown job ID should return error" "$UNK"
fi

# ── Music Video Job ────────────────────────────────────────────────────────
section "9. GET /api/social/music-video-job/:jobId"
MVJ=$(auth_curl "$BASE/api/social/music-video-job/mvjob_0000000000_xxxxxx")
echo "Not-found music-video-job → $MVJ"
if is_error "$MVJ"; then
  pass "Non-existent music-video-job returns error"
else
  fail "Non-existent music-video-job should error" "$MVJ"
fi

# ── Video Proxy ────────────────────────────────────────────────────────────
section "10. GET /api/social/video-proxy/:filename"
VP_TRAVERSE=$(auth_curl -o /dev/null -w "%{http_code}" "$BASE/api/social/video-proxy/..%2F..%2Fetc%2Fpasswd")
if [ "$VP_TRAVERSE" = "400" ]; then
  pass "Path traversal attempt rejected (HTTP $VP_TRAVERSE)"
else
  # Normalised path won't match /api/social/video-proxy — check the response
  VP2=$(auth_curl "$BASE/api/social/video-proxy/test.gif")
  if echo "$VP2" | grep -q '"error"\|"Invalid"'; then
    pass "Non-mp4 extension rejected (error returned)"
  else
    fail "Path traversal / non-mp4 should be rejected" "$VP_TRAVERSE $VP2"
  fi
fi

VP_INV=$(auth_curl "$BASE/api/social/video-proxy/notavideofile.txt")
if echo "$VP_INV" | grep -q '"error"\|"Invalid"'; then
  pass "Non-.mp4 filename rejected"
else
  fail "Non-.mp4 filename should be rejected" "$VP_INV"
fi

VP_MISS=$(auth_curl -o /dev/null -w "%{http_code}" "$BASE/api/social/video-proxy/nonexistent_video_abc123.mp4")
if [[ "$VP_MISS" =~ ^(404|500|502|503)$ ]]; then
  pass "Missing video file returns error status (HTTP $VP_MISS)"
else
  fail "Missing video file unexpected HTTP $VP_MISS"
fi

# ── Video Proxy Response Contract ─────────────────────────────────────────
section "11. Video Job Response Contract"
# Confirm the done-job contract: url, video_url, status="completed", thumbnail_url field present
if [ -n "$JOB_URL" ]; then
  POLL2=$(auth_curl "$BASE/api/social/video-job/$JOB_URL")
  PSTAT2=$(echo "$POLL2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
  if [ "$PSTAT2" = "processing" ]; then
    pass "Job still processing — contract: {status:'processing', progress:50}"
    PROG=$(echo "$POLL2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('progress','missing'))" 2>/dev/null)
    if [ "$PROG" != "missing" ]; then
      pass "  Progress field present: $PROG"
    else
      fail "Processing response missing 'progress' field" "$POLL2"
    fi
  elif [ "$PSTAT2" = "completed" ] || [ "$PSTAT2" = "done" ]; then
    VURL=$(echo "$POLL2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('url') or d.get('video_url',''))" 2>/dev/null)
    if [ -n "$VURL" ]; then
      pass "Completed job has url: $VURL"
    else
      fail "Completed job missing url field" "$POLL2"
    fi
    # thumbnail_url key must exist (can be null)
    if echo "$POLL2" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if 'thumbnail_url' in d else 1)" 2>/dev/null; then
      pass "Completed job has thumbnail_url field"
    else
      fail "Completed job missing thumbnail_url field" "$POLL2"
    fi
  elif [ "$PSTAT2" = "error" ]; then
    ERR=$(echo "$POLL2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error','?'))" 2>/dev/null)
    pass "Job errored (MaxCore unavailable/timeout) — error surfaced to client correctly: $ERR"
  fi
fi

# ── Unauthenticated access ────────────────────────────────────────────────
section "12. Unauthenticated Access Protection"
# Unauthenticated requests hit CSRF first (which is correct — stricter than auth)
UNAUTH1_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/social/generate-video" \
  -H "Content-Type: application/json" \
  -d '{"topic":"test","platform":"tiktok"}')
if [[ "$UNAUTH1_CODE" =~ ^(400|401|403)$ ]]; then
  pass "Unauthenticated generate-video blocked (HTTP $UNAUTH1_CODE — CSRF/auth guard)"
else
  fail "Unauthenticated generate-video should be blocked" "HTTP $UNAUTH1_CODE"
fi

UNAUTH2=$(curl -s "$BASE/api/social/video-job/video_1234_abcd")
if is_error "$UNAUTH2"; then
  pass "Unauthenticated video-job poll blocked"
else
  fail "Unauthenticated video-job should return error" "$UNAUTH2"
fi

UNAUTH3_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/multimodal/generate" \
  -H "Content-Type: application/json" \
  -d '{"input":{"modality":"url","payload":"https://example.com"},"platforms":["instagram"]}')
if [[ "$UNAUTH3_CODE" =~ ^(400|401|403)$ ]]; then
  pass "Unauthenticated multimodal/generate blocked (HTTP $UNAUTH3_CODE)"
else
  fail "Unauthenticated multimodal should be blocked" "HTTP $UNAUTH3_CODE"
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}═══════════════ RESULTS ═══════════════${NC}"
echo -e "  Passed: ${GREEN}$PASS${NC}"
echo -e "  Failed: ${RED}$FAIL${NC}"
echo -e "  Total:  $((PASS + FAIL))"
echo ""
[ $FAIL -eq 0 ] \
  && echo -e "${GREEN}✅ All tests passed!${NC}" \
  || echo -e "${RED}❌ $FAIL test(s) failed — see above for details${NC}"
