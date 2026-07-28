---
name: Beat Money Loop production behavior
description: Admin-only autonomous beat generation/listing loop — MaxCore audio contract and fallback-chain gotchas
---

## Rules
- MaxCore `/api/generate/audio` may respond sync (`wav_b64`) OR async (`{job_id}` → poll `/api/audio-job/:id`). Callers must handle both; a 90s poll budget with fail-fast on 401/403/404 is in place.
- Bearer only — adding `X-API-Key` alongside Bearer makes MaxCore 401 (this bit the loop once).
- URL-based audio downloads must be same-origin with the MaxCore base and never forward the Bearer token elsewhere (SSRF/credential-leak guard).
- Generation is external-MaxCore-ONLY (user directive 2026-07-16): the Tier-3 local TS-synth fallback was REMOVED from `_generateBeat`; after Mode C and Mode B both fail, the cycle throws explicitly and is recorded as `failed`. Never re-add a local synth path without user sign-off. (Historical "ts-native" backend values in old cycle rows predate this.)

- Ad campaigns now embed the beat itself: `_renderAdVideo` (local ffmpeg, execFile arg-array) turns the beat WAV into a 45s waveform MP4; creative gets `mediaUrl` = absolute public URL (PUBLIC_BASE_URL || REPLIT_DEV_DOMAIN) + `variants.localMediaPath`; dispatcher passes `mediaLocalPath` (Twitter uploads bytes) and NULLS mediaUrl unless it's an absolute non-audio URL (never send WAV/relative paths to IG/FB/TikTok). Set PUBLIC_BASE_URL in production or URL-fetch platforms get text-only posts.

**Why:** MaxCore flaps (health 000 ↔ 200 within minutes) and its ffmpeg audio render times out server-side; the loop must degrade honestly rather than hang or fake success. A long gap in `next_run_at` just means the server wasn't running — the scheduler tick fires the overdue cycle on next startup.

**How to apply:** verify with the admin `run-now` endpoint (blocks 30–150s) and inspect the cycles history table for status progression or `error_message`.
