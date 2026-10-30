---
name: External subsystem reimport sources
description: Where external/maxcore and external/pdim come from, how to re-fetch them, and which local patches must survive a reimport
---

# Reimport sources

- `external/maxcore` ← https://github.com/20lawsobk/Secure-AI-Forge.git (public-cloneable)
- `external/pdim` ← https://github.com/20lawsobk/Pocket_dimension_storage.git (PRIVATE)

**Private-repo fetch:** the Replit GitHub connector proxy 403s `tarball/zipball` archive endpoints (redirect to codeload blocked). Working recipe: `git/trees/{branch}?recursive=1` then per-blob `git/blobs/{sha}` with `Accept: application/vnd.github.raw+json`. Throttle (~12 concurrent hits 429s; serial + retry succeeds). The repo's "size" (874MB) is git history; working tree was 2MB/293 files.

**Patches that must survive a PDIM reimport** (saved procedure: diff pristine→current before overwrite, re-apply after): ZstdEngine.ts, platform-capsule.ts (capsule flush durability), redis/manager.ts (Lua HGETALL flat-array shape — BullMQ repeatable jobs die without it), routes/index.ts, stayAliveService.ts (keepalive gating). Apply with `patch <target-file> < x.patch` (headers use absolute paths, -p strip fails).

**Why:** 2026-08-14 full reimport of both trees; MaxCore tree was byte-identical to GitHub except `.replit` (storage URLs repointed local — pdimEnvFix forces these at spawn anyway, so pristine `.replit` is safe) and SETUP.md.

**After any reimport, delete the `.replit-artifact/` marker dirs** under `external/*/artifacts/*` — they auto-register the subsystems as Replit artifacts with pnpm-filter build steps that run during publish AFTER capsule packing has removed the dirs → `No projects matched the filters` → ELIFECYCLE exit 1 → publish fails.

**How to apply:** keep node_modules across the swap when package.json is identical; nested MaxCore pnpm bootstrap can time out the boot probe on first run — run `bash scripts/bootstrap-maxcore.sh` manually then restart. Pristine MaxCore wrapper serves `/api/health` (not `/health`); supervisor + health pinger already use `/api/*` paths. rsync is not installed in this container — use tar pipes.
