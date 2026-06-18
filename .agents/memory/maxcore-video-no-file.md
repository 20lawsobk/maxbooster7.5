---
name: MaxCore video — RESOLVED; root cause was ffmpeg spawn EIO on a hardcoded nix path
description: "All scenes failed" was caused by ffmpeg spawn OSError [Errno 5] against a hardcoded /nix/store/<hash> path on the MaxCore deployment. Fixed MaxCore-side; durable lesson is never bake a nix-store binary path.
---

# Status: RESOLVED (2026-06-17). Durable lesson below.

End-to-end video generation works again. Verified twice:
- Direct MaxCore `/api/generate-video` → `status:done`, 5 scenes, downloaded real 3 MB MP4 (`ftyp`, ISO Media).
- Through this app `/api/social/generate-video` → `/api/social/video-job/:id` → `status:"completed"`,
  `source:"MaxCoreAI"`, app served a real 5 MB MP4 (`ftyp`). The `comp_` filename prefix means the app's
  local FFmpeg scene-assembly (`assembleVideoFromScenes`) stitched MaxCore's returned scenes into the final cut.

## Root cause (from MaxCore Python renderer logs, port 9878)

"All scenes failed: Scene N failed" hid the real error:
```
[VideoRender][WARN] ffmpeg spawn OSError (attempt 1..3): [Errno 5] Input/output error:
'/nix/store/<hash>-ffmpeg-full-7.1.1-bin/bin/ffmpeg'
[VideoRender][ERROR] _render_pil_based / _render_fallback exception: [Errno 5] ... ffmpeg
[VideoRender][ERROR] Scene N returned no path
```
Every scene path (`_render_pil_based`, `_render_fallback`) shells out to ffmpeg; ffmpeg couldn't be exec'd,
so each scene returned no path → job aggregated to "All scenes failed". ~9s whole-job failure (vs ~10s/scene
real render) is the fast-fail signature of an immediate spawn error.

## Durable lesson: never hardcode a /nix/store/<hash> binary path

Nix store hashes change on every rebuild/redeploy and old entries get GC'd. A baked
`/nix/store/<hash>-ffmpeg.../bin/ffmpeg` path (in code OR an env var like `FFMPEG_BINARY` /
`IMAGEIO_FFMPEG_EXE`) points at a dead/half-GC'd entry after redeploy → spawn EIO. Resolve binaries at
runtime via PATH (`"ffmpeg"`), `shutil.which("ffmpeg")`, or `imageio_ffmpeg.get_ffmpeg_exe()`, and declare
ffmpeg as a real env dependency so it rebuilds with the environment. The integration that triggered the
redeploy was NOT the cause — the renderer code was fine; only ffmpeg invocation was broken.

## Diagnosis note for this repo

MaxCore's API only exposes `{"status":"error","error":"All scenes failed: ..."}` — no log/debug endpoint,
no traceback. The real per-scene exception lives only in the MaxCore deployment's Python process console;
to debug MaxCore-side render failures you must get those logs from the owner (they pasted them here).

## Secondary (was present, separate issue)

MaxCore logs also showed `pdim storage offline for >5000s — local-only mode`. Didn't block delivery (file
served from MaxCore's local /uploads via express.static), but worth fixing for durable persistence.
