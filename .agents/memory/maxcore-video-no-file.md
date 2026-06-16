---
name: MaxCore video endpoint — delivery blocker resolved via scene assembly fallback
description: MaxCore renders (status=done, scenes=[...]) but its Express proxy can't serve the binary file. Solved with a local FFmpeg scene-assembly fallback wired into pollVideoJob.
---

# Current state (2026-06-16): RESOLVED via local FFmpeg fallback

MaxCore's binary delivery is still broken at the proxy layer (HTTP 500 on
`/uploads/videos/*.mp4`), but the full pipeline is now working end-to-end because
`advancedVideoRendererService.ts` assembles the video locally with FFmpeg whenever
MaxCore renders scenes but can't serve the file.

## Root cause (unchanged)

MaxCore's Node.js proxy at port 8080 (in front of the Python renderer at port 9878)
tries to `upstream.json()` on binary responses — it 500s for mp4 files and JSON-wraps
JPEG preview frames. The correct auth header is `X-Admin-Key: <key>` (now also sent
alongside `X-API-Key` / `Authorization: Bearer`). Auth was NOT the cause of the 500.

## What was fixed in this repo (2026-06-16)

1. **`idea` field wired everywhere** — MaxCore's `/api/generate-video` now requires a
   top-level `idea` string (Pydantic 422 if absent). Added to:
   - `advancedVideoRendererService.ts`: synthesised from `hook + artist_name + genre + topic`
   - `creativeModelService.ts`: synthesised from `hooks[0] + artistName + genre + domain`
   Both are additive; extra legacy fields are tolerated by MaxCore.

2. **`X-Admin-Key` added to all auth headers** — `maxcoreClient.ts` `authHeaders()` and
   `advancedVideoRendererService.ts` `maxcoreAuthHeaders()` now send `X-Admin-Key` in
   addition to the previous `X-API-Key` / `Authorization: Bearer`.

3. **`assembleVideoFromScenes()` — FFmpeg local fallback** — when `pollVideoJob` gets
   `status:"done"` with `scenes:[{type,text},...]` but `cacheVideoLocally` falls back to
   the proxy path (meaning no bytes were retrieved), it now calls `assembleVideoFromScenes`.
   The function spawns sequential FFmpeg processes (one per scene) with per-type coloured
   backgrounds + centred drawtext overlays, then concat-muxes them into a final MP4.
   Output goes to `uploads/videos/ai_<jobId_prefix>_assembled.mp4`, served immediately
   via the existing `express.static` mount at `/uploads/videos`.

4. **`MaxCoreVideoStatus` interface** — typed the poll response (was `unknown`) so
   `status.scenes`, `status.width`, `status.height`, `status.duration` are accessible
   without casts.

## Verified live (2026-06-16)

- FFmpeg command syntax: exit=0, valid `ftyp` bytes for all 5 scene types (hook/build/body/drop/outro)
- Final concat: exit=0, 179 KB MP4, `ftyp` magic confirmed
- Running app serves assembled file: `HTTP 200 video/mp4 183375 bytes ftyp` ✅
- MaxCore accepts new `idea`-first payload: `{"job_id":"..."}` ✅

## How to apply

When diagnosing a "video didn't assemble" report, check the log for:
- `[AdvancedVideoRenderer] Download unavailable — assembling N scenes locally with FFmpeg`
- `[SceneAssembly] Scene X/N rendered (Ys, type)`
- `[SceneAssembly] N scenes assembled → ai_<id>_assembled.mp4`

If `assembleVideoFromScenes` silently returns `null`, check FFmpeg stderr — the last 300
chars are captured in the error message. The most common failure modes are: text
containing chars that weren't sanitised (add to the regex), or `LOCAL_VIDEO_DIR` not
writable (mkdir -p guard is already present).

Once MaxCore's proxy is fixed to stream binary, the `cacheVideoLocally` path will
succeed first and `assembleVideoFromScenes` will not trigger (the condition gates on
`servedUrl.startsWith("/api/social/video-proxy/")`, which only fires on fallback).
