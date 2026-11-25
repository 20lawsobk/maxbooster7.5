---
name: Replit 8GiB deploy limit is an IMAGE limit — Extract & Boot capsules fix it
description: How this repo publishes under the 8GiB limit; the limit is on image layers, runtime extraction is allowed
---

The Reserved VM "image size is over the limit of 8 GiB" check applies to the **built image layers**, NOT the running VM's disk. Runtime extraction beyond the image size is allowed — proven by successful Jun/Jul/Aug 2026 publishes using Extract & Boot.

**The working mechanism (Extract & Boot):** the deploy build packs `node_modules` (and `external/maxcore`) into gzip-9 `.pdim` capsules with sha256 manifests, deletes the originals from the image, and `start.sh` runs `dist/pdim-restore.mjs` on first boot to verify + extract them (sentinel files make it idempotent; failed required restores exit(1)).

**Gate caveat:** `REPLIT_DEPLOYMENT_ID` is only set at RUNTIME, not in the deploy build container — gating build-time steps on it makes them silently skip (proven by a build log with no packing lines). Gate deploy-only build steps on an explicit flag set by the `.replit` deployment build command instead (`build = ["bash","-c","DEPLOY_PACK=1 npm run build"]`).

**How it broke:** the deploy build moved from `build.sh` (which packed capsules) to `script/build.ts` (which didn't), so images shipped full uncompressed node_modules and blew the limit. Fixed 2026-08-14 by re-adding the packing step to `script/build.ts`, gated on `REPLIT_DEPLOYMENT_ID`.

**Why:** I initially (wrongly) argued compression couldn't help because "the limit counts the live filesystem" — git history disproved this. Check `git log --grep` for prior solutions before ruling an approach out.

**Still true:** stacked/multi-pass generic compression adds ~0 (gzip-of-gzip: +148 bytes); similarity/learned codecs don't apply to byte-exact library code. Plain single-pass gzip-9 of node_modules gives ~5x (1.9GB→378MB) and that's what's needed here.
