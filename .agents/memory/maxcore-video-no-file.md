---
name: MaxCore video render — fails because ffmpeg can't spawn (stale nix path), NOT a code bug
description: "All scenes failed" on MaxCore is caused by ffmpeg spawn OSError [Errno 5] against a hardcoded /nix/store/<hash> path. Environment problem on the MaxCore deployment, not this repo and not the integrated TS files.
---

# Root cause (confirmed 2026-06-17 from MaxCore renderer logs)

MaxCore's `/api/generate-video` returns `{"status":"error","error":"All scenes failed: Scene N failed; ..."}`.
The generic "Scene N failed" hides the real cause, which is in MaxCore's Python renderer (port 9878):

```
[VideoRender][WARN] ffmpeg spawn OSError (attempt 1..3): [Errno 5] Input/output error:
'/nix/store/<hash>-ffmpeg-full-7.1.1-bin/bin/ffmpeg'
[VideoRender][ERROR] _render_pil_based exception: [Errno 5] ... ffmpeg
[VideoRender][ERROR] _render_fallback exception: [Errno 5] ... ffmpeg
[VideoRender][ERROR] Scene N returned no path
```

Every scene-render path (`_render_pil_based`, `_render_fallback`) shells out to ffmpeg; ffmpeg
can't be exec'd, so each scene returns no path and the job aggregates to "All scenes failed".
The ~9s whole-job failure (vs ~10s/scene for a real render) is the fast-fail signature of an
immediate spawn error, not slow rendering.

## Why it is NOT the integrated "enhanced files" (correction)

Earlier hypothesis (integration introduced a per-scene Python exception) was WRONG. The renderer
code runs fine; it just can't invoke ffmpeg. A direct API test bypassing all of THIS repo's TS
files reproduces it, and these TS files are caller-side only. The "AI enhancements/" folder is
irrelevant to this failure.

## Why ffmpeg spawn throws [Errno 5] against a /nix/store path

The renderer is invoking ffmpeg via a HARDCODED absolute nix-store path with a specific hash
(`/nix/store/<hash>-ffmpeg-full-7.1.1-bin/bin/ffmpeg`). Nix store hashes change on every
rebuild/redeploy and old entries get garbage-collected. After MaxCore was redeployed (which the
file integration triggered), that baked path points at a dead/half-GC'd store entry → spawn
fails with EIO. This is the durable lesson: **never bake a `/nix/store/<hash>` binary path into
code or env (`FFMPEG_BINARY`/`IMAGEIO_FFMPEG_EXE`); resolve it at runtime** via PATH (`"ffmpeg"`),
`shutil.which("ffmpeg")`, or `imageio_ffmpeg.get_ffmpeg_exe()`, and declare ffmpeg as a real env
dependency so it's always present.

## Fix (all on the MaxCore deployment, not this repo)

1. In MaxCore's shell: `which ffmpeg` + `ffmpeg -version`. If `which` differs from the hardcoded
   hash path, that confirms the baked path is stale.
2. Ensure ffmpeg is a declared system/nix dependency in MaxCore so it rebuilds with the env.
3. In the renderer, stop using the hardcoded path; resolve ffmpeg dynamically (PATH / shutil.which
   / imageio_ffmpeg). Clear any `FFMPEG_BINARY`/`IMAGEIO_FFMPEG_EXE` env pinned to the old path.
4. Restart MaxCore's renderer process so it picks up the valid binary.

## Secondary (not the blocker)

MaxCore logs also show `pdim storage offline for >5000s — operating in local-only mode` — its PDIM
link is down, separate from the ffmpeg issue but worth fixing for video persistence/delivery.

## This-repo note

This repo's own video fallback (`advancedVideoRendererService.ts` `assembleVideoFromScenes`) only
triggers when MaxCore returns a `scenes` array; MaxCore returns an error with zero scenes, so the
fallback can't engage. Nothing to change here until MaxCore's ffmpeg is fixed.
