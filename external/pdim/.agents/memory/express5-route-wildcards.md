---
name: Express 5 route wildcards
description: Correct catch-all param syntax under Express 5 / path-to-regexp v8
---

# Express 5 wildcard routes

This repo runs Express 5 (path-to-regexp@8). The old v6/v7 wildcard param syntax
`"/buckets/:bucket/objects/:key(*)"` throws at route-registration time:
`PathError: Missing parameter name at index N` — which crash-loops the server on
boot (the error fires when the route is defined, before listen).

**Use** the named splat: `"/buckets/:bucket/objects/*key"`. The captured value
`req.params.key` is an **array of already URL-decoded path segments**, so rejoin
with `"/"` (do not call `decodeURIComponent` again). See `extractKey()` in
`artifacts/api-server/src/routes/fabric.ts`.
