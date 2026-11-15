#!/usr/bin/env bash
# Test every MaxCore endpoint exposed through server/routes/maxcoreProxy.ts
# plus the app-level MaxCore-backed routes. Reports HTTP status + body snippet.
set -u
BASE="http://127.0.0.1:5000"
JAR="/tmp/mc-proxy-cookies.txt"
rm -f "$JAR"

# ── Auth ──
curl -s -c "$JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"blawzmusic@gmail.com","password":"Iamadmin123!"}' > /dev/null
CSRF=$(curl -s -b "$JAR" -c "$JAR" "$BASE/api/csrf-token" | python3 -c "import sys,json; print(json.load(sys.stdin).get('csrfToken',''))")
if [ -z "$CSRF" ]; then echo "FATAL: no CSRF token"; exit 1; fi
echo "Auth OK, CSRF: ${CSRF:0:12}..."
echo ""

T=20  # per-call timeout (s)

req() { # method path [json-body]
  local m="$1" p="$2" b="${3:-}"
  local out code
  if [ -n "$b" ]; then
    out=$(curl -s -m $T -w "\n%{http_code}" -b "$JAR" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X "$m" "$BASE$p" -d "$b" 2>&1)
  else
    out=$(curl -s -m $T -w "\n%{http_code}" -b "$JAR" -H "x-csrf-token: $CSRF" -X "$m" "$BASE$p" 2>&1)
  fi
  code=$(echo "$out" | tail -1)
  body=$(echo "$out" | sed '$d' | head -c 180 | tr '\n' ' ')
  printf "%-4s %-52s → %s  %s\n" "$m" "$p" "$code" "$body"
}

USER_ID="31b06dba-b992-4da5-90ef-3dac95692716"

echo "══ GENERATION (POST) ══"
req POST /api/generate/content '{"prompt":"promote a new single","type":"social_post","user_id":"'$USER_ID'"}'
req POST /api/content/generate '{"prompt":"promote a new single","type":"social_post","user_id":"'$USER_ID'"}'
req POST /api/generate/text '{"prompt":"one-line hook for a rap single","user_id":"'$USER_ID'"}'
req POST /api/generate/image '{"prompt":"New single out now","user_id":"'$USER_ID'"}'
req POST /api/generate/audio '{"prompt":"upbeat intro sting","user_id":"'$USER_ID'"}'
req POST /api/generate-video '{"idea":"promote my new single","user_id":"'$USER_ID'"}'
req POST /api/generate/video '{"idea":"promote my new single","user_id":"'$USER_ID'"}'
req POST /api/video/generate-ai '{"idea":"promote my new single","user_id":"'$USER_ID'"}'

echo ""
echo "══ PLATFORM (POST) ══"
req POST /api/platform/video/generate '{"idea":"new single promo","user_id":"'$USER_ID'"}'
req POST /api/platform/social/generate '{"topic":"new single","platform":"instagram","user_id":"'$USER_ID'"}'
req POST /api/platform/social/autopilot '{"user_id":"'$USER_ID'"}'
req POST /api/platform/daw/generate '{"prompt":"trap beat 140bpm","user_id":"'$USER_ID'"}'
req POST /api/platform/distribution/plan '{"release":{"title":"Test"},"user_id":"'$USER_ID'"}'
req POST /api/platform/ads/generate '{"product":"new single","platform":"instagram","user_id":"'$USER_ID'"}'
req POST /api/platform/ads/autopilot '{"user_id":"'$USER_ID'"}'
req POST /api/platform/ads/audience '{"genre":"hip-hop","user_id":"'$USER_ID'"}'
req POST /api/platform/ads/optimize '{"campaign_id":"test","user_id":"'$USER_ID'"}'
req POST /api/platform/ads/record '{"campaign_id":"test","metrics":{},"user_id":"'$USER_ID'"}'

echo ""
echo "══ ANALYSIS / SCORING (POST) ══"
req POST /api/analyze '{"modality":"text","payload":"check out my new single","user_id":"'$USER_ID'"}'
req POST /api/analyze/sentiment '{"text":"this song is fire","user_id":"'$USER_ID'"}'
req POST /api/analyze/audio '{"url":"https://example.com/a.mp3","user_id":"'$USER_ID'"}'
req POST /api/audio/analyze '{"url":"https://example.com/a.mp3","user_id":"'$USER_ID'"}'
req POST /api/content/score '{"content":"stream my new single now","platform":"instagram","user_id":"'$USER_ID'"}'
req POST /api/safety/screen '{"content":"stream my new single now","user_id":"'$USER_ID'"}'
req POST /api/infer/viral-score '{"content":"stream my new single now","platform":"tiktok","user_id":"'$USER_ID'"}'
req POST /api/predict/engagement '{"content":"stream my new single now","platform":"instagram","user_id":"'$USER_ID'"}'

echo ""
echo "══ STORAGE / TRAINING (POST) ══"
req POST "/api/storage/artist/$USER_ID" '{"name":"B-Lawz","genre":"hip-hop"}'
req POST "/api/storage/artist/$USER_ID/releases" '{"title":"Test Single","date":"2026-07-15"}'
req POST /api/training/start-from-storage '{"user_id":"'$USER_ID'"}'
req POST /api/platform/model/reload '{}'

echo ""
echo "══ GET ROUTES ══"
req GET /api/platform/video/generate
req GET "/api/platform/ads/performance/$USER_ID"
req GET /api/video-jobs
req GET /api/video-job/00000000-0000-0000-0000-000000000000
req GET /api/video-job/00000000-0000-0000-0000-000000000000/download
req GET /api/audio-job/00000000-0000-0000-0000-000000000000
req GET "/api/storage/artist/$USER_ID"
req GET /api/platform/model/info

echo ""
echo "══ DELETE ══"
req DELETE /api/video-job/00000000-0000-0000-0000-000000000000

echo ""
echo "Done."
