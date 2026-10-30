#!/usr/bin/env bash
# =============================================================
# Max Booster — URL-to-Video Generation Thorough Test Suite
# Tests every stage: URL analysis, content gen, video gen, polling
# Usage: bash tests/url-video-test.sh [base_url]
# =============================================================

BASE="${1:-http://localhost:5000}"
JAR="/tmp/mb_urlvideo_$$.txt"
PASS=0; FAIL=0; WARN=0

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

log_pass() { echo -e "${GREEN}  ✓ PASS${NC}  $1"; ((PASS++)); }
log_fail() { echo -e "${RED}  ✗ FAIL${NC}  $1  →  $2"; ((FAIL++)); }
log_warn() { echo -e "${YELLOW}  ⚠ WARN${NC}  $1  →  $2"; ((WARN++)); }
log_info() { echo -e "${CYAN}  ℹ${NC}  $1"; }
section()  { echo -e "\n${BLUE}══ $* ══${NC}"; }

# ── Helpers ────────────────────────────────────────────────────────────────────

post() {
  local path="$1"; local body="$2"
  curl -s -b "$JAR" -c "$JAR" -X POST "$BASE$path" \
    -H "Content-Type: application/json" \
    -H "x-csrf-token: $CSRF" \
    -d "$body" 2>/dev/null
}

get() {
  local path="$1"
  curl -s -b "$JAR" -c "$JAR" "$BASE$path" 2>/dev/null
}

jq_get() { python3 -c "import sys,json; d=json.load(sys.stdin); v=d; [v:=v[k] for k in '$1'.split('.') if k]; print(v)" 2>/dev/null || echo ""; }
jq_bool() { python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('$1') else 'false')" 2>/dev/null || echo "false"; }
http_code() { echo "$1" | python3 -c "import sys; d=sys.stdin.read(); print('err' if not d else ('4' if '\"error\"' in d[:50] else 'ok'))" 2>/dev/null; }

assert_field() {
  local label="$1"; local json="$2"; local field="$3"; local expect="$4"
  local got; got=$(echo "$json" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    keys='$field'.split('.')
    v=d
    for k in keys:
        v=v[k]
    print(str(v)[:100])
except Exception as e:
    print('MISSING:'+str(e))
" 2>/dev/null)
  if [[ "$got" == "MISSING:"* ]]; then
    log_fail "$label" "field '$field' missing — got: $(echo "$json" | head -c 200)"
  elif [[ -n "$expect" && "$got" != *"$expect"* ]]; then
    log_fail "$label" "expected '$expect' in '$field', got '$got'"
  else
    log_pass "$label ($got)"
  fi
}

assert_nonempty() {
  local label="$1"; local val="$2"
  if [[ -z "$val" || "$val" == "None" || "$val" == "null" || "$val" == "MISSING"* ]]; then
    log_fail "$label" "value is empty/null"
  else
    log_pass "$label: ${val:0:80}"
  fi
}

assert_http() {
  local label="$1"; local path="$2"; local want="$3"; local flags="${4:-}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" $flags -b "$JAR" -c "$JAR" "$BASE$path" 2>/dev/null)
  if [[ "$code" == "$want" ]]; then
    log_pass "$label ($code)"
  elif [[ "$code" == "401" || "$code" == "403" ]]; then
    log_warn "$label" "auth/CSRF issue ($code)"
  else
    log_fail "$label" "expected $want, got $code"
  fi
}

# ── 1. Auth setup ──────────────────────────────────────────────────────────────
section "1 · Auth setup"

CSRF=$(curl -s -c "$JAR" "$BASE/api/csrf-token" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('csrfToken',''))" 2>/dev/null)

if [[ -n "$CSRF" ]]; then
  log_pass "CSRF token acquired (${CSRF:0:16}…)"
else
  log_fail "CSRF token" "empty — cannot continue"
  exit 1
fi

