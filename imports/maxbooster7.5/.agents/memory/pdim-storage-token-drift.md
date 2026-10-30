---
name: PDIM_* secret drift vs STORAGE_* secrets
description: PDIM_BEARER_TOKEN/PDIM_EXEC_TOKEN went stale for the same PDIM instance URL; STORAGE_BEARER_TOKEN/STORAGE_HTTP_URL are the current credentials for that same instance.
---

If PDIM calls fail with `403 WRONGPASS Invalid token for this instance` even though the external PDIM server is confirmed up (e.g. it answers other tokens/requests fine), do NOT assume PDIM is down or that the app has a request-shape bug — first compare `PDIM_EXEC_URL`/`PDIM_HTTP_EXEC_URL` against `STORAGE_HTTP_URL` and `PDIM_EXEC_TOKEN`/`PDIM_BEARER_TOKEN`/`POCKET_DIMENSION_KEY` against `STORAGE_BEARER_TOKEN` (hash-compare, never print raw secret values). In this project they pointed at the identical instance ID but carried a different token value — `STORAGE_BEARER_TOKEN` was the current one (verified via a direct PING), `PDIM_*` had gone stale.

**Why:** many independent call sites read `PDIM_EXEC_URL`/`PDIM_HTTP_EXEC_URL`/`PDIM_EXEC_TOKEN`/`PDIM_BEARER_TOKEN`/`POCKET_DIMENSION_KEY` directly from `process.env` at call time (not one central config object), so patching one file doesn't fix the rest.

**How to apply:** reconcile in one place instead of touching every call site — `server/lib/pdimEnvFix.ts` is imported as the very first line of `server/index.ts` and overwrites `process.env.PDIM_EXEC_URL/PDIM_HTTP_EXEC_URL/PDIM_EXEC_TOKEN/PDIM_BEARER_TOKEN/POCKET_DIMENSION_KEY` with the working `STORAGE_*` pair when it detects same-URL-different-token drift. If `STORAGE_*` ever also goes stale, extend/replace this reconciliation logic rather than re-litigating each of the ~10 files that read PDIM env vars directly.
