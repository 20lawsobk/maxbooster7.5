---
name: MaxCore X-API-Key sweep (July 2026)
description: Second full-server sweep found 4 more services sending X-API-Key alongside Bearer; endpoints previously missing on MaxCore now exist
---

# X-API-Key debris keeps reappearing in service-local fetch helpers

**Rule:** MaxCore 401s any request carrying `X-API-Key`/`X-Admin-Key` alongside Bearer. Grep the WHOLE server for those headers whenever MaxCore calls mysteriously fail — the bug lives in scattered service-local fetch helpers, not just the shared client.

**Why:** July 2026 sweep found 4 more offenders after previous fixes: creativeModelService (its own maxcorePost/maxcoreGet), maxcoreSync (2 sites), diffusionBackgroundTrainer, hyperLearningEngine — all silently 401ing every call.

**How to apply:** `grep -rn 'X-API-Key\|X-Admin-Key' server --include=*.ts` — only allowed hits are maxcoreProxy's admin-path carve-out (`/platform/model/reload`, `/training/start-from-storage`).

# MaxCore endpoint availability changed (July 2026)

Endpoints previously non-existent NOW WORK live (200): `/api/infer/viral-score`, `/api/safety/screen`, `/api/platform/distribution/plan`, `/api/generate/text`, `/api/content/score` (needs `text` field, not `content`), `/api/generate/content` (needs `topic`+`tone`, not `prompt`). App payload builders already send correct fields. Audio remains async job-based and still fails server-side with "render timed out after 120s — memory pressure" — a MaxCore-side blocker, correctly surfaced as explicit job error.

# 500→503 mapping helper pattern

Route files with catch-all `res.status(500)` swallow AIUnavailableError's 503. Fixed in socialAI.ts + creativeModel.ts with a local `aiErrorStatus(err)` helper (instanceof check → statusCode else 500). Apply the same helper to any new AI route file.