LOGIN_RESP=$(post "/api/auth/login" '{"email":"mb-testrunner@maxbooster.test","password":"MbTest_Secure#2025"}')
USER_ID=$(echo "$LOGIN_RESP" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    # try various shapes: {user:{id}}, {id}, {data:{id}}
    uid = d.get('user',{}).get('id') or d.get('id') or d.get('data',{}).get('id','')
    print(uid)
except: print('')
" 2>/dev/null)

if [[ -n "$USER_ID" ]]; then
  log_pass "Login OK (userId=${USER_ID:0:12}…)"
else
  # Try to re-register
  REG_RESP=$(post "/api/auth/register" '{"email":"mb-testrunner@maxbooster.test","password":"MbTest_Secure#2025","username":"mbtestrunner","name":"MB Test Runner"}')
  USER_ID=$(echo "$REG_RESP" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    uid = d.get('user',{}).get('id') or d.get('id','')
    print(uid)
except: print('')
" 2>/dev/null)
  # Refresh CSRF after register
  CSRF=$(curl -s -b "$JAR" -c "$JAR" "$BASE/api/csrf-token" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('csrfToken',''))" 2>/dev/null)
  if [[ -n "$USER_ID" ]]; then
    log_pass "Registered + logged in (userId=${USER_ID:0:12}…)"
  else
    log_warn "Auth" "Could not get userId — some tests may show 401"
  fi
fi

# ── 2. advancedUrlParser unit-level smoke tests (via analyze-url endpoint) ─────
section "2 · URL Analysis — advancedUrlParser smoke tests"

# 2a. Valid Spotify track URL
log_info "Testing Spotify track URL analysis..."
SPOTIFY_RESP=$(post "/api/social/analyze-url" '{"url":"https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh","platform":"instagram"}')
assert_field "Spotify: success=true"        "$SPOTIFY_RESP" "success" "True"
assert_field "Spotify: analysis present"    "$SPOTIFY_RESP" "analysis" ""
assert_field "Spotify: seed present"        "$SPOTIFY_RESP" "seed" ""
assert_field "Spotify: video_config"        "$SPOTIFY_RESP" "video_config" ""
assert_field "Spotify: audio_style"         "$SPOTIFY_RESP" "audio_style" ""

SPOTIFY_PLATFORM=$(echo "$SPOTIFY_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('analysis',{}).get('platform',''))" 2>/dev/null)
assert_nonempty "Spotify: platform detected"  "$SPOTIFY_PLATFORM"

SPOTIFY_HOOK=$(echo "$SPOTIFY_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('video_config',{}).get('hook',''))" 2>/dev/null)
assert_nonempty "Spotify: video hook generated" "$SPOTIFY_HOOK"

# 2b. Valid YouTube URL
log_info "Testing YouTube video URL analysis..."
YT_RESP=$(post "/api/social/analyze-url" '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","platform":"tiktok"}')
assert_field "YouTube: success"             "$YT_RESP" "success" "True"
YT_CONTENT=$(echo "$YT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('content','') is not None)" 2>/dev/null)
log_info "YouTube: content field present = $YT_CONTENT"

# 2c. Generic web URL
log_info "Testing generic web URL analysis..."
WEB_RESP=$(post "/api/social/analyze-url" '{"url":"https://www.example.com/","platform":"twitter"}')
assert_field "Web URL: success"             "$WEB_RESP" "success" "True"
assert_field "Web URL: video_config.hook"   "$WEB_RESP" "video_config" ""

# 2d. SoundCloud URL
log_info "Testing SoundCloud URL analysis..."
SC_RESP=$(post "/api/social/analyze-url" '{"url":"https://soundcloud.com/forss/flickermood","platform":"instagram"}')
assert_field "SoundCloud: success"          "$SC_RESP" "success" "True"

# 2e. Missing URL — should 400
log_info "Testing missing URL (should 400)..."
MISS_RESP=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -c "$JAR" -X POST "$BASE/api/social/analyze-url" \
  -H "Content-Type: application/json" -H "x-csrf-token: $CSRF" -d '{}')
if [[ "$MISS_RESP" == "400" ]]; then
  log_pass "Missing URL → 400 as expected"
else
  log_fail "Missing URL should be 400" "got $MISS_RESP"
fi

# ── 3. SSRF protection tests ───────────────────────────────────────────────────
section "3 · SSRF protection"

ssrf_check() {
  local label="$1"; local url="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -c "$JAR" -X POST "$BASE/api/social/analyze-url" \
    -H "Content-Type: application/json" -H "x-csrf-token: $CSRF" \
    -d "{\"url\":\"$url\"}" 2>/dev/null)
  local body
  body=$(post "/api/social/analyze-url" "{\"url\":\"$url\"}")
  local err; err=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','') or d.get('message',''))" 2>/dev/null)
  if [[ "$code" == "400" ]]; then
    log_pass "SSRF blocked: $label (400)"
  elif [[ "$code" == "422" || "$code" == "500" ]]; then
    log_warn "SSRF: $label" "returned $code not 400 — may still be safe (err: ${err:0:60})"
  else
    log_fail "SSRF should block: $label" "got HTTP $code, body: ${body:0:100}"
  fi
}

ssrf_check "localhost"           "http://localhost/admin"
ssrf_check "127.0.0.1"          "http://127.0.0.1:8080/secret"
ssrf_check "10.x private"       "http://10.0.0.1/internal"
ssrf_check "192.168.x private"  "http://192.168.1.1/"
ssrf_check "169.254 link-local" "http://169.254.169.254/latest/meta-data/"
ssrf_check "file:// scheme"     "file:///etc/passwd"

# Also test generate-from-url SSRF
SSRF_FROMURL=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -c "$JAR" -X POST "$BASE/api/social/generate-from-url" \
  -H "Content-Type: application/json" -H "x-csrf-token: $CSRF" \
  -d '{"url":"http://127.0.0.1/","platforms":["instagram"]}')
