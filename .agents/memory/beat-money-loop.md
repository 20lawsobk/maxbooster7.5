---
name: Beat Money Loop production behavior
description: Admin-only autonomous beat generation/listing loop — MaxCore audio contract and fallback-chain gotchas
---

## Rules
- MaxCore `/api/generate/audio` may respond sync (`wav_b64`) OR async (`{job_id}` → poll `/api/audio-job/:id`). Callers must handle both; a 90s poll budget with fail-fast on 401/403/404 is in place.
- Bearer only — adding `X-API-Key` alongside Bearer makes MaxCore 401 (this bit the loop once).
- URL-based audio downloads must be same-origin with the MaxCore base and never forward the Bearer token elsewhere (SSRF/credential-leak guard).
- The Tier-3 "offline fallback" is NOT offline: `synthesizeToWAV` is MaxCore-gated per the fail-explicit contract. When MaxCore is fully down the whole cycle fails with AIUnavailableError — intended; do not add a local synth carve-out without user sign-off.

**Why:** MaxCore flaps (health 000 ↔ 200 within minutes) and its ffmpeg audio render times out server-side; the loop must degrade honestly rather than hang or fake success. A long gap in `next_run_at` just means the server wasn't running — the scheduler tick fires the overdue cycle on next startup.

**How to apply:** verify with the admin `run-now` endpoint (blocks 30–150s) and inspect the cycles history table for status progression or `error_message`.
