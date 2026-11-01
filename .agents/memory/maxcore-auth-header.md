---
name: MaxCore auth header scheme
description: External MaxCore rejects X-API-Key/X-Admin-Key with the generation key (401); only Authorization Bearer works — send Bearer ONLY. Debris recurs across scattered fetch call sites; two confirmed sweeps.
---

# MaxCore auth: Bearer only

The external MaxCore server (`secure-ai-forge.replit.app`, e.g. `/api/generate/content`)
authenticates the generation credential **only** under `Authorization: Bearer <AI_SERVER_KEY>`.

If a request ALSO carries `X-API-Key` or `X-Admin-Key` (even with the same key value),
MaxCore validates those header schemes FIRST and returns `401 {"detail":"Invalid or inactive API key"}`
**before** ever checking the Bearer token. Result: the request 401s despite a valid Bearer.

**Why:** `MaxCoreAIClient.authHeaders()` historically sent all three headers on every
call (get/poll/infer/generate/warmth). That silently 401'd EVERY MaxCore call →
`infer()` treated the 401 as non-ok → returned null → callers surfaced
"MaxCore returned no content — please retry" (500). This looked like a transient
MaxCore-empty problem but was a 100% deterministic auth failure. Direct curl proved it:
Bearer alone = 200 + content; adding X-API-Key or X-Admin-Key = 401.

**How to apply:** keep `authHeaders()` returning ONLY `{ Authorization: Bearer <MC_AI_KEY> }`.
Do NOT re-add X-API-Key / X-Admin-Key as a "defensive, send-through-all-channels" measure —
that is exactly what breaks it. If a genuinely admin-only MaxCore route ever needs a
different scheme, make it per-endpoint (e.g. `authHeaders("bearer"|"admin")`), never a
global multi-header blast. When "MaxCore returned no content" appears, probe MaxCore
directly with the exact header set the client sends and check for 401 before assuming
transient emptiness.

Only allowed hits for `grep -rn 'X-API-Key\|X-Admin-Key' server --include=*.ts` are
maxcoreProxy's admin-path carve-out (`/platform/model/reload`, `/training/start-from-storage`).

## The debris recurs — confirmed across two independent full-server sweeps

**Sweep 1:** fixing `MaxCoreAIClient.authHeaders()` was not enough — the video FILE-fetch
paths (the video download/cache helper, the voiceover audio fetch, and the video-proxy
route) each built their own header objects with the forbidden schemes, so MaxCore
rendered videos fine but every attempt to download/stream the finished MP4 401'd, and the
player showed a dead grey 0:00 box.

**Sweep 2 (July 2026):** found 4 more offenders after sweep 1's fixes —
`creativeModelService` (its own maxcorePost/maxcoreGet), `maxcoreSync` (2 sites),
`diffusionBackgroundTrainer`, `hyperLearningEngine` — all silently 401ing every call.

**How to apply:** when this class of symptom appears ("MaxCore returned no content",
"file not found on any candidate path" / all candidates fail), grep the WHOLE server for
`X-API-Key|X-Admin-Key` before debugging URLs or assuming transient emptiness — the bug
lives in scattered service-local fetch helpers, not just the shared client, and has
recurred more than once after being "fully fixed."

## MaxCore endpoint availability changed (July 2026)

Endpoints previously non-existent NOW WORK live (200): `/api/infer/viral-score`,
`/api/safety/screen`, `/api/platform/distribution/plan`, `/api/generate/text`,
`/api/content/score` (needs `text` field, not `content`), `/api/generate/content` (needs
`topic`+`tone`, not `prompt`). App payload builders already send correct fields. Audio
remains async job-based and still fails server-side with "render timed out after 120s —
memory pressure" — a MaxCore-side blocker, correctly surfaced as explicit job error.

## 500→503 mapping helper pattern

Route files with catch-all `res.status(500)` swallow `AIUnavailableError`'s 503. Fixed in
socialAI.ts + creativeModel.ts with a local `aiErrorStatus(err)` helper (instanceof check
→ statusCode else 500). Apply the same helper to any new AI route file.