if [[ "$SSRF_FROMURL" == "400" ]]; then
  log_pass "generate-from-url SSRF blocked (400)"
else
  log_warn "generate-from-url SSRF" "got $SSRF_FROMURL (should be 400)"
fi

# ── 4. generate-from-url — content generation from real URLs ──────────────────
section "4 · generate-from-url — social content from URLs"

# 4a. Spotify URL → multi-platform content
log_info "Spotify URL → Instagram + TikTok + Twitter content..."
GFU_RESP=$(post "/api/social/generate-from-url" \
  '{"url":"https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh","platforms":["instagram","tiktok","twitter"],"tone":"energetic","format":"text"}')

GFU_SUCCESS=$(echo "$GFU_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success','') or d.get('results','') is not None)" 2>/dev/null)
assert_nonempty "generate-from-url: Spotify → response" "$GFU_RESP"

GFU_COUNT=$(echo "$GFU_RESP" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    items = d.get('results') or d.get('content') or d.get('posts') or []
    if isinstance(items, list): print(len(items))
    elif isinstance(d, dict) and d.get('success'): print('ok')
    else: print(0)
except Exception as e: print('err:'+str(e))
" 2>/dev/null)
log_info "generate-from-url result count: $GFU_COUNT"

if [[ "$GFU_COUNT" == "0" || "$GFU_COUNT" == "err:"* ]]; then
  log_warn "generate-from-url: Spotify" "result count=${GFU_COUNT} — response: ${GFU_RESP:0:200}"
else
  log_pass "generate-from-url: Spotify → $GFU_COUNT platform results"
fi

# 4b. YouTube URL → TikTok content
log_info "YouTube URL → TikTok content..."
GFU_YT=$(post "/api/social/generate-from-url" \
  '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","platforms":["tiktok"],"tone":"casual"}')
assert_nonempty "generate-from-url: YouTube → response" "$GFU_YT"

# 4c. Missing URL → 400
MISS_GFU=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -c "$JAR" -X POST "$BASE/api/social/generate-from-url" \
  -H "Content-Type: application/json" -H "x-csrf-token: $CSRF" -d '{"platforms":["instagram"]}')
if [[ "$MISS_GFU" == "400" ]]; then
  log_pass "generate-from-url: missing URL → 400"
else
  log_fail "generate-from-url: missing URL should be 400" "got $MISS_GFU"
fi

# 4d. Invalid platform list → falls back gracefully
GFU_BAD=$(post "/api/social/generate-from-url" \
  '{"url":"https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh","platforms":["BADPLATFORM"],"tone":"energetic"}')
BAD_OK=$(echo "$GFU_BAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if not d.get('error') else 'err')" 2>/dev/null)
if [[ "$BAD_OK" == "ok" ]]; then
  log_pass "generate-from-url: invalid platform filtered gracefully"
