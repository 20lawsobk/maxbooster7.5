---
name: MaxCore video endpoint reports done but serves no file
description: Why "MaxCore-only" video can't work from the Max Booster repo alone — the remote render endpoint fabricates "done" and never delivers bytes
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
