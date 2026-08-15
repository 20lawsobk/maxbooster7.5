---
name: Python sidecar MaxCore URL resolution
description: Python-side callers must mirror the Node getMaxcoreOrigin() normalization or they hit the public app with doubled /api paths
---

Rule: any Python process that calls MaxCore must resolve the origin exactly like `getMaxcoreOrigin()` in the Node config: local mode (MAXCORE_LOCAL != "0") → `http://127.0.0.1:{MAXCORE_LOCAL_PORT|8090}`; remote mode → MAXCORE_URL/AI_SERVER_URL with trailing `/` AND trailing `/api` stripped.

**Why:** the AI content sidecar read `AI_SERVER_URL` raw and appended `/api{path}`. In production that env var pointed at the public app with an `/api` suffix, producing `POST /api/api/generate/content` against the app's own Express CSRF layer (403, Python-urllib UA) — the AI callback was silently broken while the sidecar returned canned fallback copy.

**How to apply:**
- Grep new Python callers for `AI_SERVER_URL` and make them use the shared resolver pattern (see `_resolve_maxcore_url` in `ai_content_sidecar.py`).
- Bearer-only auth (MaxCore 401s if X-API-Key/X-Admin-Key present); local derived key is `"mclocal-" + HMAC_SHA256(SESSION_SECRET, "maxcore-gen").hex[:40]` when no explicit key.
- MaxCore /api/generate/content returns STRUCTURED fields (caption/hook/body/cta/hashtags), not a `result` text blob — extract structured fields first or everything falls back to canned copy and failures stay invisible.
- Debug note: sidecar failures were `log.debug` (invisible at INFO); a fast (~200ms) "successful" generation with generic copy = the MaxCore call failed or was misparsed.