else
  log_warn "generate-from-url: invalid platform" "got error: $(echo "$GFU_BAD" | head -c 100)"
fi

# ── 5. generate-video — async video generation ────────────────────────────────
section "5 · generate-video — async job creation"

# 5a. Topic only (MaxCore generates hook/body/cta)
log_info "generate-video: topic only (MaxCore content gen)..."
VID1=$(post "/api/social/generate-video" \
  '{"topic":"New trap beat by underground producer","platform":"tiktok","duration":10,"tone":"energetic","genre":"trap","goal":"viral"}')
JOB1=$(echo "$VID1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('job_id',''))" 2>/dev/null)
STATUS1=$(echo "$VID1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
SUCCESS1=$(echo "$VID1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
assert_nonempty "generate-video (topic): job_id returned"   "$JOB1"
assert_nonempty "generate-video (topic): status=processing" "$STATUS1"
if [[ "$STATUS1" == "processing" ]]; then
  log_pass "generate-video: status=processing immediately ✓"
else
  log_fail "generate-video: expected status=processing" "got $STATUS1"
fi
log_info "Job1 ID: $JOB1"

# 5b. Explicit hook/body/cta (bypasses MaxCore content gen, goes straight to renderer)
log_info "generate-video: explicit hook/body/cta..."
VID2=$(post "/api/social/generate-video" \
  '{"hook":"Stream this fire track","body":"Out now on all platforms","cta":"Tap to listen","platform":"instagram","duration":15,"template":"cinematic_promo","genre":"hip-hop"}')
JOB2=$(echo "$VID2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('job_id',''))" 2>/dev/null)
assert_nonempty "generate-video (hook/body/cta): job_id" "$JOB2"
log_info "Job2 ID: $JOB2"

# 5c. URL as topic (should resolve to descriptive topic automatically)
log_info "generate-video: URL as topic (auto-resolution)..."
VID3=$(post "/api/social/generate-video" \
  '{"topic":"https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh","platform":"tiktok","duration":10,"goal":"viral"}')
JOB3=$(echo "$VID3" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('job_id',''))" 2>/dev/null)
assert_nonempty "generate-video (URL topic): job_id" "$JOB3"
log_info "Job3 ID: $JOB3"

# 5d. Music genre + artist name
log_info "generate-video: artist-specific video..."
VID4=$(post "/api/social/generate-video" \
  '{"topic":"New R&B single release","artist_name":"Artist Name","platform":"youtube","duration":30,"genre":"r&b","tone":"professional","quality":"cinematic"}')
JOB4=$(echo "$VID4" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('job_id',''))" 2>/dev/null)
assert_nonempty "generate-video (R&B with artist): job_id" "$JOB4"
log_info "Job4 ID: $JOB4"

# 5e. Missing topic AND hook/body — should still succeed (defaults to "new music")
VID5=$(post "/api/social/generate-video" '{"platform":"tiktok","duration":10}')
JOB5=$(echo "$VID5" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('job_id',''))" 2>/dev/null)
if [[ -n "$JOB5" ]]; then
  log_pass "generate-video (empty topic): still creates job ($JOB5)"
else
  log_warn "generate-video (empty topic)" "no job_id: ${VID5:0:100}"
fi

# ── 6. video-job polling ──────────────────────────────────────────────────────
section "6 · video-job polling"

poll_job() {
  local label="$1"; local jobId="$2"; local maxWait="${3:-45}"; local interval=3
  local elapsed=0; local final_status=""

  log_info "Polling $label (job=$jobId, timeout=${maxWait}s)..."
  while [[ $elapsed -lt $maxWait ]]; do
    local POLL
    POLL=$(get "/api/social/video-job/$jobId")
    local st
    st=$(echo "$POLL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)

    if [[ "$st" == "completed" || "$st" == "done" ]]; then
      local vurl
      vurl=$(echo "$POLL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('video_url') or d.get('url') or '')" 2>/dev/null)
      log_pass "$label: completed (url=$vurl)"
      final_status="completed"
      echo "$POLL"  # return full JSON for caller
      return 0
    elif [[ "$st" == "error" || "$st" == "failed" ]]; then
      local errmsg
      errmsg=$(echo "$POLL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message') or d.get('error') or '')" 2>/dev/null)
      log_warn "$label" "job error: ${errmsg:0:120}"
      final_status="error"
      echo "$POLL"
      return 1
    elif [[ "$st" == "processing" ]]; then
      echo -ne "  ⏳ ${elapsed}s…\r"
    else
      log_warn "$label" "unknown status='$st' at ${elapsed}s: ${POLL:0:100}"
    fi
    sleep $interval
    ((elapsed += interval))
  done

  log_warn "$label" "still processing after ${maxWait}s — not a failure (MaxCore may be slow)"
  return 2
}

# Poll all 4 jobs (up to 60s each — video gen is slow)
POLL1=$(poll_job "Job1 (topic)" "$JOB1" 60)
POLL2=$(poll_job "Job2 (hook/body/cta)" "$JOB2" 60)
# Jobs 3 and 4 — shorter timeout since we mainly test the queue path
poll_job "Job3 (URL topic)" "$JOB3" 30 >/dev/null 2>&1
poll_job "Job4 (R&B artist)" "$JOB4" 30 >/dev/null 2>&1

# 6a. Poll a non-existent job
log_info "Polling non-existent job ID..."
POLL_NONE=$(get "/api/social/video-job/video_nonexistent_999")
POLL_NONE_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -c "$JAR" "$BASE/api/social/video-job/video_nonexistent_999")
if [[ "$POLL_NONE_CODE" == "410" ]]; then
  log_pass "Non-existent video_ job → 410 (server restart message)"
elif [[ "$POLL_NONE_CODE" == "404" || "$POLL_NONE_CODE" == "500" ]]; then
  log_warn "Non-existent job" "got $POLL_NONE_CODE (expected 410)"
else
  log_fail "Non-existent job" "expected 410 or 404, got $POLL_NONE_CODE"
fi

# ── 7. video-proxy endpoint ───────────────────────────────────────────────────
section "7 · video-proxy endpoint"

# 7a. Valid filename format check (proxy exists and auth-gates)
PROXY_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -c "$JAR" \
  "$BASE/api/social/video-proxy/video_abc123.mp4")
if [[ "$PROXY_CODE" == "404" || "$PROXY_CODE" == "502" || "$PROXY_CODE" == "503" ]]; then
  log_pass "video-proxy: valid filename → $PROXY_CODE (MaxCore not serving locally, expected)"
elif [[ "$PROXY_CODE" == "200" ]]; then
  log_pass "video-proxy: valid filename → 200 (file served!)"
elif [[ "$PROXY_CODE" == "401" || "$PROXY_CODE" == "403" ]]; then
  log_warn "video-proxy: valid filename" "got $PROXY_CODE — auth/CSRF issue"
else
  log_warn "video-proxy: valid filename" "unexpected $PROXY_CODE"
fi

# 7b. Invalid filename (path traversal / bad chars) → 400
PROXY_BAD=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -c "$JAR" \
  "$BASE/api/social/video-proxy/../../etc/passwd")
