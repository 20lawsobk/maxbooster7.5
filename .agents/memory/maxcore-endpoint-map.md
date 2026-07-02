---
name: MaxCore endpoint map
description: Correct MaxCore API paths per architecture doc — content, image, and video generation
---

## Correct MaxCore generation endpoints

Base URL: `AI_SERVER_URL` env var (e.g. `https://secure-ai-forge.replit.app`)

| What | Path | Notes |
|---|---|---|
| Content/text gen | `POST /api/generate/content` | topic, platform, tone, genre required |
| Image gen | `POST /api/generate/image` | returns `{url: "/uploads/images/img_xxx.png"}` — relative path, prepend MAXCORE_ORIGIN |
| Video gen | `POST /api/platform/video/generate` | requires `user_id`; returns synchronous scene-script (not a job_id) |

## Video endpoint response format
`/api/platform/video/generate` returns synchronously:
```json
{
  "success": true, "user_id": "...", "title": "...", "hook": "...",
  "script": "...", "scenes": [...], "hashtags": [...], "duration_seconds": 10
}
```
- No `job_id` — do NOT attempt async polling
- No `url` — route through `renderPhotorealisticVideo` (MaxCore `/generate/image` + FFmpeg) to produce the actual MP4
- Detect by: `scenes.length > 0` OR `(success && !url && !job_id)`

## Auth
`AI_SERVER_KEY`, `AI_TRAINING_KEY_PROD`, and `ADMIN_KEY` env vars are bypass keys — they skip DB lookup and get all scopes automatically. Send as both `Authorization: Bearer <key>` AND `X-Api-Key: <key>`.

**Key priority in code:** `AI_SERVER_KEY || MAXCORE_ADMIN_KEY` — AI_SERVER_KEY is the active generation credential.

## Architecture layers
```
Our server → MaxCore Node.js Express proxy (8080)
  → enrichWithAwareness() injected into req.body.awareness automatically by MaxCore
  → Python FastAPI (9878) — actual handler
```
MaxCore's Node layer injects awareness automatically; we do not need to send it.

**Why:** `/api/generate-video` does not exist on MaxCore. `/api/platform/video/generate` is the correct endpoint per the architecture document the user shared. The old endpoint returned 404/error silently.
