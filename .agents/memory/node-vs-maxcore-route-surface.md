---
name: Node vs MaxCore route surface + the MaxCore proxy
description: The ~45 /api/generate|platform|analyze|video-job|storage/artist paths are EXTERNAL MaxCore routes, now bridged by a Node proxy; plus the durable MaxCore-side ceilings on what can ever return 200.
---

# Node vs MaxCore route surface

The `/api/generate/*`, `/api/platform/*`, `/api/analyze*`, `/api/safety/screen`,
`/api/infer/viral-score`, `/api/predict/engagement`, `/api/video-job(s)/*`,
`/api/audio-job/*`, `/api/storage/artist/*`, `/api/content/{generate,score}`,
and model routes are the **external MaxCore (FastAPI) server's own routes**, not
originally mounted in Node. To find *real* Node mounts, grep `app.use('/api`
in `server/routes.ts`.

## The proxy bridge
A generic pass-through proxy now exposes that MaxCore surface through the Node
`/api/*` layer (`server/routes/maxcoreProxy.ts`, mounted last in
`registerRoutes` in its own try block so it only catches paths no real Node
route already serves). It forwards method + originalUrl + body to
`${AI_SERVER_URL}<same path>`.

**Why last + own try block:** mounted last so it never shadows a genuine Node
route; isolated try block so an unrelated route-load failure can't disable it.

**Auth to MaxCore (critical):** Bearer ONLY (`Authorization: Bearer AI_SERVER_KEY`).
Adding `X-API-Key`/`X-Admin-Key` makes MaxCore 401 the request — EXCEPT the two
admin endpoints below, which *require* `X-Admin-Key` in addition to Bearer.

**Identity binding:** the proxy overwrites `user_id`/`userId` in POST bodies
unconditionally from `req.user.id`, and rejects path `:userId`/`:profileId` that
don't match the session (admins exempt). Do not weaken to "only-if-absent" — a
client could then act as another user under the server's privileged key.

## Durable MaxCore-side ceilings (NOT fixable from this repo)
These gate what can ever return 200 regardless of proxy correctness:
- **Admin key is stale.** `MAXCORE_ADMIN_KEY` is rejected by MaxCore ("Invalid
  admin key") → `/api/platform/model/reload` and `/api/training/start-from-storage`
  401. Same credential-drift class as the PDIM tokens.
- **MaxCore's own internal ~45s timeout** on heavy generation → `/api/platform/social/autopilot`
  and `/api/platform/daw/generate` return upstream-timeout even when reachable.
- **4 listed paths don't exist on MaxCore** (they're aliases of ones that do):
  `/api/audio/analyze` → use `/api/analyze/audio`; `/api/infer/viral-score` →
  use `/api/content/score` or `/api/predict/engagement`; `/api/safety/screen`
  and `/api/storage/artist/:id/releases` have no MaxCore implementation.
- **Whole MaxCore server goes fully unreachable intermittently** (even its root
  times out). When that happens every proxied call times out — it is a
  MaxCore outage, not a proxy bug. Verify with a direct probe to `AI_SERVER_URL/`.

## Correct request fields (MaxCore is FastAPI → 422 tells you the missing field)
MaxCore's `/openapi.json` and `/docs` are hidden behind its SPA catch-all, so
read required fields from the 422 `detail[].loc`. Known requireds:
generate/text→`mode`; generate*video / video/generate-ai→`idea`;
distribution/plan→`track_title`; ads/generate & ads/audience→`product`;
analyze→`modality`; analyze/audio→`audio_url`; predict/engagement→`action`.
With correct bodies + MaxCore up, ~28 of the listed paths return clean 200.
