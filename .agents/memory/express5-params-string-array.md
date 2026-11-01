---
name: Express 5 req.params typing
description: ParamsDictionary values are string|string[] in Express 5 — caused ~800 server type errors
---
Express 5's `@types/express-serve-static-core` types `ParamsDictionary` values as `string | string[]` (wildcard/splat params can be arrays). Named params are always plain strings at runtime.

**Why:** This single typing change produced ~800 TS2345/TS2322/TS2769 errors across route files ("'string | string[]' not assignable to 'string'").

**How to apply:** Cast diagnosed sites `(req.params.x as string)` or destructure `= req.params as Record<string, string>` — safe for named params only. Wildcard routes (`*key`, `{*splat}`) genuinely receive arrays: handle with `Array.isArray(v) ? v.join("/") : v`. Codemods: `scripts/fix-params-string.mjs` / `fix-params-string2.mjs` (wired into fix-all.mjs). The only wildcard param routes in this repo are `/api/storage/file/*key` (routes.ts) and the static `{*splat}` catch-all.
