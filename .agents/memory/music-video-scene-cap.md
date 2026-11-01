---
name: Music Video Studio — no app-side scene cap (MaxCore owns scene generation)
description: The Music Video Studio path intentionally has NO app-side scene-count cap; bounding scene count is MaxCore's responsibility. Do not re-introduce a cap.
---

# Decision: no app-side scene-count cap on the Music Video Studio path

The two video paths differ:
- Promo video (advancedVideoRendererService → MaxCore `/api/generate-video`): MaxCore decides scene count;
  the app assembles whatever scenes MaxCore returns. Never had a cap.
- Music Video Studio (`ai_generate_scenes=true` → `musicVideoStudioService.generateFullMusicVideo`): the app
  does LOCAL beat-section detection, then fires ONE MaxCore image request per detected section. This path
  used to default `maxScenes` to 24.

`maxScenes` is now fully optional everywhere: `undefined`/`<=0` means "render every detected section"; a
positive value is only honored when a caller explicitly passes one (no UI sends it today).

**Why:** user directive — "remove the scene generation limits, it's handled solely by the maxcore server."
Scene count should follow the song's actual structure, not an arbitrary app ceiling.

**How to apply:** do NOT re-add a default scene-count cap to this path. `generateAIScenes` fires all scene
image requests in parallel (`Promise.allSettled`), so per-render MaxCore image concurrency is bounded only
by section count + MaxCore policy. If real load pressure ever appears, add a *concurrency queue that does
not truncate scenes* (or a MaxCore-side policy) — never a scene-count cap, which is exactly what was removed.

## Verified end-to-end (retest)
The Studio render path is confirmed working: a real WAV → local beat detection → N MaxCore scenes
(scenes == detected sections) → valid ISO-Media MP4 served at HTTP 200. To get here, a SEPARATE, pre-existing
crash had to be fixed first — a dead floating template literal in `imageToVideoService.ts`'s Ken Burns
renderer threw a null-deref for pan/tilt motions and broke this path 100% of the time (see
ts-error-cleanup-codemods.md "ACTIVE CRASHER"). The scene-cap removal alone wasn't enough; the path didn't
actually render until that crasher was removed.
