---
name: Dev-vs-prod asymmetry for capsule-restored directories (external/maxcore, python_runtime, external/pdim)
description: Why these three directories can vanish from the live dev workspace forever, and how dev now self-heals.
---

## The quirk

`script/lib/capsulePack.ts` (part of the deploy build) packs `external/maxcore`, `python_runtime`, and `external/pdim` into root-level `.pdim` capsule files and then `rmSync`s the live source directories as part of packing. This is correct/intentional for a real isolated deploy build container. But if a deploy-style build is ever run **directly inside the interactive dev workspace** (whether by accident, by a script, or by an agent), it deletes those three directories from the dev workspace too — and production's restore step (`start.sh` → `dist/pdim-restore.mjs`) never runs in dev, so before the fix below, they stayed missing forever. `maxcoreLocalSupervisor.ts`'s `backgroundRestorePending()` would then poll forever, correctly assuming (in prod) that some other process was already restoring — an assumption that's simply false in dev.

**Why this matters:** the symptom looks like "MaxCore is broken" (health checks fail, `/api/ready` shows maxcore down) but the real cause is three missing directories, not a code bug in MaxCore itself — easy to chase in the wrong place.

**How to apply / current state:** `maxcoreLocalSupervisor.ts` now has `attemptDevSelfRestore()`, gated on `isDevEnv()`, firing once per process from inside `startMaxcoreLocal()`. It checks for `dist/pdim-restore.mjs`: if present, spawns `node dist/pdim-restore.mjs background` and pipes its output into the logger; if absent (no build has ever run in this workspace), it logs a loud, actionable `logger.error` telling the operator to run `npm run build` once or restore manually, instead of polling forever with no explanation. This only runs in dev (single-process, no cluster) so it cannot race with itself the way multi-worker production clustering could. If `external/maxcore`/`python_runtime`/`external/pdim` ever go missing again in dev, check for this self-restore firing in the logs before assuming a new bug; if `dist/` doesn't exist yet, a build must run first.

Verified end-to-end by deliberately removing `external/maxcore` and confirming the self-restore fired, extracted the capsule fresh, and MaxCore came back to a genuinely healthy state (not a faked one).
