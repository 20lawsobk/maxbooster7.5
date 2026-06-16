---
name: MaxCore video endpoint — fully working end-to-end (2026-06-16)
description: MaxCore renders AND delivers binary MP4. Pipeline is complete. FFmpeg fallback stays as safety net but no longer triggers in normal operation.
---

# Current state (2026-06-16): FULLY WORKING

Both render AND binary delivery are confirmed working on MaxCore (`secure-ai-forge.replit.app`).

## Confirmed live

- `POST /api/generate-video` with `{idea, platform, tone, genre, goal, duration, artist_name}` → `{job_id}` ✅
- `GET /api/video-job/<id>` → `status:"done"` with `url:"/uploads/videos/ai_<hex>.mp4"`, `width:1080`, `height:1920`, `duration:15` ✅
- `GET /uploads/videos/ai_<hex>.mp4` with `X-Admin-Key` header → `HTTP 200 video/mp4 1.9 MB ftyp` ✅

## Full pipeline (normal operation)

1. Submit `POST /api/generate-video` with `idea` field (required — 422 without it)
2. Poll `GET /api/video-job/<id>` until `status:"done"` (~10s render time)
3. `cacheVideoLocally()` downloads the file with `maxcoreAuthHeaders()` (`X-Admin-Key` + `X-API-Key` + `Authorization: Bearer`) → saves to `uploads/videos/`
4. Returns `/uploads/videos/<filename>` served via `express.static`
5. FFmpeg fallback stays dormant (only triggers when `servedUrl.startsWith("/api/social/video-proxy/")`)

## Auth chain

All endpoints require `X-Admin-Key: <key>` header.
MaxCore architecture: `secure-ai-forge.replit.app` → Vite @ 5000 → Node.js proxy @ 8080 → Python renderer @ 9878.
The 8080 proxy forwards `X-Admin-Key` to 9878. All three headers (`X-Admin-Key`, `X-API-Key`, `Authorization: Bearer`) are sent by this repo on every call.

## `idea` field requirement

MaxCore's `/api/generate-video` requires a top-level `idea` string (Pydantic 422 if absent).
Wired in:
- `advancedVideoRendererService.ts`: synthesised from `hook + artist_name + genre + topic`
- `creativeModelService.ts`: synthesised from `hooks[0] + artistName + genre + domain`

## FFmpeg scene-assembly fallback

Still in place in `advancedVideoRendererService.ts` as a safety net. Triggers only when
`cacheVideoLocally` returns a proxy-path URL AND `status.scenes?.length > 0`. Verified
independently: produces valid 179KB MP4 with `ftyp` magic from 5 MaxCore scenes.

## How to verify end-to-end

```bash
JOB=$(curl -sS -H "X-Admin-Key: $AI_SERVER_KEY" -H "Content-Type: application/json" \
  -d '{"idea":"test","platform":"tiktok","tone":"cinematic","genre":"trap","goal":"growth","duration":15,"artist_name":"Test"}' \
  "$AI_SERVER_URL/api/generate-video")
JOB_ID=$(echo "$JOB" | grep -oP '"job_id"\s*:\s*"\K[^"]+')
# poll until done, then:
curl -sS -H "X-Admin-Key: $AI_SERVER_KEY" "$AI_SERVER_URL/uploads/videos/ai_<hex>.mp4" \
  -o /tmp/test.mp4 -w "HTTP=%{http_code} type=%{content_type} size=%{size_download}\n"
od -An -c -j4 -N4 /tmp/test.mp4  # must print 'ftyp'
```
