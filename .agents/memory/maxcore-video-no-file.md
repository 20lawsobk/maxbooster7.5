---
name: MaxCore video endpoint reports done but serves no file
description: Why "MaxCore-only" video can't work from the Max Booster repo alone — the remote render endpoint either fabricates "done" or fails every scene; never delivers bytes
---

# UPDATE (2026-06-13): render now WORKS; the blocker moved to binary file DELIVERY

Re-probed live `secure-ai-forge.replit.app` after the owner said the endpoint was "fixed & tested":
- `/api/generate-video` is still the ONLY video route (all alternates — `/api/generate/video`,
  `/api/social/generate-video`, `/api/render-video`, `/api/video/generate`, etc — 404 "Cannot POST").
- Request schema CHANGED: now REQUIRES a top-level `idea` string (Pydantic 422
  `{"loc":["body","idea"],"type":"missing"}`). Documented body: `{ idea, platform, tone, genre,
  goal, duration, artist_name, scenes_override? }` (`scenes_override`=`[{index,text},...]`). The
  repo's video payload (`hook/body/cta/topic/...`) has NO `idea` → live calls 422. Extra fields
  are tolerated, so adding `idea` is safe & additive.
- Render is GENUINELY FIXED now: jobs reach `status:"done"`, `scenes_rendered:5`, `source:"datasets"`,
  with a clean `url:"/uploads/videos/ai_<hex>.mp4"`. (An earlier same-day probe hit transient
  `"All scenes failed"` — that was the model/datasets not yet loaded, NOT the steady state.)
- **The real, persistent blocker is binary DELIVERY, server-side on MaxCore (an Express front proxy):**
  - `GET /uploads/videos/<f>.mp4` → HTTP 500 "Internal Server Error" (`x-powered-by: Express`),
    with AND without auth, for both fresh and prior "done" jobs.
  - `GET /api/video-job/<id>/preview/<idx>` → 200 but `application/json`:
    `{"error":"Upstream returned non-JSON","detail":"<raw JPEG incl. 'Lavc61.19.101'>"}` — i.e. the
    Express front does `upstream.json()` on a BINARY response and wraps it, corrupting the bytes.
  - All other download conventions return the SPA `index.html` (200 text/html ~1.1KB) or 404.
  So bytes are produced but never deliverable; JSON string-escaping in the error envelope corrupts
  them, so they're not recoverable client-side either.
**Net:** still blocked at the source. MaxCore must (a) stream `/uploads/videos/*.mp4` as a binary
file and (b) stop JSON-parsing binary upstream responses (mp4/jpeg) in its Express proxy. Until
then NO Max Booster wiring yields a playable video.
**How to apply:** before claiming MaxCore video works, re-probe end-to-end: submit `{idea,...}`,
poll to `done`, then `curl /uploads/videos/<f>.mp4` and confirm real `ftyp` bytes (not a 500 or
`<!DOCTYPE`). status=done is necessary but NOT sufficient — the static mount must serve the file.

---

# MaxCore video: fabricated "done", no retrievable file

Verified by a direct live probe (submit + poll + 20 download conventions) against the
remote MaxCore at `AI_SERVER_URL` (runtime = secure-ai-forge deployment; `.replit`'s
`n.replit.app` is a placeholder overridden by a Secret).

## What MaxCore actually does
- `POST /api/generate-video` → 200 `{ "job_id": "<uuid>" }`.
- `GET /api/video-job/<id>` → 200 `{"status":"done","url":"/uploads/video_<id>.mp4", width,height,duration,...}`.
- BUT the file is **not retrievable at any path**: `/uploads/...mp4` → 404 "Not Found";
  every `/api/*` download convention (`/api/video-job/<id>/download`, `/file`, `/video`,
  `/api/video/<id>`, `/api/videos/<id>`, `/api/download/<id>`, `/api/generated/...`, etc.)
  → 500 HTML error page. Even MaxCore's OWN `/api/video-job/<id>/download` route 500s.
- The "done" is **fabricated**: job completes in <5s (first poll already done),
  `scenes:[]` yet `scenes_rendered:3`, `render_ms:null`, `source:null`, `genre_detected:null`.
- The alternate submit convention `POST /api/generate/video` (the one the port-8008
  diffusion gateway relays to) → 404 "Cannot POST" — it doesn't exist.

## Why this matters
No client-side change in the Max Booster repo (canonical client, durable queue,
infinite retry, more download paths) can manufacture bytes MaxCore never serves.
The render+serve bug lives on the **remote MaxCore deployment**, whose source is NOT
in this repo (`video_diffusion/infer/api_server.py` is only a relay/forwarder, not the
authoritative `/api/generate-video` renderer). So the directive "MaxCore must be the
only video option, working no matter what" is blocked at the source.

**Why:** building a MaxCore-only pipeline here would be correct-by-construction but
produce zero working videos until MaxCore is fixed, and would remove the local
FFmpeg/Python fallback that may still work in dev.

## How to apply
Before building OR validating any "MaxCore-only video" work, re-probe whether MaxCore
actually serves a downloadable MP4 (status=done AND a download path returns real bytes
— mp4 magic `....ftyp`). If status=done but downloads 404/500, the blocker is
server-side on the MaxCore deployment, not in this codebase — escalate rather than
hardening the client.
