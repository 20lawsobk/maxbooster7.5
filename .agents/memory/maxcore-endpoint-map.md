---
name: MaxCore endpoint map
description: Correct MaxCore API paths per architecture doc — content, image, and video generation
---

## Correct MaxCore generation endpoints

Base URL: `AI_SERVER_URL` env var (e.g. `https://secure-ai-forge.replit.app`)

| What | Path | Notes |
|---|---|---|
| Content/text gen | `POST /api/generate/content` | topic, platform, tone, genre required |
| Image gen | `POST /api/generate/image` | returns `{outputs:[{url: "/uploads/images/img_xxx.png"}]}` — relative path, prepend MAXCORE_ORIGIN; file publicly served at that origin path |
| Audio gen | `POST /api/generate/audio` | returns async job `{job_id, status:"processing"}` — poll `GET /api/audio-job/:id` (Bearer) until `done`/`error`. Status GETs on wrong paths hit the SPA catch-all (HTML 200) — guard on JSON content-type. As of 2026-07 MaxCore errors "no real audio dataset available (mb:dataset:audio)" — server-side seeding needed before real audio returns |
| Video gen | `POST /api/platform/video/generate` | requires `user_id`; returns synchronous scene-script (not a job_id) |

## Mirroring media locally
MaxCore media URLs are relative and its /uploads may be ephemeral — mirror bytes into `public/generated-content/<kind>/` with magic-byte validation (SPA answers unknown paths HTML 200). SECURITY: only fetch MaxCore-origin URLs server-side and NEVER send the Bearer key to any other host (SSRF/key-leak — architect-flagged).

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
`AI_SERVER_KEY` is the active generation credential. **Bearer ONLY** — `Authorization: Bearer <key>` and nothing else. Sending `X-API-Key`/`X-Admin-Key` alongside (even the same value) makes MaxCore validate those schemes first and 401 every call (see maxcore-auth-header.md). Never re-add dual headers.

**Key priority in code:** `AI_SERVER_KEY || MAXCORE_ADMIN_KEY` — AI_SERVER_KEY is the active generation credential.

## Architecture layers
```
Our server → MaxCore Node.js Express proxy (8080)
  → enrichWithAwareness() injected into req.body.awareness automatically by MaxCore
  → Python FastAPI (9878) — actual handler
```
MaxCore's Node layer injects awareness automatically; we do not need to send it.

## Awareness layer = quality bridge (per user, 2026-07)
Every MaxCore generation endpoint has an advanced awareness layer wired in to bridge the content-quality gap until the external PDIM server accumulates enough datasets to match that quality natively. Visible in responses as `"=== LIVE INDUSTRY SIGNALS ==="` injected into the echoed body and `intelligence` blocks (e.g. "quality buffer active — N studied exemplars, self-sufficiency X/500"). Implications: (1) send clean params only — the awareness/quality enrichment is MaxCore-side and automatic; (2) `intelligence`/awareness fields in responses are expected metadata, not errors or bloat; (3) content quality will improve over time as PDIM dataset self-sufficiency rises — don't "fix" quality client-side by stuffing prompts.

**Why:** `/api/generate-video` does not exist on MaxCore. `/api/platform/video/generate` is the correct endpoint per the architecture document the user shared. The old endpoint returned 404/error silently.

## Content composer ignores its own intelligence (external, 2026-07)
`/api/generate/content` runs the awareness layer (response `intelligence` block shows real comprehension: keywords, audience, strategy) but the hook/body/cta composer templates the RAW topic verbatim ("Here's what nobody tells you about {topic}", body = topic echo, stock CTA). Differential probe proved it: minimal vs rich payload (context/description/audience/intent/artist_name) → byte-identical output. No request field on our side unlocks it — the fix is in MaxCore's composer (wire it to consume the intelligence block). Same pattern as the PIL image card printing its prompt. Don't re-diagnose in-app: pass-through wiring is verified clean.
