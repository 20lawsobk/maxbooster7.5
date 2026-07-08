---
name: MaxCore auth header scheme
description: External MaxCore rejects X-API-Key/X-Admin-Key with the generation key (401); only Authorization Bearer works — send Bearer ONLY.
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

**The bug recurs at scattered fetch sites, not just the shared client.** Fixing
`MaxCoreAIClient.authHeaders()` was not enough: the video FILE-fetch paths (the video
download/cache helper, the voiceover audio fetch, and the video-proxy route) each built
their own header objects with the forbidden schemes — so MaxCore rendered videos fine
but every attempt to download/stream the finished MP4 401'd, and the player showed a
dead grey 0:00 box. When this class of symptom appears ("file not found on any candidate
path" / all candidates fail), grep the WHOLE server for `X-API-Key|X-Admin-Key` before
debugging URLs.
