---
name: MaxCore video endpoint reports done but serves no file
description: Why "MaxCore-only" video can't work from the Max Booster repo alone — the remote render endpoint either fabricates "done" or fails every scene; never delivers bytes
---

# UPDATE (2026-06-13): schema changed to require `idea`, still no working render

Re-probed live `secure-ai-forge.replit.app` after the owner said the endpoint was "fixed & tested":
- `/api/generate-video` is still the ONLY video route (all alternates — `/api/generate/video`,
  `/api/social/generate-video`, `/api/render-video`, `/api/video/generate`, etc — 404 "Cannot POST").
- The request schema CHANGED: it now REQUIRES a top-level `idea` string (FastAPI/Pydantic 422
  `{"detail":[{"loc":["body","idea"],"type":"missing"}]}`). The repo's current payload
  (`hook/body/cta/topic/platform/...`) has NO `idea`, so the repo's live calls now 422. Extra
  fields are tolerated, so adding `idea` alongside the existing body is safe & additive.
- With `idea` present it returns 200 `{job_id}` and HONESTLY attempts a render (no longer fabricates
  "done"), but the job goes to `status:"error"` within ~5s every time:
  `"All scenes failed: Scene 0 failed; Scene 1 failed; ..."`. Reproducible across minimal `{idea}`,
  rich payload+idea, and 3 spaced retries.
- Download routes still 500; `/openapi.json` also 500. So the deployment is partially broken.
**Net:** the render+serve bug is STILL server-side on MaxCore. Wiring `idea` into the repo is the
only legit client change, but it can't be validated end-to-end until MaxCore renders a scene.
**How to apply:** before claiming MaxCore video works, re-probe: submit `{idea}`, poll to `done`
(not `error`), and download real `ftyp` bytes. If scenes fail / downloads 500, escalate to the
MaxCore deployment owner — do not "complete" video wiring against a renderer that returns zero bytes.

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