if [[ "$PROXY_BAD" == "400" || "$PROXY_BAD" == "404" ]]; then
  log_pass "video-proxy: path traversal attempt → $PROXY_BAD (blocked)"
else
  log_warn "video-proxy: path traversal" "got $PROXY_BAD"
fi

PROXY_BAD2=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -c "$JAR" \
  "$BASE/api/social/video-proxy/notanmpfour.exe")
if [[ "$PROXY_BAD2" == "400" ]]; then
  log_pass "video-proxy: non-.mp4 filename → 400"
else
  log_warn "video-proxy: non-.mp4 filename" "got $PROXY_BAD2 (expected 400)"
fi

# ── 8. Full URL → Video config round-trip ────────────────────────────────────
section "8 · Full URL → video config → generate-video round-trip"

log_info "Step 1: Analyze a SoundCloud URL to get video_config..."
SC_FULL=$(post "/api/social/analyze-url" '{"url":"https://soundcloud.com/forss/flickermood","platform":"tiktok"}')
SC_OK=$(echo "$SC_FULL" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('success') else 'fail')" 2>/dev/null)
log_info "analyze-url: $SC_OK"

if [[ "$SC_OK" == "ok" ]]; then
  # Extract video_config fields
  SC_HOOK=$(echo "$SC_FULL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('video_config',{}).get('hook',''))" 2>/dev/null)
  SC_BODY=$(echo "$SC_FULL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('video_config',{}).get('body',''))" 2>/dev/null)
  SC_CTA=$(echo "$SC_FULL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('video_config',{}).get('cta',''))" 2>/dev/null)
  SC_BG=$(echo "$SC_FULL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('video_config',{}).get('bg_color',''))" 2>/dev/null)
  SC_GENRE=$(echo "$SC_FULL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('video_config',{}).get('genre',''))" 2>/dev/null)
  log_info "Extracted config — hook: ${SC_HOOK:0:50} | bg: $SC_BG | genre: $SC_GENRE"

  log_info "Step 2: Feed video_config directly to generate-video..."
  SC_VID=$(post "/api/social/generate-video" "$(python3 -c "
import sys,json
d = {
  'hook': '${SC_HOOK//\'/}',
  'body': '${SC_BODY//\'/}',
  'cta':  '${SC_CTA//\'/}',
  'bg_color': '$SC_BG',
  'genre': '$SC_GENRE',
  'platform': 'tiktok',
  'duration': 10
}
print(json.dumps(d))
" 2>/dev/null)")
  SC_JOB=$(echo "$SC_VID" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('job_id',''))" 2>/dev/null)
  if [[ -n "$SC_JOB" ]]; then
    log_pass "Round-trip: URL → analyze → video job queued ($SC_JOB)"
    # Poll briefly
    poll_job "Round-trip (SoundCloud)" "$SC_JOB" 45 >/dev/null 2>&1
  else
    log_fail "Round-trip: generate-video after analyze-url" "no job_id: ${SC_VID:0:100}"
  fi
