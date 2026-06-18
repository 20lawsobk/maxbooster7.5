---
name: MaxCore video — RECURRING remote scene-render failure ("All scenes failed"); app side is correct
description: "All scenes failed: Scene N failed" is a MaxCore-remote render failure (historically ffmpeg spawn EIO on a hardcoded /nix/store path). Recurs across MaxCore redeploys. This repo's submit/poll/error-handling is correct; the photorealistic path is independent and stays healthy.
---

# Status: RECURRING (remote MaxCore side). Latest recurrence 2026-06-18. Durable lessons below.

## 2026-06-18 recurrence (retest)
Retested video generation; the same signature is back: MaxCore `/api/generate-video` returns a job_id, then
`/api/video-job/:id` → `{"status":"error","error":"All scenes failed: Scene 0 failed; Scene 1 failed; Scene 2 failed"}`
in ~8s (fast-fail spawn-error signature, not a real ~10s/scene render). Confirmed via a DIRECT curl to MaxCore
(bypassing ALL app code) — identical failure — so it is unambiguously remote, not this repo. App-side pipeline
verified correct end-to-end: content gen ✅, sentiment ✅, job submit ✅, poll loop correctly detects
`status:"error"` and returns a structured failure. No app code change is warranted; the fix belongs on the
`secure-ai-forge.replit.app` deployment (see durable lesson: never bake a /nix/store ffmpeg path). MaxCore still
exposes only the aggregated error (no per-scene traceback), so confirming the exact remote cause needs the owner's
renderer logs.

Minor app-side note (NOT fixed — out of retest scope): `pollVideoJob` returns `null` for BOTH `status:"error"`
and the 150-attempt timeout, so `renderVideo`'s RETURNED `error` reads "did not complete within the polling window"
even when the true cause is "All scenes failed". The real reason IS logged at WARN; only the surfaced error string
is generic. Optional future polish: propagate the real error instead of the timeout message.

## Photorealistic path is INDEPENDENT of the scene renderer (stays healthy)
`renderVideo` with `quality:"photorealistic"` branches BEFORE the MaxCore scene-video submission: it uses MaxCore
`/generate/image` (with a Sharp genre-gradient fallback) → local FFmpeg Ken Burns → text/voice composite. During
the 2026-06-18 outage this path produced a real MP4 (`comp_photo_base_*.mp4`, ISO Media h264 1080×1920 8s) in ~14s.
So "video generation is broken" must be qualified by PATH: cinematic/scene + music-video paths share the blocked
remote renderer; the photorealistic path is local-assembly and independent. Triaging future "video broken" reports:
check which quality/path it used, and whether MaxCore `/api/video-job` returns `status:"error"`.

## Prior resolution context (2026-06-17)
End-to-end video generation worked after a MaxCore-side fix. Verified twice:
- Direct MaxCore `/api/generate-video` → `status:done`, 5 scenes, downloaded real 3 MB MP4 (`ftyp`, ISO Media).
- Through this app `/api/social/generate-video` → `/api/social/video-job/:id` → `status:"completed"`,
  `source:"MaxCoreAI"`, app served a real 5 MB MP4 (`ftyp`). The `comp_` filename prefix means the app's
  local FFmpeg scene-assembly (`assembleVideoFromScenes`) stitched MaxCore's returned scenes into the final cut.

## Root cause (from MaxCore Python renderer logs, port 9878)

"All scenes failed: Scene N failed" hid the real error:
```
[VideoRender][WARN] ffmpeg spawn OSError (attempt 1..3): [Errno 5] Input/output error:
'/nix/store/<hash>-ffmpeg-full-7.1.1-bin/bin/ffmpeg'
[VideoRender][ERROR] _render_pil_based / _render_fallback exception: [Errno 5] ... ffmpeg
[VideoRender][ERROR] Scene N returned no path
```
Every scene path (`_render_pil_based`, `_render_fallback`) shells out to ffmpeg; ffmpeg couldn't be exec'd,
so each scene returned no path → job aggregated to "All scenes failed". ~9s whole-job failure (vs ~10s/scene
real render) is the fast-fail signature of an immediate spawn error.

## Durable lesson: never hardcode a /nix/store/<hash> binary path

Nix store hashes change on every rebuild/redeploy and old entries get GC'd. A baked
`/nix/store/<hash>-ffmpeg.../bin/ffmpeg` path (in code OR an env var like `FFMPEG_BINARY` /
`IMAGEIO_FFMPEG_EXE`) points at a dead/half-GC'd entry after redeploy → spawn EIO. Resolve binaries at
runtime via PATH (`"ffmpeg"`), `shutil.which("ffmpeg")`, or `imageio_ffmpeg.get_ffmpeg_exe()`, and declare
ffmpeg as a real env dependency so it rebuilds with the environment. The integration that triggered the
redeploy was NOT the cause — the renderer code was fine; only ffmpeg invocation was broken.

## Diagnosis note for this repo

MaxCore's API only exposes `{"status":"error","error":"All scenes failed: ..."}` — no log/debug endpoint,
no traceback. The real per-scene exception lives only in the MaxCore deployment's Python process console;
to debug MaxCore-side render failures you must get those logs from the owner (they pasted them here).

## Secondary (was present, separate issue)

MaxCore logs also showed `pdim storage offline for >5000s — local-only mode`. Didn't block delivery (file
served from MaxCore's local /uploads via express.static), but worth fixing for durable persistence.
