---
name: Node proxy surface != MaxCore route surface
description: The generation/analysis/job/model /api/* paths from MaxCore docs are NOT Node routes; the Node app exposes equivalents at different, app-specific paths.
---

# Node proxy surface is NOT the MaxCore route surface

A list of "content-generation endpoints proxied through the Node layer" such as
`/api/generate/{text,image,audio,video}`, `/api/platform/{video,social,ads,daw,distribution,model}/*`,
`/api/analyze*`, `/api/safety/screen`, `/api/infer/viral-score`, `/api/predict/engagement`,
`/api/video-job(s)/*`, `/api/audio-job/*`, `/api/storage/artist/*`, `/api/content/{generate,score}`
are the **external Python/MaxCore server's own routes**, reachable only from inside Node service
code as OUTBOUND fetch URLs (e.g. creativeModelService, viralScoring). They are **NOT registered
as Express routes** in this repo — hitting them on `localhost:5000` returns the SPA/JSON 404
`"API endpoint X does not exist"`.

**Why:** these paths appear in the repo only inside comments and inside service files that CALL
MaxCore. `grep -nE "app\.use\(['\"]/api" server/routes.ts` is the source of truth for what the
Node layer actually mounts — there is no `/api/platform`, `/api/generate`, `/api/analyze`,
`/api/safety`, `/api/infer`, `/api/predict`, `/api/video-jobs`, or `/api/storage/artist` mount.

**How to apply:** to test the Node layer's generation/analysis functionality, use the REAL mounted
paths, not the MaxCore paths. Auth for protected routes = session cookie `sessionId` + Bearer
`sessionToken` from `POST /api/auth/login`, plus the `X-CSRF-Token` header set to the `csrf-token`
cookie value on POST. Equivalent capabilities live under `/api/content/generate-unified`,
`/api/music-videos/*`, `/api/maxcore/*`, `/api/advertising/*`, `/api/autopilot/*`,
`/api/distribution/*`, `/api/artist-profiles/*`, `/api/content-analysis/*`. Content-generation
routes that relay to MaxCore can be slow or return empty when MaxCore has no content (see
maxcore-* memory notes). Always re-derive exact router-relative paths + mount prefix per file;
do not trust a docs list of paths.