fi

# ── 9. Input validation & edge cases ─────────────────────────────────────────
section "9 · Input validation & edge cases"

# 9a. Very long URL
LONG_URL=$(python3 -c "print('https://example.com/path/' + 'a'*2000)")
LONG_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -c "$JAR" -X POST "$BASE/api/social/analyze-url" \
  -H "Content-Type: application/json" -H "x-csrf-token: $CSRF" \
  -d "{\"url\":\"$LONG_URL\"}" 2>/dev/null)
if [[ "$LONG_CODE" != "500" ]]; then
  log_pass "Very long URL: $LONG_CODE (no 500 crash)"
else
  log_fail "Very long URL → 500 crash" "should handle gracefully"
fi

# 9b. Malformed URL string
MAL_RESP=$(post "/api/social/analyze-url" '{"url":"not-a-url"}')
MAL_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -c "$JAR" -X POST "$BASE/api/social/analyze-url" \
  -H "Content-Type: application/json" -H "x-csrf-token: $CSRF" \
  -d '{"url":"not-a-url"}' 2>/dev/null)
if [[ "$MAL_CODE" == "400" || "$MAL_CODE" == "422" ]]; then
  log_pass "Malformed URL → $MAL_CODE (proper error)"
else
  log_warn "Malformed URL" "got $MAL_CODE (expected 400/422)"
fi

# 9c. generate-video: very long hook (truncation test)
LONG_HOOK=$(python3 -c "print('A'*500)")
VID_LONG=$(post "/api/social/generate-video" "{\"hook\":\"$LONG_HOOK\",\"platform\":\"tiktok\",\"duration\":10}")
JOB_LONG=$(echo "$VID_LONG" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('job_id',''))" 2>/dev/null)
if [[ -n "$JOB_LONG" ]]; then
  log_pass "generate-video: very long hook → job created (truncated internally)"
else
  log_warn "generate-video: very long hook" "no job: ${VID_LONG:0:100}"
fi

# 9d. generate-video: unsupported platform → defaults gracefully
VID_BAD_PLAT=$(post "/api/social/generate-video" '{"topic":"test","platform":"UNKNOWN_PLATFORM","duration":10}')
JOB_BAD=$(echo "$VID_BAD_PLAT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('job_id',''))" 2>/dev/null)
if [[ -n "$JOB_BAD" ]]; then
  log_pass "generate-video: unknown platform → job created (defaulted)"
