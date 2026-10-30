---
name: MaxCore end-to-end video job (updated)
description: MaxCore /api/generate-video now renders and serves real MP4s end-to-end; app must be pure transport with no local middlemen
---

**STALE HISTORY (pre-2026-07-14):** MaxCore's `/api/generate-video` used to fabricate `status=done` with a 404ing /uploads URL. That is FIXED on the remote deployment.

**Current, verified 2026-07-14:**
- `POST {AI_SERVER_URL}/api/generate-video` REQUIRES an `idea` field (422 without it). Returns `{job_id, status:"processing", intelligence:{...}}` (or occasionally a sync `url`).
- Poll `GET /api/video-job/{job_id}` → `{status:"done", url:"/uploads/videos/ai_*.mp4", filename, width, height, duration, scenes[...]}` in ~30-60s. The `/uploads/videos/*` URL on the MaxCore origin serves a real MP4 (valid ftyp, video/mp4) — try the raw reported URL FIRST when downloading; legacy /api/* candidate probes are fallbacks only.
- `/api/platform/video/generate` returns only a scene *script* (no file, no job_id) — wrong endpoint for full rendering.
- Auth: Bearer-only header (see maxcore-auth-header.md).

**Rule:** The video path must be pure transport — submit job, poll, cache MP4 locally, extract poster. NO local script pre-generation, scene assembly, Ken Burns, FFmpeg text compositing, or separate content/sentiment pre-calls.
**Why:** User directive (2026-07-14): the MaxCore server does everything per job itself; any local services in between bypass the job completely. All such middlemen were deleted from advancedVideoRendererService and the /generate-video route's Stage 1 pre-call was removed.
**How to apply:** Never re-add local generation steps to the video path. Failures must surface as AIUnavailableError (503), no local fallback. `fetchPhotorealisticImage` remains only for the Music Video Studio path.
