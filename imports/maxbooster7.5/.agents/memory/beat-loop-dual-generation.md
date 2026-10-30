---
name: Beat loop dual-generation (full-length + 30s preview)
description: Beat loop now generates a full-length beat AND a 30s ffmpeg preview; both stored; quality fields sent to MaxCore.
---

## Rule
`beatMoneyLoopService._generateBeat()` generates ONE full-length WAV (180s default, up to 300s via `BEAT_DURATION_SECONDS`) then uses ffmpeg `-t 30 -c copy` to trim a 30s preview. Both are uploaded to storage and stored:
- full-length → `audioUrl` (beats table + listings.audio_url)
- 30s preview → `previewUrl` (listings.preview_url only — beats table has no preview_url column)

**Why:** User directive: "both 30s and full length". The listings schema already had `preview_url`; the beats schema does not. Preview trim is non-fatal — if ffmpeg fails, full URL is used as fallback.

## MaxCore quality payload (in _maxcoreAudio)
```
energy: 1.0          // was 0.8
quality: "professional"
master: true
style: productionStyles.slice(0, 5)   // was 3
context: hooks.slice(0, 5)            // was 3
```
Content generation (in _generateMaxCoreCaption) also adds `quality: "professional"` and `content_tier: "peak"`.

**How to apply:** If default duration needs to change, set `BEAT_DURATION_SECONDS` env var. If preview trim breaks a cycle, check ffmpeg output — it's wrapped in try/catch so the cycle continues without preview.
