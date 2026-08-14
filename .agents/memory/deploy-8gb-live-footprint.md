---
name: Replit 8GB deploy limit is a live-footprint limit
description: Why compression schemes cannot fix "image size over 8 GiB" deploy failures for this repo
---

The Reserved VM/Autoscale 8 GiB limit applies to the running app's on-disk filesystem (reset on each publish), not a transmitted archive. Confirmed via Replit docs.

**Why compression cannot fix it:** the app needs the full uncompressed files on disk to execute; and the overage here is `node_modules` + vendored `external/maxcore`/`external/pdim` library code — unrelated, byte-exact-required files with no cross-file similarity to exploit. Stacked generic compression was empirically shown to add ~0 (gzip-of-gzip: +148 bytes). Similarity-cluster/learned-codec pipelines target near-duplicate audio assets, which is not what's oversized.

**Real levers:** (1) split `external/maxcore` (~840MB) into its own deployment; (2) audit/remove unused npm deps (removed `onnxruntime-web`, `react-icons` Aug 2026); (3) `external/pdim` (~510MB) already deleted at deploy-time via `script/build.ts` when `REPLIT_DEPLOYMENT_ID` set; capsule build disabled in deploy path.

**How to apply:** if deploy fails with "total size of layers exceeds limit", do NOT reach for compression; measure `du` breakdown and remove/split actual weight. User repeatedly pushed elaborate compression-microservice blueprints as the fix — declined with the above evidence.
