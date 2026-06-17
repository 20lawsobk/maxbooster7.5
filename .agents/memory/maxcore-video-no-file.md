---
name: MaxCore video render — regressed, "All scenes failed" (2026-06-17)
description: MaxCore /api/generate-video accepts jobs but every scene fails at render time. Server-side bug on secure-ai-forge.replit.app, NOT fixable from this repo.
---

# Current state (2026-06-17): BROKEN at the MaxCore render step

The video *job* is accepted and polled correctly, but the render fails on MaxCore.
This is a regression: the same pipeline produced a real 1.9 MB MP4 on 2026-06-16.

## Live evidence (reproducible)

- `GET /api/health` on `secure-ai-forge.replit.app` → `{"status":"healthy","model_loaded":true,"version":"1.0.0"}` — server is UP.
- `POST /api/generate-video` → `{"job_id":...,"status":"processing"}` ✅ (accepts the job)
- `GET /api/video-job/<id>` → `{"status":"error","error":"All scenes failed: Scene 0 failed; Scene 1 failed; ..."}` ❌
- Fails identically with a rich payload AND a minimal `{"idea":"music","platform":"tiktok","duration":5}` payload → **input-independent**; every scene throws.

## Why this is NOT a this-repo bug

The scene rendering runs entirely on the MaxCore deployment (`secure-ai-forge.replit.app`:
Vite@5000 → Node proxy@8080 → Python renderer@9878). This repo only submits the job,
polls, and (when a URL is returned) downloads the file. The "Scene N failed" aggregation
is produced by MaxCore's renderer, which swallows each scene's real exception — the actual
stack trace is ONLY in MaxCore's own server logs, not visible from here.

## Likely cause

User integrated "enhanced files" (the diffusion render pipeline,
`server/services/diffusion/gen_engine_v2/` family — ops/UNetV5/SchedulerV2/AudioSynthV2/
LTXAdapter/api_server_v5) directly into the MaxCore server between 2026-06-16 (working)
and 2026-06-17 (every scene fails). The integration most likely introduced a per-scene
runtime exception (import error, signature mismatch, missing dep, or device/op error).

## How to debug (requires MaxCore-side access — not available from this repo)

1. Read MaxCore's renderer logs (Python @ 9878) for the real per-scene exception.
2. Confirm the enhanced files were actually deployed AND the renderer process restarted.
3. Reproduce a single scene render in isolation on MaxCore to surface the stack trace.

Until the MaxCore renderer is fixed, the app's `/api/social/generate-video` job will end
in `status:"error"`. Everything else (text/caption/ad/hashtag/strategy content generation)
is healthy and unaffected.