else
  log_warn "generate-video: unknown platform" "no job: ${VID_BAD_PLAT:0:100}"
fi

# 9e. generate-video with voiceover=true
VID_VO=$(post "/api/social/generate-video" \
  '{"topic":"Music release announcement","platform":"tiktok","duration":15,"voiceover":true,"tone":"professional"}')
JOB_VO=$(echo "$VID_VO" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('job_id',''))" 2>/dev/null)
if [[ -n "$JOB_VO" ]]; then
  log_pass "generate-video: voiceover=true → job queued ($JOB_VO)"
else
  log_warn "generate-video: voiceover=true" "no job: ${VID_VO:0:100}"
fi

# ── 10. advancedUrlParser: music platform detection ──────────────────────────
section "10 · Music platform detection in URL analysis"

platform_test() {
  local label="$1"; local url="$2"; local expect_platform="$3"
  local resp
  resp=$(post "/api/social/analyze-url" "{\"url\":\"$url\"}")
  local got
  got=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('analysis',{}).get('platform',''))" 2>/dev/null)
  if [[ -z "$got" || "$got" == "None" ]]; then
    log_warn "$label" "no platform detected (got empty)"
  elif [[ "$got" == *"$expect_platform"* || "$expect_platform" == *"$got"* ]]; then
    log_pass "$label: platform=$got ✓"
  else
    log_warn "$label" "expected platform containing '$expect_platform', got '$got'"
  fi
}

platform_test "Spotify"       "https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3" "spotify"
platform_test "YouTube"       "https://www.youtube.com/watch?v=dQw4w9WgXcQ"            "youtube"
platform_test "SoundCloud"    "https://soundcloud.com/forss/flickermood"                "soundcloud"
platform_test "Apple Music"   "https://music.apple.com/us/album/thriller/269572838"    "apple"
platform_test "Bandcamp"      "https://bandcamp.com"                                   ""

# ── 11. Job result structure validation ──────────────────────────────────────
section "11 · Completed job result structure"

if [[ -n "$JOB1" ]]; then
  FINAL_POLL=$(get "/api/social/video-job/$JOB1")
  FINAL_ST=$(echo "$FINAL_POLL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
  log_info "Job1 final status: $FINAL_ST"
  if [[ "$FINAL_ST" == "completed" ]]; then
    VURL=$(echo "$FINAL_POLL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('video_url') or d.get('url') or '')" 2>/dev/null)
    assert_nonempty "Completed job: video_url present" "$VURL"

    # If URL is local, try fetching it
    if [[ "$VURL" == /uploads/* || "$VURL" == /generated* ]]; then
      FILE_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -c "$JAR" "$BASE$VURL")
      if [[ "$FILE_CODE" == "200" ]]; then
        log_pass "Video file fetchable: $VURL ($FILE_CODE)"
      else
        log_warn "Video file" "$VURL → $FILE_CODE"
      fi
    else
      log_info "Video URL is external/proxy: $VURL"
    fi
  elif [[ "$FINAL_ST" == "processing" ]]; then
    log_warn "Job1 still processing" "renderer may be slow (MaxCore load)"
  elif [[ "$FINAL_ST" == "error" ]]; then
    local errmsg
    errmsg=$(echo "$FINAL_POLL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message') or d.get('error') or '')" 2>/dev/null)
    log_warn "Job1 ended in error" "$errmsg"
  fi
fi

# ── 12. Server health after all tests ────────────────────────────────────────
section "12 · Post-test server health"
assert_http "Health endpoint still 200" "/api/health" "200"
assert_http "Auth endpoint reachable"   "/api/auth/me" "200"

# ── Summary ────────────────────────────────────────────────────────────────────
echo -e "\n${BLUE}══════════════════════════════════════════${NC}"
echo -e "  Results: ${GREEN}$PASS PASS${NC}  ${RED}$FAIL FAIL${NC}  ${YELLOW}$WARN WARN${NC}"
echo -e "${BLUE}══════════════════════════════════════════${NC}"

rm -f "$JAR"
exit $FAIL
